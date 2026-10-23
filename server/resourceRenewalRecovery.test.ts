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
import { generateWorldChunk } from '../src/game/world';
import { hasLineOfSight, isPositionBlocked } from '../src/game/navigation';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function resourceRoute() {
  const query = createWorldQueries();
  for (let cy = -2; cy <= 1; cy++) for (let cx = -4; cx <= -1; cx++) {
    for (const node of generateWorldChunk(cx, cy).interactables.filter(n => n.type === 'tree' && (n.maxStock || 0) >= 2)) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const start = { x: node.x, y: node.y - 2 };
        const points = Array.from({ length: 33 }, (_, i) => ({ x: start.x + dx * i * 1.5, y: start.y + dy * i * 1.5 }));
        if (points.every((point, i) => !isPositionBlocked(point.x, point.y, query.buildingsNear(point.x, point.y)) && hasLineOfSight(points[Math.max(0, i - 1)], point, query.buildingsNear(point.x, point.y)) && query.monstersNear(point.x, point.y).every(m => Math.hypot(m.x - point.x, m.y - point.y) > 16))) return { node, points };
      }
    }
  }
  throw Error('No quiet, unobstructed authored tree route for the fixture');
}

it('persists authored depletion, blocks camping, rolls back rejected renewal and allows a real protocol walk back to harvest once', async () => {
  const { node, points } = resourceRoute(), file = join(mkdtempSync(join(tmpdir(), 'sdc-node-renewal-')), 'world.sqlite'), db = createDb(file), guest = resolveGuest(db);
  const rules: WorldRules = { ...createWorldQueries(), campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const game = new GameWorld(db, rules, () => 10000); game.connect(guest.playerId, '采集者'); Object.assign(game.state.players[guest.playerId], points[0]); game.persist(); db.setMeta('public-house-layout', '2');
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port; await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  // Observe original production lookup results without replacing their behavior.
  const source = `import { GameWorld } from ${JSON.stringify(pathToFileURL(resolve('server/worldState.ts')).href)};
    const wrapped=new WeakSet(),connect=GameWorld.prototype.connect;GameWorld.prototype.connect=function(...args){if(!wrapped.has(this.rules)){wrapped.add(this.rules);const lookup=this.rules.nodeAt.bind(this.rules),seen=new Map();this.rules.nodeAt=id=>{const node=lookup(id);if(node){const previous=seen.get(id);if(previous)process.send({resourceLookupReused:previous===node});seen.set(id,node);}return node;};}return connect.apply(this,args);};
    let clock=10000;Date.now=()=>clock;process.on('message',m=>{clock=m.clock;process.send({clock});});await import(${JSON.stringify(pathToFileURL(resolve('server.ts')).href)});`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), DB_PATH: file }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const exited = once(child, 'exit'), control = new Database(file), peers: WebSocket[] = [], clocks: number[] = [], reused: boolean[] = [];
  let started = false, stderr = '', stopped = false, clock = 10000;
  child.stdout!.on('data', c => { started ||= String(c).includes('[Rift Walker]'); }); child.stderr!.on('data', c => { stderr += String(c); });
  child.on('message', (m: any) => { if (typeof m.clock === 'number') clocks.push(m.clock); if (typeof m.resourceLookupReused === 'boolean') reused.push(m.resourceLookupReused); });
  const until = async (predicate: () => boolean) => { const end = Date.now() + 6000; while (Date.now() < end) { if (child.exitCode !== null || child.signalCode !== null) throw Error('Production server stopped during resource renewal'); if (predicate()) return; await delay(5); } throw Error('Resource renewal timed out'); };
  const stop = async () => { if (!stopped) { stopped = true; child.kill('SIGKILL'); await exited; } };
  const url = 'http://127.0.0.1:' + port;
  const open = () => {
    const ws = new WebSocket(url.replace('http', 'ws') + '/ws', { headers: { Cookie: 'sdc_guest=' + guest.token, Origin: url } }), messages: any[] = [];
    ws.on('message', raw => messages.push(JSON.parse(String(raw)))); ws.on('error', () => {}); peers.push(ws); return { ws, messages };
  };
  const setClock = async (next: number) => { clock = next; child.send({ clock }); await until(() => clocks.includes(next)); };
  const stateOf = (m: any) => m.type === 'game_state_patch' ? m.payload.state : m.type === 'game_state' ? m.payload : undefined;
  const savedNode = () => JSON.parse(db.getMeta('authoritative-world-v2')!).nodes[node.id];
  try {
    await until(() => started); const first = open(); await until(() => first.messages.some(m => m.type === 'init'));
    const send = (peer: typeof first, type: string, payload: unknown = {}) => peer.ws.send(JSON.stringify({ type, payload }));
    const action = async (peer: typeof first, requestId: string) => { send(peer, 'game_action', { action: 'gather', targetId: node.id, requestId }); await until(() => peer.messages.some(m => stateOf(m)?.requestId === requestId)); return peer.messages.map(stateOf).find(s => s?.requestId === requestId); };
    for (let i = 0; i < node.stock!; i++) { if (i) await setClock(clock + 1000); const reply = await action(first, 'initial-gather-' + i); expect(reply.error).toBeUndefined(); expect(reply.player.resources.wood).toBe(i + 1); }
    const depleted = savedNode(); expect(depleted.stock).toBe(0); expect(depleted.respawnAt).toBe(clock + node.respawnSec! * 1000);
    // Advance less than the real idle timeout at a time and keep the socket alive.
    while (clock < depleted.respawnAt) {
      await setClock(Math.min(depleted.respawnAt, clock + 30000)); send(first, 'ping');
      await until(() => first.messages.some(m => m.type === 'pong' && m.payload.serverTime === clock));
    }
    await delay(250);
    send(first, 'state_sync', { version: 1 }); await until(() => first.messages.some(m => m.type === 'game_state_patch'));
    expect(savedNode()).toEqual(depleted);
    expect((await action(first, 'camped-gather')).error).toContain('耗尽');
    const returning = open(); await until(() => returning.messages.some(m => m.type === 'init') && returning.messages.some(m => m.type === 'game_state'));
    expect(returning.messages.find(m => m.type === 'init').payload.gameState.nodes.find((n: any) => n.id === node.id).stock).toBe(0);
    control.exec("CREATE TRIGGER reject_renewal BEFORE UPDATE ON meta WHEN NEW.k='authoritative-world-v2' BEGIN SELECT RAISE(ABORT, 'qa resource renewal failure'); END");
    const movementStart = returning.messages.length;
    const walk = async (route: typeof points) => { for (const point of route) { await setClock(clock + 500); send(returning, 'player_sync', { ...point, mapId: 'world' }); send(returning, 'ping'); await until(() => returning.messages.some(m => m.type === 'pong' && m.payload.serverTime === clock)); } };
    await walk(points.slice(1)); await setClock(clock + 5000); await until(() => stderr.includes('qa resource renewal failure'));
    expect(savedNode()).toEqual(depleted); expect(returning.messages.slice(movementStart).map(stateOf).filter(Boolean).some(s => s.correction)).toBe(false);
    send(returning, 'ping'); await until(() => returning.messages.some(m => m.type === 'pong' && m.payload.serverTime === clock)); expect((await fetch(url + '/api/health')).ok).toBe(true);
    control.exec('DROP TRIGGER reject_renewal'); await until(() => savedNode()?.stock === node.maxStock);
    expect(savedNode()).toEqual({ stock: node.maxStock, respawnAt: 0 });
    await walk(points.slice(0, -1).reverse());
    const reply = await action(returning, 'after-renewal'); expect(reply.error).toBeUndefined(); expect(reply.player.resources.wood).toBe(node.stock! + 1);
    expect(reply.player.x).toBe(points[0].x); expect(reply.player.y).toBe(points[0].y);
    send(returning, 'game_action', { action: 'gather', targetId: node.id, requestId: 'after-renewal' }); await delay(50);
    await stop(); const restored = new GameWorld(createDb(file), rules, () => clock);
    expect(restored.state.players[guest.playerId].resources.wood).toBe(node.stock! + 1); expect(restored.state.nodes[node.id].stock).toBe(node.maxStock! - 1);
    expect(restored.state.handled[guest.playerId].filter(id => id === 'after-renewal')).toHaveLength(1); expect(restored.state.handled[guest.playerId]).not.toContain('camped-gather');
    expect(reused.length).toBeGreaterThan(0); expect(reused.every(Boolean)).toBe(true);
    expect(stderr).toContain('[world] simulation tick failed'); expect(control.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally { await stop(); for (const ws of peers) ws.terminate(); control.close(); }
}, 25000);
