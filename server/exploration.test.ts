import { describe, expect, it } from 'vitest';
import { GameWorld } from './worldState';
import { createMemoryDb } from './db';
import { createWorldQueries } from './worldQueries';
import { getWorldInteractable } from '../src/game/world';
import { makeItem } from '../src/game/items';

function setup(nodeId: string, dx = 2.5, dy = 0) {
  let time = 10000;
  const db = createMemoryDb(), rules = { ...createWorldQueries(), nodeAt: getWorldInteractable, campSiteAllowed: () => true, migrate: (_map: string, x: number, y: number) => ({ mapId: 'world' as const, x, y }) };
  const game = new GameWorld(db, rules, () => time); game.connect('p', '探索者');
  const node = getWorldInteractable(nodeId)!, p = game.state.players.p;
  p.x = node.x + dx; p.y = node.y + dy; p.shield = 50;
  return { game, db, rules, p, node, now: () => time, setTime: (value: number) => { time = value; }, advance: () => { time += 200; game.tick(); } };
}

const caches = [
  { nodeId: 'world:3:21:i:marsh_rift:rift_cache', guardSuffix: ':rf_cache_guard' },
  { nodeId: 'world:5:28:i:marsh_abyss:aby_cache', guardSuffix: ':ab_cache_guard' },
];
describe('high-risk exploration rewards', () => {
  it('retains an old roadside container remainder when its room becomes a clinic', () => {
    const { game, db, rules, node, now } = setup('world:-1:10:poi:supplies');
    game.state.nodes[node.id] = { stock: 3, respawnAt: 0, items: [{ itemId: 'fuel', name: '旧库存燃油', count: 2 }, { itemId: 'battery', name: '旧库存电池', count: 1 }] };
    game.persist(); const restored = new GameWorld(db, rules, now);
    const result = restored.action('p', { action: 'search', targetId: node.id, requestId: 'old-room' });
    expect(result.loot?.name).toContain('芦湾诊所');
    expect(result.loot?.items.map(i => [i.itemId, i.count])).toEqual([['fuel', 2], ['battery', 1]]);
    expect(restored.action('p', { action: 'take_loot', targetId: node.id, itemId: 'fuel', count: 2, requestId: 'old-fuel' }).error).toBeUndefined();
    expect(restored.snapshot('p').player.inventory.find(i => i?.id === 'fuel')?.count).toBe(2);
    expect(restored.state.nodes[node.id].items?.map(i => [i.itemId, i.count])).toEqual([['battery', 1]]);
  });

  it.each([
    { id: 'world:2:21:i:marsh_rift:rift_armory', lord: ':rf1' },
    { id: 'world:5:27:i:marsh_abyss:aby_legend_pond', lord: ':ab1' },
  ])('places the specialist reward within actual lord threat at $id', ({ id, lord }) => {
    for (const [dx, dy] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) {
      const { game, p, advance } = setup(id, dx, dy); game.snapshot('p');
      expect(Object.values(game.state.monsters).some(m => m.id.endsWith(lord))).toBe(true);
      for (let i = 0; i < 15; i++) advance();
      expect(p.lastDamageAt).toBeGreaterThan(10000); expect(p.shield).toBeLessThan(50);
    }
  });

  it('keeps a cleared research cache depleted across restart and restores it only at its own deadline', () => {
    const { game, db, rules, node, now, setTime } = setup(caches[0].nodeId);
    const searched = game.action('p', { action: 'search', targetId: node.id, requestId: 'open' });
    for (const item of searched.loot!.items) expect(game.action('p', { action: 'take_loot', targetId: node.id, itemId: item.itemId, count: item.count, requestId: 'take-' + item.itemId }).error).toBeUndefined();
    expect(game.state.nodes[node.id].respawnAt).toBe(now() + 1800000);
    setTime(now() + 300001);
    const restored = new GameWorld(db, rules, now);
    expect(restored.action('p', { action: 'search', targetId: node.id, requestId: 'too-early' }).error).toContain('耗尽');
    setTime(1810000);
    const refreshed = restored.action('p', { action: 'search', targetId: node.id, requestId: 'after-deadline' });
    expect(refreshed.error).toBeUndefined();
    expect(refreshed.loot?.items.find(i => i.itemId === 'dark_core')?.count).toBe(2);
    expect(restored.state.nodes[node.id].stock).toBe(1);
  });

  it('requires a rod for the rare fishing target and grants only one fish per hourly stock', () => {
    const { game, p, node, now, setTime } = setup('world:5:27:i:marsh_abyss:aby_legend_pond');
    const gather = (requestId: string) => game.action('p', { action: 'gather', targetId: node.id, requestId });
    expect(gather('bare').error).toContain('钓竿');
    p.equipment.tool = makeItem('rod_basic', 1);
    expect(gather('first-fish').error).toBeUndefined();
    expect(gather('duplicate').error).toContain('耗尽');
    expect(game.state.nodes[node.id].respawnAt).toBe(now() + 3600000);
    expect(gather('first-fish').error).toBeUndefined();
    expect(p.inventory.find(i => i?.id === 'fish_legend')?.count).toBe(1);
    setTime(now() + 3599999); expect(gather('still-empty').error).toContain('耗尽');
    setTime(now() + 1); expect(gather('hour-later').error).toBeUndefined();
    expect(p.inventory.find(i => i?.id === 'fish_legend')?.count).toBe(2);
  });

  it('preserves already acquired gear and unopened portions of a legacy cache', () => {
    const { game, db, rules, p, node, now } = setup(caches[0].nodeId);
    p.inventory[0] = makeItem('vest_t5', 1);
    game.state.nodes[node.id] = { stock: 3, respawnAt: 0, items: [{ itemId: 'dark_core', name: '旧实存暗核', count: 12 }, { itemId: 'blueprint', name: '旧实存蓝图', count: 1 }] };
    game.persist(); const restored = new GameWorld(db, rules, now);
    const old = restored.action('p', { action: 'search', targetId: node.id, requestId: 'legacy-search' });
    expect(old.loot?.items.find(i => i.itemId === 'dark_core')?.count).toBe(12);
    expect(old.player.inventory[0]?.id).toBe('vest_t5');
    expect(restored.action('p', { action: 'take_loot', targetId: node.id, itemId: 'dark_core', count: 12, requestId: 'take-legacy' }).error).toBeUndefined();
    expect(restored.snapshot('p').player.inventory.find(i => i?.id === 'dark_core')?.count).toBe(12);
    expect(restored.state.nodes[node.id].items?.find(i => i.itemId === 'blueprint')?.count).toBe(1);
  });

  it.each(caches)('contests all four nearby looting positions at $nodeId', ({ nodeId, guardSuffix }) => {
    for (const [dx, dy] of [[2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]]) {
      const { game, p, advance } = setup(nodeId, dx, dy);
      game.snapshot('p');
      const guard = Object.values(game.state.monsters).find(m => m.id.endsWith(guardSuffix));
      expect(guard).toBeDefined();
      for (let i = 0; i < 25; i++) advance();
      expect(guard!.targetId).toBe('p');
      expect(p.shield).toBeLessThan(50); expect(p.lastDamageAt).toBeGreaterThan(10000);
      expect(p.hp).toBeGreaterThan(0);
    }
  });
  it('allows an equipped explorer to clear the guard and keep one real blueprint across restart', () => {
    const { game, db, rules, p, node, advance, now } = setup(caches[0].nodeId);
    p.equipment.weapon = makeItem('rifle', 1); p.resources.ammo = 10; game.snapshot('p');
    const guard = Object.values(game.state.monsters).find(m => m.id.endsWith(caches[0].guardSuffix));
    expect(guard).toBeDefined();
    for (let shot = 0; guard!.hp > 0 && shot < 10; shot++) {
      advance(); expect(game.action('p', { action: 'fire', monsterId: guard!.id, requestId: 'shot-' + shot }).error).toBeUndefined();
    }
    expect(guard!.state).toBe('dead'); expect(p.resources.ammo).toBe(7);
    expect(game.action('p', { action: 'search', targetId: node.id, requestId: 'search' }).error).toBeUndefined();
    expect(game.action('p', { action: 'take_loot', targetId: node.id, itemId: 'blueprint', count: 1, requestId: 'take' }).error).toBeUndefined();
    const restored = new GameWorld(db, rules, now), state = restored.snapshot('p');
    expect(state.player.inventory.filter(i => i?.id === 'blueprint').reduce((sum, i) => sum + i!.count, 0)).toBe(1);
    expect(restored.state.monsters[guard!.id].hp).toBe(0);
    expect(restored.action('p', { action: 'take_loot', targetId: node.id, itemId: 'blueprint', count: 1, requestId: 'duplicate' }).error).toContain('取走');
    expect(restored.state.monsters[guard!.id].respawnAt).toBeGreaterThan(now());
  });
});
