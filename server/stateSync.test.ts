import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import { createDb } from './db';
import { resolveGuest } from './identity';
import { GameWorld, type WorldRules } from './worldState';
import { makeItem } from '../src/game/items';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (predicate()) return; await delay(10); }
  throw Error('State synchronization timed out');
}

it.each(['paused', 'survival'])('keeps shared checks and door broadcasts during private fire, and full replies for legacy clients (%s)', async mode => {
  const file = join(mkdtempSync(join(tmpdir(), 'sdc-state-sync-')), 'world.sqlite');
  const db = createDb(file), a = resolveGuest(db), b = resolveGuest(db);
  const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => true, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const game = new GameWorld(db, rules); game.connect(a.playerId, '甲'); game.connect(b.playerId, '乙');
  const mapId = 'home_sync_test';
  game.state.camps[mapId] = { id: mapId, ownerId: a.playerId, ownerName: '甲', x: 100, y: 100, mapId: 'world', members: [b.playerId], size: 64, level: 1 };
  for (const [id, y] of [[a.playerId, 2], [b.playerId, 3]] as const) {
    const p = game.state.players[id]; Object.assign(p, { mapId, x: 1, y, campId: mapId });
    p.equipment.weapon = makeItem('rifle', 1); p.resources.ammo = 100;
  }
  game.state.buildings.core = { id: 'core', type: 'anchor_core', name: '核心', x: 0, y: 0, hp: 1200, maxHp: 1200, level: 1, ownerId: a.playerId, mapId };
  game.state.buildings.door = { id: 'door', type: 'door', name: '门', x: 2, y: 2, hp: 650, maxHp: 650, level: 1, ownerId: a.playerId, mapId, isOpen: false };
  game.persist(); db.setMeta('public-house-layout', '2');
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port; await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  // Isolate the periodic synchronization contract from survival ticks that
  // normally mark state dirty every second. This is not a performance fixture.
  const source = `import { GameWorld } from ${JSON.stringify(pathToFileURL(resolve('server/worldState.ts')).href)}; const tick=GameWorld.prototype.tick; GameWorld.prototype.tick=function(){const changed=${mode === 'paused' ? 'false' : 'tick.call(this)'};process.send?.({changed,shared:this.sharedTickChanged});return changed;}; await import(${JSON.stringify(pathToFileURL(resolve('server.ts')).href)});`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, DB_PATH: file, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const exited = once(child, 'exit'); let started = false, stderr = '';
  const ticks: { changed: boolean; shared: boolean }[] = [];
  child.on('message', message => { ticks.push(message as { changed: boolean; shared: boolean }); });
  child.stdout!.on('data', chunk => { started ||= String(chunk).includes('[Rift Walker]'); });
  child.stderr!.on('data', chunk => { stderr += String(chunk); });
  const sockets: WebSocket[] = [];
  try {
    await until(() => started);
    async function connect(token: string) {
      const messages: any[] = [], url = 'http://127.0.0.1:' + port;
      const ws = new WebSocket(url.replace('http', 'ws') + '/ws', { headers: { Cookie: 'sdc_guest=' + token, Origin: url } }); sockets.push(ws);
      ws.on('message', raw => messages.push(JSON.parse(String(raw))));
      await once(ws, 'open'); await until(() => messages.some(m => m.type === 'init'));
      return { ws, messages, send: (type: string, payload: unknown) => ws.send(JSON.stringify({ type, payload })) };
    }
    const modern = await connect(a.token), legacy = await connect(b.token);
    modern.send('state_sync', { version: 1 });
    await until(() => modern.messages.some(m => m.type === 'game_state_patch'));
    legacy.send('game_action', { action: 'fire', requestId: 'legacy-fire' });
    await until(() => legacy.messages.some(m => m.payload?.requestId === 'legacy-fire'));
    const legacyReply = legacy.messages.find(m => m.payload?.requestId === 'legacy-fire');
    expect(legacyReply.type).toBe('game_state'); expect(legacyReply.payload.player.resources.ammo).toBe(99);
    expect(legacyReply.payload.buildings).toHaveLength(2);
    modern.send('game_action', { action: 'toggle_door', targetId: 'door', requestId: 'shared-door' });
    await until(() => legacy.messages.some(m => m.type === 'game_state' && m.payload.buildings?.find((v: any) => v.id === 'door')?.isOpen));
    await until(() => modern.messages.some(m => m.payload?.state?.requestId === 'shared-door'));
    const began = Date.now(); let sent = 0;
    while (Date.now() - began < 2800) { modern.send('game_action', { action: 'fire', requestId: 'private-' + sent++ }); await delay(200); }
    await until(() => modern.messages.filter(m => m.payload?.state?.requestId?.startsWith('private-')).length === sent);
    const replies = modern.messages.filter(m => m.payload?.state?.requestId?.startsWith('private-'));
    expect(replies.every(m => !m.payload.state.error && !Object.hasOwn(m.payload.state, 'buildings'))).toBe(true);
    expect(replies.at(-1).payload.state.player.resources.ammo).toBe(100 - sent);
    expect(modern.messages.some(m => m.type === 'game_state_patch' && m.payload.baseSequence !== null && !m.payload.state.requestId)).toBe(true);
    if (mode === 'survival') {
      expect(ticks.some(t => t.changed && !t.shared)).toBe(true); expect(ticks.some(t => t.shared)).toBe(false);
      expect(replies.at(-1).payload.state.player.satiety).toBeLessThan(100);
      expect(legacy.messages.some(m => m.type === 'game_state' && !m.payload.requestId && m.payload.player.satiety < 100)).toBe(true);
    }
    expect(stderr).toBe('');
  } finally {
    for (const ws of sockets) ws.terminate();
    child.kill('SIGKILL'); await exited;
  }
}, 15000);
