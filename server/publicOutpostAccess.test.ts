import { describe, expect, it } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld, type WorldRules } from './worldState';
import { createWorldQueries } from './worldQueries';
import { findPath } from '../src/game/navigation';

const sites = [
  { x: -576, y: -155, suffix: ':forest_post_n_-16', prefix: ':forest_post_', ownerId: 'npc_forest_syndicate', location: 'mtn_deep' },
  { x: 782, y: 167, suffix: ':rebel_post_n_22', prefix: ':rebel_post_', ownerId: 'npc_raider_boss', location: 'town_ruins' },
] as const;
function setup(site: typeof sites[number]) {
  let now = 10_000, sequence = 0;
  const db = createMemoryDb(), queries = createWorldQueries();
  const rules: WorldRules = { ...queries, campSiteAllowed: () => false, migrate: (_m, x, y) => ({ mapId: 'world', x, y }) };
  let game = new GameWorld(db, rules, () => now); game.connect('fixture', '测试角色');
  const p = game.state.players.fixture; Object.assign(p, { x: site.x, y: site.y }); p.resources.c4 = 1;
  const wall = queries.buildingsNear(p.x, p.y).find(b => b.id.endsWith(site.suffix))!;
  const gate = queries.buildingsNear(p.x, p.y).find(b => b.id.endsWith(site.prefix + 'door'))!;
  const action = (action: string, params = {}, requestId = `check${++sequence}`) => game.action('fixture', { action, requestId, ...params });
  const walk = (x: number, y: number) => {
    const p = game.state.players.fixture;
    const geometry = queries.buildingsNear(p.x, p.y).map(b => game.state.buildings[b.id] || b);
    const path = findPath(p, { x, y }, geometry, 32); expect(path.length).toBeGreaterThan(0);
    for (const pos of path) { now += 250; expect(game.move('fixture', { ...pos, mapId: 'world' })).toBe(true); }
  };
  return { get game() { return game; }, get p() { return game.state.players.fixture; }, db, rules, queries, wall, gate, action, walk, time: () => now, setTime: (value: number) => { now = value; }, restart: () => { game = new GameWorld(db, rules, () => now); game.connect('fixture', '测试角色'); } };
}

