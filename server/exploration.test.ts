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
  return { game, db, rules, p, node, now: () => time, advance: () => { time += 200; game.tick(); } };
}

const caches = [
  { nodeId: 'world:3:21:i:marsh_rift:rift_cache', guardSuffix: ':rf_cache_guard' },
  { nodeId: 'world:5:28:i:marsh_abyss:aby_cache', guardSuffix: ':ab_cache_guard' },
];
describe('high-risk exploration rewards', () => {
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
