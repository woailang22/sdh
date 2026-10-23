import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocket } from 'ws';
import Database from 'better-sqlite3';
import { createDb } from './db';
import { resolveGuest } from './identity';
import { GameWorld, type WorldRules } from './worldState';
import { makeItem } from '../src/game/items';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (predicate()) return; await delay(5); }
  throw Error('Fire admission timed out');
}
const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => true, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };

async function fixture(extraSource = '', expectedStderr = '', world = false) {
  const file = join(mkdtempSync(join(tmpdir(), 'sdc-fire-admission-')), 'world.sqlite');
  const db = createDb(file), a = resolveGuest(db), b = resolveGuest(db), game = new GameWorld(db, rules);
  game.connect(a.playerId, '甲'); game.connect(b.playerId, '乙'); const mapId = 'home_fire_test';
  game.state.camps[mapId] = { id: mapId, ownerId: a.playerId, ownerName: '甲', x: 150, y: 150, mapId: 'world', members: [], size: 64, level: 1 };
  for (const [id, x] of [[a.playerId, 0], [b.playerId, 1]] as const) {
    const p = game.state.players[id]; Object.assign(p, { mapId, x, y: 28, campId: id === a.playerId ? mapId : null, shield: 0 });
    p.equipment.weapon = makeItem('crude_gun', 1); p.inventory[0] = makeItem('rifle', 1); p.resources.ammo = 20;
    if (world) Object.assign(p, { mapId: 'world', x: 150 + x, y: 0, hp: 1 });
  }
  game.persist(); db.setMeta('public-house-layout', '2');
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port; await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  // Control both clocks so a busy test runner cannot advance a pending deadline
  // before a cancellation assertion. Real sockets, timers and SQLite still run;
  // actual wall-clock behavior is covered by the separate native benchmark.
  const source = `import { GameWorld } from ${JSON.stringify(pathToFileURL(resolve('server/worldState.ts')).href)};
    import { FireQueue } from ${JSON.stringify(pathToFileURL(resolve('server/fireQueue.ts')).href)};
    let clock=10000; const connect=GameWorld.prototype.connect, schedule=FireQueue.prototype.schedule;
    GameWorld.prototype.connect=function(...args){this.now=()=>clock;this.rules.monstersNear=()=>[];this.rules.buildingsNear=()=>[];return connect.apply(this,args);};
    FireQueue.prototype.schedule=function(...args){this.now=()=>clock;return schedule.apply(this,args);};
    process.on('message',m=>{clock+=m.ms;process.send({step:m.step});});
    GameWorld.prototype.tick=()=>false; ${extraSource} await import(${JSON.stringify(pathToFileURL(resolve('server.ts')).href)});`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, DB_PATH: file, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const exited = once(child, 'exit'); let started = false, stderr = '';
  child.stdout!.on('data', chunk => { started ||= String(chunk).includes('[Rift Walker]'); }); child.stderr!.on('data', chunk => { stderr += String(chunk); });
  let step = 0, receivedStep = 0; child.on('message', m => { receivedStep = (m as { step: number }).step; });
  async function advance(ms: number) { child.send({ step: ++step, ms }); await until(() => receivedStep === step); }
  const sockets: WebSocket[] = []; let stopped = false;
  async function stop() { if (!stopped) { stopped = true; child.kill('SIGKILL'); await exited; } }
  async function connect(token: string, modern = false) {
    const messages: any[] = [], url = 'http://127.0.0.1:' + port;
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws', { headers: { Cookie: 'sdc_guest=' + token, Origin: url } }); sockets.push(ws);
    ws.on('message', raw => messages.push(JSON.parse(String(raw)))); await once(ws, 'open'); await until(() => messages.some(m => m.type === 'init'));
    const send = (type: string, payload: unknown) => ws.send(JSON.stringify({ type, payload }));
    if (modern) { send('state_sync', { version: 1 }); await until(() => messages.some(m => m.type === 'game_state_patch')); }
    const replies = (id: string) => messages.map(m => m.type === 'game_state_patch' ? m.payload.state : m.type === 'game_state' ? m.payload : null).filter(s => s?.requestId === id);
    const action = (requestId: string, params: Record<string, unknown> = {}) => send('game_action', { action: 'fire', requestId, ...params });
    const reply = async (id: string) => { await until(() => replies(id).length > 0); return replies(id).at(-1); };
    return { ws, messages, send, replies, action, reply };
  }
  try { await until(() => started); } catch (error) { await stop(); throw error; }
  const savedPlayer = () => {
    const commit = db.listWorldPlayerCommits().find(row => row.id === a.playerId);
    const checkpoint = JSON.parse(db.getMeta('authoritative-world-v2')!);
    return commit ? JSON.parse(commit.data).player : checkpoint.players[a.playerId];
  };
  return { a, b, db, file, connect, stop, advance, savedPlayer, read: () => new GameWorld(createDb(file), rules), cleanup: async () => {
    for (const ws of sockets) ws.terminate(); await stop();
    if (expectedStderr) expect(stderr).toContain(expectedStderr); else expect(stderr).toBe('');
  } };
}