describe('authored public outpost wall approaches', () => {
  it.each(sites)('permits one paid wall breach, interior searches and withdrawal while retaining the $location gate', site => {
    const f = setup(site);
    expect(f.wall.ownerId).toBe(site.ownerId);
    const containers = f.queries.nodesNear(f.wall.x, f.wall.y).filter(n => n.id.includes(`:container:${site.location}:`) && n.x >= f.wall.x - 1 && n.x <= f.wall.x + 1);
    expect(containers).toHaveLength(3);
    for (const n of containers) expect(f.action('search', { targetId: n.id }).error).toBeDefined();
    expect(f.action('raid', { targetId: f.wall.id, supplyId: 'c4_explosive' }, 'breach-once').error).toBeUndefined();
    expect(f.game.state.buildings[f.wall.id]).toMatchObject({ ownerId: site.ownerId, hp: 0 });
    expect(f.p.resources.c4).toBe(0); expect(f.game.state.buildings[f.gate.id]).toBeUndefined();
    for (const n of containers) {
      f.walk(n.x, n.y);
      const found = f.action('search', { targetId: n.id }); expect(found.error).toBeUndefined(); expect(found.loot!.items.length).toBeGreaterThan(0);
      for (const item of found.loot!.items) expect(f.action('take_loot', { targetId: n.id, itemId: item.itemId, count: item.count }).error).toBeUndefined();
      expect(f.game.state.nodes[n.id].stock).toBe(0);
    }
    if (site.location === 'town_ruins') expect(f.p.resources).toMatchObject({ ammo: 20, parts: 2, scrap: 0 });
    f.walk(site.x, site.y); f.game.persist();
    const before = structuredClone(f.p), restored = new GameWorld(f.db, f.rules, f.time);
    expect(restored.action('fixture', { action: 'raid', requestId: 'breach-once', targetId: f.gate.id, supplyId: 'c4_explosive' }).error).toBeUndefined();
    expect(restored.state.players.fixture.inventory).toEqual(before.inventory); expect(restored.state.players.fixture.resources).toEqual(before.resources);
    expect(restored.state.buildings[f.gate.id]).toBeUndefined();
    expect(restored.snapshot('fixture').buildings.find(b => b.id === f.gate.id)).toMatchObject({ hp: f.gate.hp, isOpen: false, isLocked: true });
    expect(restored.state.buildings[f.wall.id]).toMatchObject({ hp: 0, ownerId: site.ownerId });
  });

  it('keeps an old armory remainder through restart, then renews its new purpose only when depleted, due and unobserved', () => {
    const f = setup(sites[1]), node = f.queries.nodeAt('world:24:5:container:town_ruins:rebel_chest')!;
    expect(f.action('raid', { targetId: f.wall.id, supplyId: 'c4_explosive' }).error).toBeUndefined();
    f.walk(node.x, node.y);
    f.game.state.nodes[node.id] = { stock: 1, respawnAt: 0, items: [{ itemId: 'scrap', name: '旧废铁余量', count: 3 }] }; f.game.persist();
    f.restart();
    expect(f.action('search', { targetId: node.id }, 'old-open').loot?.items.map(i => [i.itemId, i.count])).toEqual([['scrap', 3]]);
    expect(f.action('take_loot', { targetId: node.id, itemId: 'scrap', count: 1 }, 'partial-old').error).toBeUndefined();
    expect(f.action('search', { targetId: node.id }).loot?.items.map(i => [i.itemId, i.count])).toEqual([['scrap', 2]]);
    expect(f.action('take_loot', { targetId: node.id, itemId: 'scrap', count: 2 }, 'finish-old').error).toBeUndefined();
    const deadline = f.time() + 900000; expect(f.game.state.nodes[node.id]).toMatchObject({ stock: 0, respawnAt: deadline });
    f.setTime(deadline); f.game.tick(); expect(f.action('search', { targetId: node.id }).error).toContain('耗尽');
    f.walk(sites[1].x, sites[1].y); f.walk(sites[1].x, sites[1].y - 24); f.walk(sites[1].x, sites[1].y - 48);
    f.setTime(f.time() + 5000); f.game.tick();
    expect(f.game.state.nodes[node.id]).toMatchObject({ stock: 1, respawnAt: 0 });
    f.walk(sites[1].x, sites[1].y - 24); f.walk(sites[1].x, sites[1].y); f.walk(node.x, node.y);
    expect(f.action('search', { targetId: node.id }).loot?.items.map(i => [i.itemId, i.count])).toEqual([['ammo', 20], ['part', 2]]);
    expect(f.action('take_loot', { targetId: node.id, itemId: 'ammo', count: 20 }, 'new-ammo').error).toBeUndefined();
    expect(f.action('take_loot', { targetId: node.id, itemId: 'ammo', count: 20 }, 'new-ammo').error).toBeUndefined();
    expect(f.action('take_loot', { targetId: node.id, itemId: 'part', count: 2 }, 'new-parts').error).toBeUndefined();
    const restored = new GameWorld(f.db, f.rules, f.time);
    expect(restored.state.players.fixture.resources).toMatchObject({ ammo: 20, parts: 2, scrap: 3, c4: 0 });
    expect(restored.state.nodes[node.id].stock).toBe(0); expect(restored.state.buildings[f.wall.id].hp).toBe(0);
    expect(restored.state.buildings[f.gate.id]).toBeUndefined();
  });

  it.each(sites)('restores only missing NPC ownership on a legacy damaged $location wall without repairing it', site => {
    const f = setup(site); const legacy = { ...f.wall, hp: 123 }; delete legacy.ownerId;
    f.game.state.buildings[f.wall.id] = legacy; f.game.persist();
    const restored = new GameWorld(f.db, f.rules, f.time);
    expect(restored.state.buildings[f.wall.id]).toEqual({ ...legacy, ownerId: site.ownerId });
    expect(restored.state.players.fixture.resources).toEqual(f.p.resources);
  });

  it('retains explicit saved ownership, ordinary public scenery and private assets during legacy recovery', () => {
    const f = setup(sites[0]);
    f.game.state.buildings[f.wall.id] = { ...f.wall, ownerId: 'prior-owner', hp: 123 };
    const ordinary = f.queries.buildingsNear(-240, 0).find(b => b.type.endsWith('_wall') && !b.ownerId)!;
    expect(ordinary).toBeDefined(); f.game.state.buildings[ordinary.id] = { ...ordinary, hp: 80 };
    f.game.state.buildings.private = { ...f.wall, id: 'private', mapId: 'home_fixture', ownerId: 'fixture', hp: 99 };
    const expected = structuredClone(f.game.state.buildings); f.game.persist();
    const restored = new GameWorld(f.db, f.rules, f.time);
    expect(restored.state.buildings).toEqual(expected);
  });
});
