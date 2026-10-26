import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { createDb } from './db';
import { resolveGuest } from './identity';
import { GameWorld, type WorldRules } from './worldState';
import { createWorldQueries } from './worldQueries';
import { worldIsRoad, worldThemeAt, WORLD_LOCATIONS } from '../src/game/world';
import { isPositionBlocked } from '../src/game/navigation';
import { StateDecoder } from '../src/game/stateSync';

it('broadcasts a paid relocation to old and new observers, rejects the old entrance and preserves inventory across restart', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'sdc-camp-relocation-')), 'world.sqlite'), db = createDb(file);
  const actors = Array.from({ length: 3 }, () => resolveGuest(db));
  const queries = createWorldQueries();
  const allowed = (x: number, y: number) => Math.hypot(x, y) >= 48 && !worldIsRoad(x, y, 6) && !['lake', 'rift', 'marsh'].includes(worldThemeAt(x, y)) && WORLD_LOCATIONS.every(l => Math.hypot(l.x - x, l.y - y) >= (l.sourceMapId.startsWith('camp_') ? 48 : 20));
  const rules: WorldRules = { ...queries, campSiteAllowed: allowed, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const site = (startX: number) => {
    for (let x = startX; x > startX - 100; x -= 4) for (let y = 20; y <= 100; y += 4) {
      if (allowed(x, y) && !isPositionBlocked(x, y, queries.buildingsNear(x, y), 1.5) && queries.nodesNear(x, y).every(n => Math.hypot(n.x - x, n.y - y) >= 2) && queries.monstersNear(x, y).every(m => Math.hypot(m.x - x, m.y - y) > 16)) return { x, y };
    }
    throw Error('No valid relocation fixture site');
  };
  const original = site(-80), destination = site(original.x - 160);
  const game = new GameWorld(db, rules, () => 10_000);
  actors.forEach((a, i) => game.connect(a.playerId, ['主人', '旧址观察者', '新址观察者'][i]));
  const owner = game.state.players[actors[0].playerId]; Object.assign(owner, original); owner.resources.wood = 60; owner.resources.stone = 30;
  expect(game.action(owner.id, { action: 'create_camp', requestId: 'fixture-create', ...original }).error).toBeUndefined();
  const campId = owner.campId!; game.state.camps[campId].size = 96; game.state.camps[campId].level = 2;
  Object.assign(owner, destination, { hp: 73, shield: 12, satiety: 60 }); Object.assign(game.state.players[actors[1].playerId], original); Object.assign(game.state.players[actors[2].playerId], destination);
  game.state.buildings.storage = { id: 'storage', type: 'storage_box', name: '测试仓库', x: 3, y: 0, hp: 300, maxHp: 300, level: 1, ownerId: owner.id, mapId: campId as `home_${string}` };
  game.state.storage.storage = { wood: 7 }; game.persist(); db.setMeta('public-house-layout', '2');
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port; await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  // Freeze simulation time so a delayed periodic snapshot cannot conceal a missing action broadcast.
  const source = `Date.now=()=>10000;await import(${JSON.stringify(pathToFileURL(resolve('server.ts')).href)});`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DB_PATH: file }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit'); let started = false, stderr = '';
  child.stdout!.on('data', c => { started ||= String(c).includes('[Rift Walker]'); }); child.stderr!.on('data', c => { stderr += String(c); });
  const peers: { ws: WebSocket; states: ReturnType<GameWorld['snapshot']>[]; decoder: StateDecoder }[] = [];
  const until = async (predicate: () => boolean) => { const end = Date.now() + 6000; while (Date.now() < end) { if (child.exitCode !== null || child.signalCode !== null) throw Error('Owned relocation server stopped'); if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw Error('Relocation protocol timed out'); };
  try {
    await until(() => started); const url = 'http://127.0.0.1:' + port;
    for (const actor of actors) {
      const ws = new WebSocket(url.replace('http', 'ws') + '/ws', { headers: { Cookie: 'sdc_guest=' + actor.token, Origin: url } });
      const peer = { ws, states: [] as ReturnType<GameWorld['snapshot']>[], decoder: new StateDecoder() }; peers.push(peer);
      ws.on('message', raw => { const m = JSON.parse(String(raw)); if (m.type === 'game_state_patch') { const state = peer.decoder.decode(m.payload); if (state) peer.states.push(state); } else if (m.type === 'game_state') peer.states.push(m.payload); });
      ws.on('error', () => {}); await once(ws, 'open'); ws.send(JSON.stringify({ type: 'state_sync', payload: { version: 1 } }));
      await until(() => peer.states.some(s => !!s.player));
    }
    expect(peers[1].states.at(-1)!.camps.some(c => c.id === campId)).toBe(true);
    expect(peers[2].states.at(-1)!.camps.some(c => c.id === campId)).toBe(false);
    const action = async (index: number, requestId: string, action: string, payload = {}) => {
      const start = peers[index].states.length;
      peers[index].ws.send(JSON.stringify({ type: 'game_action', payload: { requestId, action, ...payload } }));
      await until(() => peers[index].states.slice(start).some(s => s.requestId === requestId)); return peers[index].states.slice(start).find(s => s.requestId === requestId)!;
    };
    const receipt = await action(0, 'relocate-once', 'relocate_camp', destination); expect(receipt.error).toBeUndefined();
    await until(() => !peers[1].states.at(-1)!.camps.some(c => c.id === campId) && peers[2].states.at(-1)!.camps.some(c => c.id === campId && c.x === destination.x && c.y === destination.y));
    expect(receipt.player.resources).toMatchObject({ wood: 0, stone: 0 }); expect(receipt.player).toMatchObject({ ...destination, mapId: 'world', hp: 73, shield: 12, satiety: 60 });
    expect((await action(1, 'old-entry', 'enter_camp', { campId })).error).toContain('距离过远');
    const entered = await action(2, 'new-entry', 'enter_camp', { campId }); expect(entered.error).toBeUndefined(); expect(entered.player.y).toBe(44);
    const left = await action(2, 'new-exit', 'leave_camp'); expect(left.error).toBeUndefined(); expect(left.player).toMatchObject({ mapId: 'world', ...destination });
    // Replay after the durable move must not pay again or move to another payload.
    const duplicate = await action(0, 'relocate-once', 'relocate_camp', original); expect(duplicate.player.resources.wood).toBe(0);
    child.kill('SIGKILL'); await exited;
    const restored = new GameWorld(db, rules, () => 10_000);
    expect(restored.state.camps[campId]).toMatchObject({ ...destination, size: 96, level: 2 }); expect(restored.state.storage.storage).toEqual({ wood: 7 });
    expect(restored.state.players[owner.id].resources).toMatchObject({ wood: 0, stone: 0 }); expect(stderr).toBe('');
    writeFileSync('data/camp-relocation-double-cost-protocol-results-20261026.json', JSON.stringify({ passed: true, fixture: 'Owned isolatedSQLite, seeded baseline and frozen simulation clock; actual production server/protocol, not native play', oldObserverUpdated: true, newObserverUpdated: true, oldEntryRejected: true, newEntryAndExit: true, exitY: 44, cost: { wood: 40, stone: 20 }, storageWoodPreserved: 7, replayAndRestartPreserved: true, actorCount: 3, stderrEmpty: true }, null, 2));
  } finally { for (const peer of peers) peer.ws.terminate(); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await exited; } }
}, 20_000);
