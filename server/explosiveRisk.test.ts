import { expect, it } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld } from './worldState';
import { createWorldQueries } from './worldQueries';
import { findPath } from '../src/game/navigation';
import { makeItem } from '../src/game/items';

const van = 'world:7:-1:i:town_gas:gas_van', ammo = 'world:7:-1:i:town_gas:gas_ammo';
const guarded = [
  { id: 'world:-18:-6:i:mtn_deep:deep_ammo', guard: 'world:-18:-6:m:mtn_deep:dp_cache_guard', dx: -1, hp: 350 },
  { id: 'world:-6:-22:i:mtn_peak:peak_powder', guard: 'world:-6:-22:m:mtn_peak:pk_powder_guard', dx: -1, hp: 260 },
  { id: 'world:20:-2:i:town_factory:fac_ammo', guard: 'world:20:-2:m:town_factory:fac_ammo_guard', dx: 1, hp: 320 },
] as const;
function setup(id: string, liveNpc = false) {
  let time = 10_000;
  const db = createMemoryDb(), queries = createWorldQueries(), node = queries.nodeAt(id)!;
  const rules = { ...queries, ...(liveNpc ? {} : { monstersNear: () => [] }), campSiteAllowed: () => false, migrate: (_map: string, x: number, y: number) => ({ mapId: 'world' as const, x, y }) };
  let game = new GameWorld(db, rules, () => time); game.connect('fixture', '测试角色');
  Object.assign(game.state.players.fixture, { x: node.x - 2.5, y: node.y });
  return { get game() { return game; }, get p() { return game.state.players.fixture; }, db, queries, rules, node, advance: (ms = 200) => { time += ms; }, setTime: (value: number) => { time = value; }, now: () => time, restart: () => { game = new GameWorld(db, rules, () => time); game.connect('fixture', '测试角色'); } };
}
function walk(f: ReturnType<typeof setup>, x: number, y: number, liveNpc = false, stopAfterDamage = false) {
  const path = findPath(f.p, { x, y }, f.queries.buildingsNear(f.p.x, f.p.y), 64); expect(path.length).toBeGreaterThan(0);
  const initialDamage = f.p.lastCombatDamageAt ?? f.p.lastDamageAt; let steps = 0;
  for (const goal of path) {
    const from = { x: f.p.x, y: f.p.y }, count = Math.max(1, Math.ceil(Math.hypot(goal.x - from.x, goal.y - from.y) / .25));
    for (let i = 1; i <= count; i++) {
      f.advance(100); steps++;
      expect(f.game.move(f.p.id, { mapId: 'world', x: from.x + (goal.x - from.x) * i / count, y: from.y + (goal.y - from.y) * i / count })).toBe(true);
      if (liveNpc && steps % 2 === 0) f.game.tick();
      if (stopAfterDamage && (f.p.lastCombatDamageAt ?? f.p.lastDamageAt) > initialDamage) return;
    }
  }
}
const loot = (items: { itemId: string; count: number }[]) => items.map(i => [i.itemId, i.count]);

it('keeps civil truck materials and military ammunition while limiting the low-risk pair to one fresh C4', () => {
  const truck = setup(van), crate = setup(ammo);
  expect(loot(truck.node.lootTable!)).toEqual([['fuel', 4], ['scrap', 40], ['wp_m870', 1]]);
  expect(loot(crate.node.lootTable!)).toEqual([['ammo', 60], ['c4_explosive', 1], ['rifle', 1]]);
  for (const f of [truck, crate]) {
    expect(f.node.respawnSec).toBe(300); expect(f.node.stock).toBe(3);
    const opened = f.game.action(f.p.id, { action: 'search', targetId: f.node.id, requestId: 'open' }); expect(opened.error).toBeUndefined();
    for (const item of opened.loot!.items) expect(f.game.action(f.p.id, { action: 'take_loot', targetId: f.node.id, itemId: item.itemId, count: item.count, requestId: 'take-' + item.itemId }).error).toBeUndefined();
    expect(f.game.state.nodes[f.node.id]).toMatchObject({ stock: 0, items: [], respawnAt: f.now() + 300_000 });
  }
  expect(truck.p.resources).toMatchObject({ c4: 0, scrap: 40 }); expect(crate.p.resources).toMatchObject({ c4: 1, ammo: 60 });
  expect(truck.p.inventory.find(i => i?.id === 'fuel')?.count).toBe(4); expect(truck.p.inventory.find(i => i?.id === 'wp_m870')).toBeDefined();
  expect(crate.p.inventory.find(i => i?.id === 'rifle')).toBeDefined();
});

