import { expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { backupDatabase, createDb, createMemoryDb } from './db';
import { GameWorld, type WorldRules } from './worldState';
import { makeItem } from '../src/game/items';

const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
const packets = [
  { action: 'craft', requestId: 'make-ammo', recipeId: 'ammo_pack' },
  { action: 'use_item', requestId: 'heal', index: 0 },
] as const;
function fixture() {
  const db = createMemoryDb(); let time = 10000; const game = new GameWorld(db, rules, () => time);
  game.connect('p', '甲'); game.connect('q', '乙');
  const p = game.state.players.p; p.mapId = 'home_p'; p.campId = 'home_p'; game.state.players.q.mapId = 'home_p'; p.resources.scrap = 100; p.resources.parts = 10; p.hp = 40; p.inventory[0] = makeItem('medkit', 2);
  Object.assign(p.onboarding, { explored: true, wood: 20, stone: 10, workbenchBuilt: true }); game.state.players.q.onboarding.explored = true;
  game.state.camps.home_p = { id: 'home_p', ownerId: p.id, ownerName: '甲', mapId: 'world', x: 150, y: 0, size: 64, level: 1, state: 'active', members: ['q'] };
  for (const [id, type] of [['bench', 'workbench'], ['box', 'storage_box'], ['core', 'anchor_core']] as const) game.state.buildings[id] = { id, type, name: id, x: id === 'core' ? -10 : 1, y: 0, mapId: 'home_p', ownerId: p.id, hp: 500, maxHp: 500, level: 1 };
  game.state.storage.box = { ammo: 0 }; game.persist();
  return { db, game, p, advance: (ms: number) => { time += ms; } };
}
it.each(packets)('commits $action and its replay guard without rewriting shared world state', packet => {
  const { db, game, p } = fixture(), checkpoint = db.getMeta('authoritative-world-v2'), shared = structuredClone({ ...game.state, players: {}, handled: {} });
  const response = game.action('p', packet); expect(response.error).toBeUndefined();
  if (packet.action === 'craft') expect(p.resources).toMatchObject({ ammo: 30, scrap: 90, parts: 9 });
  else { expect(p.hp).toBe(100); expect(p.inventory[0]?.count).toBe(1); }
  expect({ ...game.state, players: {}, handled: {} }).toEqual(shared);
  expect(db.getMeta('authoritative-world-v2')).toBe(checkpoint);
  expect(db.listWorldPlayerCommits()).toHaveLength(1);
  const commit = JSON.parse(db.listWorldPlayerCommits()[0].data); expect(commit).toEqual({ player: p, handled: [packet.requestId] });
  const paid = structuredClone(p); expect(game.action('p', packet).error).toBeUndefined(); expect(p).toEqual(paid);
  const restored = new GameWorld(db, rules, () => 10000); expect(restored.action('p', packet).error).toBeUndefined(); expect(restored.state.players.p).toEqual(paid);
  expect(response).toHaveProperty('buildings'); expect(response.buildings).toHaveLength(3);
});
it.each(packets)('rolls back $action and a full replay ledger when its durable player write fails', packet => {
  const { db, game, p } = fixture(); game.state.handled.p = Array.from({ length: 128 }, (_, i) => 'old-' + i); game.persist();
  const before = structuredClone(game.state), checkpoint = db.getMeta('authoritative-world-v2'), save = db.saveWorldPlayerCommit;
  db.saveWorldPlayerCommit = () => { throw Error('player commit rejected'); };
  expect(game.action('p', packet).error).toBe('player commit rejected');
  expect(game.state).toEqual(before); expect(game.state.players.p).toBe(p); expect(db.listWorldPlayerCommits()).toEqual([]); expect(db.getMeta('authoritative-world-v2')).toBe(checkpoint);
  db.saveWorldPlayerCommit = save; expect(game.action('p', packet).error).toBeUndefined(); expect(game.state.handled.p).toEqual([...before.handled.p.slice(1), packet.requestId]);
  const paid = structuredClone(p); expect(game.action('p', packet).error).toBeUndefined(); expect(p).toEqual(paid);
});
it.each(packets)('keeps committed $action after a failed full reply and replays it once', packet => {
  const { db, game, p } = fixture(); const snapshot = vi.spyOn(game, 'snapshot').mockImplementationOnce(() => { throw Error('reply failed'); });
  try { expect(() => game.action('p', packet)).toThrow('reply failed'); } finally { snapshot.mockRestore(); }
  expect(db.listWorldPlayerCommits()).toHaveLength(1); const paid = structuredClone(p);
  expect(game.action('p', packet).error).toBeUndefined(); expect(p).toEqual(paid);
  const restored = new GameWorld(db, rules, () => 10000); expect(restored.action('p', packet).error).toBeUndefined(); expect(restored.state.players.p).toEqual(paid);
});
it('rolls back a paid recipe when its result cannot fit, and still validates the workstation', () => {
  const { db, game, p } = fixture(); p.inventory = p.inventory.map(() => makeItem('axe_stone', 1)); game.persist();
  const before = structuredClone(game.state); expect(game.action('p', { action: 'craft', requestId: 'full', recipeId: 'nano_medkit' }).error).toBe('背包已满');
  expect(game.state).toEqual(before); expect(db.listWorldPlayerCommits()).toEqual([]);
  delete game.state.buildings.bench; const noBench = structuredClone(game.state);
  expect(game.action('p', packets[0]).error).toBe('请靠近工作台'); expect(game.state).toEqual(noBench);
});
it('persists food consumption, satiety and its onboarding flag without double eating on restart', () => {
  const { db, game, p } = fixture(); p.satiety = 30; p.inventory[1] = makeItem('food', 2); game.persist();
  const checkpoint = db.getMeta('authoritative-world-v2'), packet = { action: 'use_item', requestId: 'eat-food', index: 1 };
  expect(game.action('p', packet).error).toBeUndefined(); expect(p.satiety).toBe(65); expect(p.hp).toBe(40); expect(p.inventory[1]?.count).toBe(1); expect(p.onboarding.ateFood).toBe(true);
  expect(db.getMeta('authoritative-world-v2')).toBe(checkpoint); expect(db.listWorldPlayerCommits()).toHaveLength(1);
  const restored = new GameWorld(db, rules, () => 10000); expect(restored.action('p', packet).error).toBeUndefined();
  expect(restored.state.players.p.satiety).toBe(65); expect(restored.state.players.p.inventory[1]?.count).toBe(1); expect(restored.state.players.p.onboarding.ateFood).toBe(true);
});
it('preserves two private ledgers across a failed shared transfer and consolidates only its paid retry', () => {
  const { db, game, p } = fixture(); const q = game.state.players.q; q.hp = 40; q.inventory[0] = makeItem('medkit', 2); game.persist();
  expect(game.action('p', packets[0]).error).toBeUndefined(); expect(game.action('q', packets[1]).error).toBeUndefined(); expect(db.listWorldPlayerCommits()).toHaveLength(2);
  const before = structuredClone(game.state), commits = db.listWorldPlayerCommits(), save = db.checkpointWorld;
  db.checkpointWorld = () => { throw Error('world commit rejected'); };
  const deposit = { action: 'deposit', requestId: 'deposit', targetId: 'box', itemId: 'ammo', count: 4 };
  expect(game.action('p', deposit).error).toBe('world commit rejected'); expect(game.state).toEqual(before); expect(db.listWorldPlayerCommits()).toEqual(commits);
  db.checkpointWorld = save; expect(game.action('p', deposit).error).toBeUndefined(); expect(p.resources.ammo).toBe(26); expect(game.state.storage.box.ammo).toBe(4); expect(db.listWorldPlayerCommits()).toEqual([]);
  const restored = new GameWorld(db, rules, () => 10000);
  for (const [id, packet] of [['p', packets[0]], ['q', packets[1]], ['p', deposit]] as const) expect(restored.action(id, packet).error).toBeUndefined();
  expect(restored.state.players.p.resources).toEqual(p.resources); expect(restored.state.players.q.inventory[0]?.count).toBe(1); expect(restored.state.players.q.hp).toBe(100); expect(restored.state.storage.box.ammo).toBe(4);
});
it('recovers acknowledged crafting and medicine from SQLite WAL after force-kill and consistent backup', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'sdc-craft-use-')), 'world.sqlite');
  const source = `import { createDb } from ${JSON.stringify(pathToFileURL(resolve('server/db.ts')).href)};
    import { GameWorld } from ${JSON.stringify(pathToFileURL(resolve('server/worldState.ts')).href)};
    import { makeItem } from ${JSON.stringify(pathToFileURL(resolve('src/game/items.ts')).href)};
    const rules={nodeAt:()=>undefined,nodesNear:()=>[],buildingsNear:()=>[],monstersNear:()=>[],campSiteAllowed:()=>false,migrate:(_m,x,y)=>({mapId:'world',x,y})};
    const game=new GameWorld(createDb(${JSON.stringify(file)}),rules,()=>10000);game.connect('p','甲');const p=game.state.players.p;
    p.hp=40;p.resources.scrap=100;p.resources.parts=10;p.inventory[0]=makeItem('medkit',2);
    game.state.buildings.bench={id:'bench',type:'workbench',name:'工作台',x:1,y:0,mapId:'world',ownerId:'p',hp:500,maxHp:500,level:1};game.persist();
    for(const packet of ${JSON.stringify(packets)}){const reply=game.action('p',packet);if(reply.error)throw Error(reply.error);}
    process.stdout.write('committed\\n');setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const exited = once(child, 'exit'); let stderr = '';
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  try {
    await new Promise<void>((accept, reject) => {
      let text = ''; const timer = setTimeout(() => reject(Error('Player commit timeout: ' + stderr)), 10000);
      child.once('error', error => { clearTimeout(timer); reject(error); }); child.once('exit', () => { clearTimeout(timer); reject(Error('Player commit child exited: ' + stderr)); });
      child.stdout.on('data', chunk => { text += String(chunk); if (text.includes('committed')) { clearTimeout(timer); accept(); } });
    });
  } finally { child.kill('SIGKILL'); await exited; }
  expect(stderr).toBe(''); const reader = new Database(file, { readonly: true });
  try {
    const checkpoint = JSON.parse((reader.prepare("SELECT v FROM meta WHERE k='authoritative-world-v2'").get() as { v: string }).v);
    expect(checkpoint.players.p.hp).toBe(40); expect(checkpoint.players.p.resources.ammo).toBe(0); expect(reader.prepare('SELECT id FROM world_player_commits').all()).toHaveLength(1);
    expect(reader.pragma('integrity_check', { simple: true })).toBe('ok');
  } finally { reader.close(); }
  const backup = await backupDatabase(file); expect(backup).toBeTruthy();
  for (const path of [file, backup!]) {
    const db = createDb(path), game = new GameWorld(db, rules, () => 10000);
    expect(game.state.players.p).toMatchObject({ hp: 100, resources: { ammo: 30, scrap: 90, parts: 9 } }); expect(game.state.players.p.inventory[0]?.count).toBe(1);
    for (const packet of packets) expect(game.action('p', packet).error).toBeUndefined();
    expect(game.state.players.p.resources.ammo).toBe(30); expect(game.state.players.p.inventory[0]?.count).toBe(1); expect(game.state.handled.p).toEqual(packets.map(p => p.requestId));
  }
}, 15000);