it.each([false, true])('delays compressed fire, coalesces duplicates and bounds the slot (%s negotiated)', async modern => {
  const f = await fixture();
  try {
    const c = await f.connect(f.a.token, modern);
    c.action('first'); expect((await c.reply('first')).error).toBeUndefined(); const firstAt = f.savedPlayer().actionAt.attack;
    c.action('pending'); c.action('pending'); c.action('overflow');
    await delay(70); expect(c.replies('pending')).toHaveLength(0);
    expect(f.savedPlayer().resources.ammo).toBe(19);
    expect((await c.reply('overflow')).error).toContain('过快');
    await f.advance(280);
    const reply = await c.reply('pending'); expect(reply.error).toBeUndefined(); expect(reply.player.resources.ammo).toBe(18);
    const secondAt = f.savedPlayer().actionAt.attack; expect(secondAt - firstAt).toBeGreaterThanOrEqual(280);
    expect(c.replies('pending')).toHaveLength(1);
    // An already committed replay remains immediate even with another slot occupied.
    c.action('third'); c.action('pending'); await until(() => c.replies('pending').length === 2);
    expect(c.replies('pending')[1].player.resources.ammo).toBe(18); expect(c.replies('third')).toHaveLength(0);
    await f.advance(280);
    expect((await c.reply('third')).error).toBeUndefined();
    expect(f.savedPlayer().actionAt.attack - secondAt).toBeGreaterThanOrEqual(280);
    await f.stop(); const restored = f.read();
    expect(restored.state.players[f.a.playerId].resources.ammo).toBe(17);
    expect(restored.state.handled[f.a.playerId]).toEqual(['first', 'pending', 'third']);
  } finally { await f.cleanup(); }
}, 15000);

it('rolls back a queued commit failure, then accepts one retry without an early acknowledgement', async () => {
  const f = await fixture(); const control = new Database(f.file);
  try {
    const a = await f.connect(f.a.token, true); a.action('first'); await a.reply('first');
    control.exec("CREATE TRIGGER reject_fire BEFORE INSERT ON world_player_commits BEGIN SELECT RAISE(ABORT, 'qa queued disk failure'); END");
    a.action('retry'); await delay(60); expect(a.replies('retry')).toHaveLength(0);
    await f.advance(280);
    expect((await a.reply('retry')).error).toContain('qa queued disk failure'); expect(f.savedPlayer().resources.ammo).toBe(19);
    control.exec('DROP TRIGGER reject_fire'); a.action('retry');
    await until(() => a.replies('retry').length === 2); expect(a.replies('retry')[1].error).toBeUndefined();
    await f.stop(); const restored = f.read();
    expect(restored.state.players[f.a.playerId].resources.ammo).toBe(18); expect(restored.state.handled[f.a.playerId]).toEqual(['first', 'retry']);
  } finally { control.close(); await f.cleanup(); }
}, 15000);