it.each([van, ammo])('preserves old full/partial C4 and refreshes only after normal depletion at %s', id => {
  const f = setup(id), old = structuredClone(f.node.lootTable!).filter(i => i.itemId !== 'c4_explosive');
  old.splice(1, 0, { itemId: 'c4_explosive', name: '旧箱炸药', count: 2 });
  f.p.resources.c4 = 5; f.game.state.nodes[id] = { stock: 3, respawnAt: 0, items: old }; f.game.persist(); f.restart();
  const act = (action: string, requestId: string, extra = {}) => f.game.action(f.p.id, { action, requestId, targetId: id, ...extra });
  expect(act('search', 'old-full').loot!.items.find(i => i.itemId === 'c4_explosive')!.count).toBe(2);
  expect(act('take_loot', 'old-one', { itemId: 'c4_explosive', count: 1 }).error).toBeUndefined();
  f.restart(); expect(act('search', 'old-partial').loot!.items.find(i => i.itemId === 'c4_explosive')!.count).toBe(1);
  expect(act('take_loot', 'old-one', { itemId: 'c4_explosive', count: 1 }).error).toBeUndefined(); expect(f.p.resources.c4).toBe(6);
  for (const item of [...f.game.state.nodes[id].items!]) if (item.count) expect(act('take_loot', 'rest-' + item.itemId, { itemId: item.itemId, count: item.count }).error).toBeUndefined();
  expect(f.p.resources.c4).toBe(7); const deadline = f.now() + 300_000; expect(f.game.state.nodes[id].respawnAt).toBe(deadline);
  f.restart(); expect(f.game.state.nodes[id].respawnAt).toBe(deadline);
  f.setTime(deadline); f.game.tick(); expect(f.game.state.nodes[id].stock).toBe(0);
  walk(f, f.node.x - 52, f.node.y); f.advance(5000); f.game.tick(); expect(f.game.state.nodes[id].stock).toBe(3);
  walk(f, f.node.x - 2.5, f.node.y);
  const fresh = act('search', 'fresh'); expect(loot(fresh.loot!.items)).toEqual(loot(f.node.lootTable!));
  for (const item of fresh.loot!.items) expect(act('take_loot', 'new-' + item.itemId, { itemId: item.itemId, count: item.count }).error).toBeUndefined();
  const expected = id === van ? 7 : 8; expect(f.p.resources.c4).toBe(expected);
  expect(act('take_loot', 'old-one', { itemId: 'c4_explosive', count: 1 }).error).toBeUndefined(); f.restart(); expect(f.p.resources.c4).toBe(expected);
  expect(f.game.state.nodes[id].stock).toBe(0);
});

it.each(guarded)('exposes the formerly clean local approach at $id to actual NPC damage', site => {
  const f = setup(site.id, true); Object.assign(f.p, { x: f.node.x + site.dx * 24, y: f.node.y });
  const before = f.p.lastCombatDamageAt ?? f.p.lastDamageAt;
  walk(f, f.node.x + site.dx * 2.5, f.node.y, true, true);
  if ((f.p.lastCombatDamageAt ?? f.p.lastDamageAt) === before) for (let i = 0; i < Math.ceil((f.node.searchDuration || 1.6) / .2); i++) { f.advance(); f.game.tick(); }
  expect(f.p.lastCombatDamageAt ?? f.p.lastDamageAt).toBeGreaterThan(before);
});

it.each(guarded)('adds only the missing $guard while retaining old damaged/dead NPC and partial loot', site => {
  const f = setup(site.id, true), definitions = f.queries.monstersNear(f.node.x, f.node.y);
  const guard = definitions.find(m => m.id === site.guard); expect(guard).toMatchObject({ hp: site.hp, spawnX: f.node.x, spawnY: f.node.y });
  const old = definitions.filter(m => m.id !== site.guard);
  expect(old.length).toBeGreaterThan(0);
  for (const [index, def] of old.entries()) f.game.state.monsters[def.id] = { ...def, hp: index ? 42 : 0, state: index ? 'hurt' : 'dead', ...(index ? {} : { respawnAt: f.now() + 55_555 }) } as any;
  const before = structuredClone(f.game.state.monsters); f.p.resources.c4 = 4;
  f.game.state.nodes[f.node.id] = { stock: 3, respawnAt: 0, items: [{ itemId: 'c4_explosive', name: '旧余量', count: 2 }] };
  f.game.persist(); f.restart();
  for (const def of old) expect(f.game.state.monsters[def.id]).toEqual(before[def.id]);
  expect(f.game.state.monsters[site.guard]).toMatchObject({ hp: site.hp, maxHp: site.hp, spawnX: f.node.x, spawnY: f.node.y });
  expect(f.p.resources.c4).toBe(4); expect(f.game.state.nodes[f.node.id].items?.[0].count).toBe(2);
  f.game.state.monsters[site.guard].hp = 17; f.game.persist(); f.restart(); expect(f.game.state.monsters[site.guard].hp).toBe(17);
});

it.each(guarded)('uses paid shooting, replay and the existing respawn timer for $guard', site => {
  const f = setup(site.id, true); f.p.equipment.weapon = makeItem('rifle', 1); f.p.resources.ammo = 100;
  f.game.snapshot(f.p.id); expect(f.game.state.monsters[site.guard]).toBeDefined();
  let last: { action: string; requestId: string; monsterId: string } | undefined;
  for (let shot = 0; shot < 20 && f.game.state.monsters[site.guard].hp > 0; shot++) {
    f.advance(); last = { action: 'fire', requestId: 'shot-' + shot, monsterId: site.guard };
    expect(f.game.action(f.p.id, last).error).toBeUndefined(); f.game.tick();
  }
  const guard = f.game.state.monsters[site.guard], deadline = f.now() + 120_000;
  expect(guard).toMatchObject({ hp: 0, state: 'dead', respawnAt: deadline }); expect(f.p.resources.c4).toBe(0);
  const ammoLeft = f.p.resources.ammo; expect(ammoLeft).toBeLessThan(100);
  expect(f.game.action(f.p.id, last!).error).toBeUndefined(); expect(f.p.resources.ammo).toBe(ammoLeft);
  f.restart(); f.setTime(deadline - 1); f.game.tick(); expect(f.game.state.monsters[site.guard].hp).toBe(0);
  f.setTime(deadline); f.game.tick(); expect(f.game.state.monsters[site.guard]).toMatchObject({ hp: site.hp, maxHp: site.hp });
  expect(f.p.resources.ammo).toBe(ammoLeft); expect(f.p.resources.c4).toBe(0);
});
