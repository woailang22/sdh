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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate: () => boolean) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { if (predicate()) return; await delay(5); }
  throw Error('Refresh synchronization timed out');
}

it('spreads complete refreshes of eight actual server connections without delaying live updates', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'sdc-state-refresh-')), 'world.sqlite'), db = createDb(file);
  const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const game = new GameWorld(db, rules), actors = Array.from({ length: 8 }, () => resolveGuest(db));
  for (const actor of actors) { game.connect(actor.playerId, '行者'); game.state.players[actor.playerId].mapId = 'home_refresh_test'; }
  game.persist(); db.setMeta('public-house-layout', '2');
  const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port; await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  // Only the encoder clock and unrelated simulation are controlled. Production
  // connection allocation, periodic loop, snapshots and transport remain real.
  const source = `import { GameWorld } from ${JSON.stringify(pathToFileURL(resolve('server/worldState.ts')).href)};
    import { StateEncoder } from ${JSON.stringify(pathToFileURL(resolve('src/game/stateSync.ts')).href)};
    let clock=0;process.on('message',m=>{clock=m.clock;});GameWorld.prototype.tick=()=>true;
    const encode=StateEncoder.prototype.encode,privateEncode=StateEncoder.prototype.encodePlayer;
    StateEncoder.prototype.encode=function(state){const patch=encode.call(this,state,clock);if(patch.baseSequence===null)process.send({kind:'full',at:clock,id:state.player.id});process.send({kind:'seen',at:clock,id:state.player.id});return patch;};
    StateEncoder.prototype.encodePlayer=function(state,full){const patch=privateEncode.call(this,state,full,clock);process.send({kind:'seen',at:clock,id:state.player.id});return patch;};
    await import(${JSON.stringify(pathToFileURL(resolve('server.ts')).href)});`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, DB_PATH: file, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const exited = once(child, 'exit'), events: { kind: string; at: number; id: string }[] = [], sockets: WebSocket[] = [];
  let started = false, stderr = '';
  child.stdout!.on('data', chunk => { started ||= String(chunk).includes('[Rift Walker]'); }); child.stderr!.on('data', chunk => { stderr += String(chunk); });
  child.on('message', m => events.push(m as typeof events[number]));
  try {
    await until(() => started);
    async function connect(actor: typeof actors[number]) {
      const before = events.filter(e => e.kind === 'full' && e.at === 0 && e.id === actor.playerId).length;
      const url = 'http://127.0.0.1:' + port, ws = new WebSocket(url.replace('http', 'ws') + '/ws', { headers: { Cookie: 'sdc_guest=' + actor.token, Origin: url } });
      sockets.push(ws); await once(ws, 'open'); ws.send(JSON.stringify({ type: 'state_sync', payload: { version: 1 } }));
      await until(() => events.filter(e => e.kind === 'full' && e.at === 0 && e.id === actor.playerId).length > before);
    }
    for (const actor of actors) await connect(actor);
    await until(() => new Set(events.filter(e => e.kind === 'full' && e.at === 0).map(e => e.id)).size === 8);
    // Connection churn must not make this identity collide with an active
    // connection after the phase counter has rotated through occupied slots.
    for (let reconnect = 0; reconnect < 18; reconnect++) await connect(actors[7]);
    for (let clock = 200; clock <= 5000; clock += 200) {
      child.send({ clock });
      await until(() => new Set(events.filter(e => e.kind === 'seen' && e.at === clock).map(e => e.id)).size === 8);
    }
    const full = events.filter(e => e.kind === 'full' && e.at > 0), counts = new Map<number, number>();
    for (const e of full) counts.set(e.at, (counts.get(e.at) || 0) + 1);
    expect(full).toHaveLength(8); expect(new Set(full.map(e => e.id)).size).toBe(8); expect(Math.max(...counts.values())).toBe(1);
    expect(stderr).toBe('');
  } finally {
    for (const ws of sockets) ws.terminate(); child.kill('SIGKILL'); await exited;
  }
}, 15000);