it('contains a queued reply failure without undoing its commit or crashing the timer', async () => {
  const f = await fixture("const snapshot=GameWorld.prototype.snapshotPlayer; let failed=false; GameWorld.prototype.snapshotPlayer=function(id,requestId,...rest){if(requestId==='reply-failure'&&!failed){failed=true;throw Error('qa queued reply failure');}return snapshot.call(this,id,requestId,...rest);};", 'qa queued reply failure');
  try {
    const a = await f.connect(f.a.token, true); a.action('first'); await a.reply('first'); a.action('reply-failure');
    a.send('ping', {}); await until(() => a.messages.some(m => m.type === 'pong')); await f.advance(280);
    await until(() => f.savedPlayer().resources.ammo === 18); expect(a.replies('reply-failure')).toHaveLength(0);
    a.send('ping', {}); await until(() => a.messages.some(m => m.type === 'pong'));
    a.action('reply-failure'); expect((await a.reply('reply-failure')).player.resources.ammo).toBe(18);
    await f.stop(); const restored = f.read(); expect(restored.state.handled[f.a.playerId]).toEqual(['first', 'reply-failure']);
    expect(restored.state.players[f.a.playerId].resources.ammo).toBe(18);
  } finally { await f.cleanup(); }
}, 15000);

it('executes a queued targeted hit once, but revalidates a later target that leaves the map', async () => {
  const f = await fixture();
  try {
    const a = await f.connect(f.a.token, true), b = await f.connect(f.b.token);
    a.action('first'); await a.reply('first');
    a.action('hit', { targetId: f.b.playerId }); await delay(60); expect(a.replies('hit')).toHaveLength(0);
    await f.advance(280);
    expect((await a.reply('hit')).error).toBeUndefined();
    await until(() => b.messages.some(m => m.type === 'game_state' && m.payload.player.hp < 100));
    const hitState = b.messages.filter(m => m.type === 'game_state' && m.payload.player.hp < 100).at(-1);
    expect(hitState.payload.player.hp).toBe(45);
    a.action('miss', { targetId: f.b.playerId }); b.action('leave', { action: 'leave_camp' });
    expect((await b.reply('leave')).error).toBeUndefined(); await f.advance(280); expect((await a.reply('miss')).error).toBeTruthy();
    await f.stop(); const restored = f.read();
    expect(restored.state.players[f.a.playerId].resources.ammo).toBe(18);
    expect(restored.state.handled[f.a.playerId]).toEqual(['first', 'hit']);
  } finally { await f.cleanup(); }
}, 15000);

it.each(['equipment', 'map'])('cancels old fire when %s changes and then returns to its original value', async context => {
  const f = await fixture();
  try {
    const a = await f.connect(f.a.token, true); a.action('first'); await a.reply('first'); a.action('old');
    if (context === 'equipment') {
      a.action('away', { action: 'equip', slot: 'weapon', index: 0 }); a.action('back', { action: 'equip', slot: 'weapon', index: 0 });
    } else {
      a.action('away', { action: 'leave_camp' }); a.action('back', { action: 'enter_camp', campId: 'home_fire_test' });
    }
    expect((await a.reply('away')).error).toBeUndefined(); expect((await a.reply('back')).error).toBeUndefined();
    expect((await a.reply('old')).error).toContain('取消'); await f.advance(280); await delay(320);
    await f.stop(); const restored = f.read(), p = restored.state.players[f.a.playerId];
    expect(p.equipment.weapon?.id).toBe('crude_gun'); expect(p.mapId).toBe('home_fire_test'); expect(p.resources.ammo).toBe(19);
    expect(restored.state.handled[f.a.playerId]).not.toContain('old');
  } finally { await f.cleanup(); }
}, 15000);

