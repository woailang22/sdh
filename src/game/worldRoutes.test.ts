import { describe, expect, it } from 'vitest';
import { getWorldInteractable } from './world';
import { WORLD_SUPPLY_ROUTES, WORLD_ROADSIDE_STOPS } from './worldRoutes';

describe('world supply route intelligence', () => {
  it('keeps southern room definitions separate from western map-only targets', () => {
    const south = WORLD_SUPPLY_ROUTES.find(route => route.id === 'south')!;
    expect(south.stops.map(point => point.id)).toEqual(WORLD_ROADSIDE_STOPS.map(point => point.id));
    const west = WORLD_SUPPLY_ROUTES.find(route => route.id === 'west')!;
    expect(west.name).toBe('西行材料线');
    expect(west.stops).toHaveLength(4);
    expect(west.stops.some(point => WORLD_ROADSIDE_STOPS.some(room => room.id === point.id))).toBe(false);
  });

  it('points to existing industrial stock and retains the guarded logging supplies', () => {
    const west = WORLD_SUPPLY_ROUTES.find(route => route.id === 'west')!;
    const stock = [
      [['scrap', 8], ['part', 2]], [['scrap', 8], ['part', 2]],
      [['scrap', 30], ['wood', 20], ['part', 3]],
      [['part', 4], ['scrap', 20], ['ore_copper', 4], ['att_foregrip', 1]],
    ];
    for (const [index, stop] of west.stops.entries()) {
      const node = getWorldInteractable(stop.id)!;
      expect(node, stop.name).toBeDefined();
      expect({ x: stop.x, y: stop.y }).toEqual({ x: node.x, y: node.y });
      expect(node.lootTable?.map(item => [item.itemId, item.count])).toEqual(stock[index]);
      expect(stop.x).toBeGreaterThanOrEqual(west.view.x);
      expect(stop.x).toBeLessThanOrEqual(west.view.x + west.view.size);
      expect(stop.y).toBeGreaterThanOrEqual(west.view.y);
      expect(stop.y).toBeLessThanOrEqual(west.view.y + west.view.size);
    }
    expect(west.stops[2].description).toContain('怪物');
    expect(west.stops[3].description).toContain('铜矿');
  });
});
