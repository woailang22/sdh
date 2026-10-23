import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { WebSocket } from 'ws';
import { createDb } from './db';
import { resolveGuest } from './identity';
import { GameWorld, type WorldRules } from './worldState';
import { createWorldQueries } from './worldQueries';
import { isPositionBlocked, hasLineOfSight } from '../src/game/navigation';
import { makeItem } from '../src/game/items';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const stateOf = (m: any) => m.type === 'game_state_patch' ? m.payload.state : m.type === 'game_state' ? m.payload : undefined;

it.each([
  { sameMap: true, legacyVictim: false, legacyShooter: false, failDeathSnapshot: false },
  { sameMap: false, legacyVictim: false, legacyShooter: false, failDeathSnapshot: false },
  { sameMap: true, legacyVictim: true, legacyShooter: false, failDeathSnapshot: false },
  { sameMap: false, legacyVictim: true, legacyShooter: false, failDeathSnapshot: false },
  { sameMap: true, legacyVictim: false, legacyShooter: true, failDeathSnapshot: false },
  { sameMap: true, legacyVictim: false, legacyShooter: false, failDeathSnapshot: true },
])('synchronizes hits/death sameMap=$sameMap legacyVictim=$legacyVictim legacyShooter=$legacyShooter failedReply=$failDeathSnapshot', async ({ sameMap, legacyVictim, legacyShooter, failDeathSnapshot }) => {
  const file = join(mkdtempSync(join(tmpdir(), 'sdc-combat-sync-')), 'world.sqlite'), db = createDb(file), actors = Array.from({ length: 5 }, () => resolveGuest(db));
  const rules: WorldRules = { ...createWorldQueries(), campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const mapId = sameMap ? 'world' : 'home_sync', game = new GameWorld(db, rules, () => 10000);
  const queuedVictim = !legacyShooter && !legacyVictim;
  let base = { x: 0, y: 0 };
  if (sameMap) {
    const spot = [-768, -640, -512, -384].map(x => ({ x, y: -896 })).find(p => [0, 2, 4, 6].every(dy => !isPositionBlocked(p.x, p.y + dy, rules.buildingsNear(p.x, p.y + dy))) && hasLineOfSight(p, { x: p.x, y: p.y + 2 }, rules.buildingsNear(p.x, p.y)));
    if (!spot) throw Error('No unobstructed public-world fixture'); base = spot;
  } else {
    game.state.camps.home_sync = { id: 'home_sync', ownerId: actors[0].playerId, ownerName: '射手', mapId: 'world', x: 100, y: 100, members: [], size: 64 };
    game.state.buildings.core = { id: 'core', type: 'anchor_core', name: '核心', x: 0, y: -10, hp: 1200, maxHp: 1200, level: 1, ownerId: actors[0].playerId, mapId };
  }
  game.state.camps.home_remote = { id: 'home_remote', ownerId: actors[4].playerId, ownerName: '远处玩家', mapId: 'world', x: 200, y: 200, members: [], size: 64 };
  game.state.buildings.remote_core = { id: 'remote_core', type: 'anchor_core', name: '远处核心', x: 0, y: 0, hp: 1200, maxHp: 1200, level: 1, ownerId: actors[4].playerId, mapId: 'home_remote' };
  actors.forEach((actor, i) => { game.connect(actor.playerId, '角色' + i); const p = game.state.players[actor.playerId]; Object.assign(p, i === 4 ? { mapId: 'home_remote', x: 0, y: 8, campId: 'home_remote' } : { mapId, x: base.x, y: base.y + i * 2 }); p.equipment.weapon = makeItem(i === 1 ? 'crude_gun' : 'rifle', 1); p.resources.ammo = 10; });
  game.state.players[actors[0].playerId].inventory[0] = makeItem('food', 1);
  const victim = game.state.players[actors[1].playerId]; victim.equipment.armor = makeItem('vest', 1); victim.shield = 100; victim.resources.wood = 6; game.persist(); db.setMeta('public-house-layout', '2');
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve)); const port = (probe.address() as AddressInfo).port; await new Promise<void>((resolve, reject) => probe.close(e => e ? reject(e) : resolve()));
  const source = `import { GameWorld } from ${JSON.stringify(pathToFileURL(resolve('server/worldState.ts')).href)};import { FireQueue } from ${JSON.stringify(pathToFileURL(resolve('server/fireQueue.ts')).href)};
    let clock=10000,counts={},failSnapshot=false;Date.now=()=>clock;const snapshot=GameWorld.prototype.snapshot;GameWorld.prototype.snapshot=function(id,...args){counts[id]=(counts[id]||0)+1;if(failSnapshot&&id===${JSON.stringify(actors[1].playerId)}&&this.respawnVersion(id)>0){failSnapshot=false;process.send({deathSnapshotFailed:true});throw Error('qa lost death snapshot');}return snapshot.call(this,id,...args)};
    const schedule=FireQueue.prototype.schedule;FireQueue.prototype.schedule=function(input){const ok=schedule.call(this,input);if(ok)process.send({queued:input.requestId});return ok};GameWorld.prototype.tick=function(){return false};
    process.on('message',m=>{if(m.reset)counts={};if(m.failDeathSnapshot)failSnapshot=true;if(typeof m.clock==='number')clock=m.clock;process.send({ack:m.seq,counts:${JSON.stringify(actors.map(a => a.playerId))}.map(id=>counts[id]||0)});});await import(${JSON.stringify(pathToFileURL(resolve('server.ts')).href)});`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DB_PATH: file }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const exited = once(child, 'exit'), controlDb = new Database(file), diagnostics: any[] = [], peers: { ws: WebSocket; messages: any[] }[] = [];
  let started = false, stopped = false, seq = 0;
  child.stdout!.on('data', c => { started ||= String(c).includes('[Rift Walker]'); }); child.stderr!.on('data', () => {}); child.on('message', m => diagnostics.push(m));
  const until = async (check: () => boolean) => { const end = Date.now() + 6000; while (Date.now() < end) { if (child.exitCode !== null || child.signalCode !== null) throw Error('Combat sync server stopped'); if (check()) return; await delay(5); } throw Error('Combat sync timed out'); };
  const stop = async () => { if (!stopped) { stopped = true; child.kill('SIGKILL'); await exited; } };
  const control = async (payload = {}) => { const request = ++seq; child.send({ ...payload, seq: request }); await until(() => diagnostics.some(d => d.ack === request)); return diagnostics.find(d => d.ack === request); };
  const send = (index: number, type: string, payload: unknown = {}) => peers[index].ws.send(JSON.stringify({ type, payload }));
  const action = async (index: number, payload: any) => { const start = peers[index].messages.length; send(index, 'game_action', payload); await until(() => peers[index].messages.slice(start).some(m => stateOf(m)?.requestId === payload.requestId)); return peers[index].messages.slice(start).map(stateOf).find(s => s?.requestId === payload.requestId); };
  try {
    await until(() => started); const url = 'http://127.0.0.1:' + port;
    for (const [i, actor] of actors.entries()) {
      const ws = new WebSocket(url.replace('http', 'ws') + '/ws', { headers: { Cookie: 'sdc_guest=' + actor.token, Origin: url } }), messages: any[] = []; peers.push({ ws, messages }); ws.on('message', raw => messages.push(JSON.parse(String(raw)))); ws.on('error', () => {});
      await until(() => messages.some(m => m.type === 'game_state'));
      if (i !== 3 && !(i === 1 && legacyVictim) && !(i === 0 && legacyShooter)) { send(i, 'state_sync', { version: 1 }); await until(() => messages.some(m => m.type === 'game_state_patch')); }
    }
    await control({ reset: true });
    expect((await action(0, { action: 'use_item', requestId: 'unrelated-item', index: 0, targetId: actors[4].playerId })).error).toBeUndefined();
    expect((await control()).counts[4]).toBe(0);
    expect((await action(0, { action: 'fire', requestId: 'private-before-hit' })).player.resources.ammo).toBe(9);
    expect((await action(0, { action: 'fire', requestId: 'private-before-hit', targetId: actors[4].playerId })).player.resources.ammo).toBe(9);
    expect((await control()).counts[4]).toBe(0);
    await control({ clock: 10120 });
    controlDb.exec("CREATE TRIGGER reject_hit BEFORE UPDATE ON meta WHEN NEW.k='authoritative-world-v2' BEGIN SELECT RAISE(ABORT, 'qa hit checkpoint rejected'); END");
    const shot = { action: 'fire', targetId: actors[1].playerId, requestId: 'hit' };
    expect((await action(0, shot)).error).toContain('qa hit checkpoint rejected');
    const privateCommit = JSON.parse(db.listWorldPlayerCommits().find(c => c.id === actors[0].playerId)!.data); expect(privateCommit.player.resources.ammo).toBe(9);
    controlDb.exec('DROP TRIGGER reject_hit'); await control({ reset: true }); const victimFrom = peers[1].messages.length;
    const hit = await action(0, shot); expect(hit.error).toBeUndefined(); expect(hit.player.resources.ammo).toBe(8); if (!legacyShooter) expect(hit).not.toHaveProperty('buildings');
    await until(() => peers[1].messages.slice(victimFrom).map(stateOf).some(s => s?.player.hp === 95));
    const hurt = peers[1].messages.slice(victimFrom).map(stateOf).find(s => s?.player.hp === 95); expect(hurt.requestId).toBeUndefined(); expect(hurt.player.shield).toBe(0);
    await until(() => peers[2].messages.some(m => m.type === 'player_sync' && m.payload.id === actors[1].playerId && m.payload.hp === 95));
    expect((await control()).counts).toEqual(legacyShooter ? [1, 1, 1, 1, 0] : [0, legacyVictim ? 1 : 0, 0, 0, 0]);
    expect((await action(1, { action: 'fire', requestId: 'victim-first' })).player.resources.ammo).toBe(9);
    if (queuedVictim) { await control({ clock: 10130 }); send(1, 'game_action', { action: 'fire', requestId: 'old-life-pending' }); await until(() => diagnostics.some(d => d.queued === 'old-life-pending')); }
    await control({ clock: 10240, reset: true, failDeathSnapshot }); const deathFrom = peers[1].messages.length;
    const lethal = await action(0, { ...shot, requestId: 'lethal' }); expect(lethal.error).toBeUndefined(); expect(lethal.player.resources.ammo).toBe(7); expect(lethal.drops).toHaveLength(1);
    await until(() => peers[1].messages.slice(deathFrom).map(stateOf).some(s => s?.player.mapId === 'world' && s.player.hp === 100));
    const dead = peers[1].messages.slice(deathFrom).map(stateOf).find(s => s?.player.mapId === 'world' && s.player.hp === 100);
    expect(dead.correction).toBe(true); expect(Math.hypot(dead.player.x, dead.player.y)).toBeLessThan(15); expect(dead.requestId).not.toBe('lethal'); if (!failDeathSnapshot) expect(dead.requestId).toBeUndefined();
    if (queuedVictim) await until(() => peers[1].messages.map(stateOf).some(s => s?.requestId === 'old-life-pending' && s.error?.includes('状态已变化')));
    expect(peers[1].messages.map(stateOf).some(s => s?.requestId === 'old-life-pending' && !s.error)).toBe(false);
    if (failDeathSnapshot) expect(diagnostics.some(d => d.deathSnapshotFailed)).toBe(true);
    expect((await action(0, { ...shot, requestId: 'lethal' })).player.resources.ammo).toBe(7);
    await until(() => peers[2].messages.map(stateOf).some(s => s?.drops?.length === 1) && peers[3].messages.map(stateOf).some(s => s?.drops?.length === 1));
    await stop(); const restored = new GameWorld(createDb(file), rules, () => 10240);
    expect(restored.state.players[actors[0].playerId].resources.ammo).toBe(7); expect(Object.keys(restored.state.drops)).toHaveLength(1);
    expect(Object.values(restored.state.drops)[0].items).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: 'ammo', count: 9 }), expect.objectContaining({ itemId: 'wood', count: 6 })]));
    expect(restored.state.handled[actors[1].playerId]).not.toContain('old-life-pending'); expect(controlDb.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally { await stop(); for (const peer of peers) peer.ws.terminate(); controlDb.close(); }
}, 20000);