it('executes an already-due shot before a subsequent equipment action', async () => {
  const f = await fixture();
  try {
    const a = await f.connect(f.a.token, true); a.action('first'); await a.reply('first'); a.action('due');
    a.send('ping', {}); await until(() => a.messages.some(m => m.type === 'pong')); await f.advance(280);
    a.action('equip-after-due', { action: 'equip', slot: 'weapon', index: 0 });
    expect((await a.reply('due')).error).toBeUndefined(); expect((await a.reply('equip-after-due')).error).toBeUndefined();
    expect(a.replies('due')[0].player.equipment.weapon.id).toBe('crude_gun');
    await f.stop(); const p = f.read().state.players[f.a.playerId];
    expect(p.resources.ammo).toBe(18); expect(p.equipment.weapon?.id).toBe('rifle'); expect(p.actionAt.attack).toBe(10280);
  } finally { await f.cleanup(); }
}, 15000);

it('keeps the first pending request ID reserved even when a duplicate changes its action', async () => {
  const f = await fixture();
  try {
    const a = await f.connect(f.a.token, true); a.action('first'); await a.reply('first'); a.action('reserved');
    a.action('reserved', { action: 'equip', slot: 'weapon', index: 0 });
    a.send('ping', {}); await until(() => a.messages.some(m => m.type === 'pong'));
    expect(a.replies('reserved')).toHaveLength(0); expect(f.savedPlayer().equipment.weapon.id).toBe('crude_gun');
    await f.advance(280); expect((await a.reply('reserved')).error).toBeUndefined();
    await f.stop(); const restored = f.read(); expect(restored.state.players[f.a.playerId].equipment.weapon?.id).toBe('crude_gun');
    expect(restored.state.players[f.a.playerId].resources.ammo).toBe(18); expect(restored.state.handled[f.a.playerId]).toEqual(['first', 'reserved']);
  } finally { await f.cleanup(); }
}, 15000);

it('cancels pending input after a real lethal hit even when respawn retains the map and weapon', async () => {
  const f = await fixture('', '', true);
  try {
    const a = await f.connect(f.a.token, true), b = await f.connect(f.b.token);
    a.action('first'); await a.reply('first'); a.action('old-life');
    a.send('ping', {}); await until(() => a.messages.some(m => m.type === 'pong'));
    b.action('lethal', { targetId: f.a.playerId }); expect((await b.reply('lethal')).error).toBeUndefined();
    expect((await a.reply('old-life')).error).toContain('取消'); await f.advance(280); await delay(320);
    await f.stop(); const restored = f.read(), p = restored.state.players[f.a.playerId];
    expect(p.mapId).toBe('world'); expect(p.equipment.weapon?.id).toBe('crude_gun'); expect(p.hp).toBe(100);
    expect(p.resources.ammo).toBe(0); expect(restored.state.handled[f.a.playerId]).toEqual(['first']);
    expect(Object.values(restored.state.drops).flatMap(d => d.items).find(i => i.itemId === 'ammo')?.count).toBe(19);
  } finally { await f.cleanup(); }
}, 15000);

it.each(['disconnect', 'replacement', 'kill'])('does not spend or persist pending input after %s', async mode => {
  const f = await fixture();
  try {
    const a = await f.connect(f.a.token, true); a.action('committed'); await a.reply('committed'); a.action('not-committed');
    // The ping response proves the preceding input was read before disconnect/kill.
    a.send('ping', {}); await until(() => a.messages.some(m => m.type === 'pong'));
    expect(a.replies('not-committed')).toHaveLength(0);
    if (mode === 'disconnect') { a.ws.close(); await once(a.ws, 'close'); }
    if (mode === 'replacement') { const replacement = await f.connect(f.a.token); expect(replacement.messages[0].payload.selfId).toBe(f.a.playerId); }
    if (mode !== 'kill') { await f.advance(280); await delay(320); }
    await f.stop(); const restored = f.read();
    expect(restored.state.players[f.a.playerId].resources.ammo).toBe(19);
    expect(restored.state.handled[f.a.playerId]).toEqual(['committed']);
    expect(restored.action(f.a.playerId, { action: 'fire', requestId: 'committed' }).player.resources.ammo).toBe(19);
  } finally { await f.cleanup(); }
}, 15000);
