import { describe, expect, it } from 'vitest';
import { getWorldInteractable } from './world';
import { WORLD_SUPPLY_ROUTES, WORLD_ROADSIDE_STOPS } from './worldRoutes';
import { craftingRecipe } from './crafting';

describe('world supply route intelligence', () => {
  it('marks real northern food before the guarded powder store without inventing loot', () => {
    const north = WORLD_SUPPLY_ROUTES.find(route => route.id === 'north')!;
    const food = north.stops.find(stop => stop.id === 'world:-1:-6:poi:supplies');
    const powder = north.stops.find(stop => stop.id === 'world:-5:-11:i:mtn_quarry:q_powder');
    expect(food, 'prepare at the existing northern farmhouse').toBeDefined();
    expect(powder, 'existing raid supplies can be found on the map').toBeDefined();
    for (const stop of [food!, powder!]) {
      const node = getWorldInteractable(stop.id)!;
      expect({ x: stop.x, y: stop.y }).toEqual({ x: node.x, y: node.y });
    }
    const supplies = (id: string) => getWorldInteractable(id)!.lootTable!.map(item => [item.itemId, item.count]);
    expect(supplies(food!.id)).toEqual([['food', 3], ['water', 2], ['seed_potato', 1]]);
    expect(supplies(powder!.id)).toContainEqual(['c4_explosive', 3]);
    expect(supplies(powder!.id)).toContainEqual(['ammo', 20]);
    expect(north.stops.indexOf(food!)).toBeLessThan(north.stops.indexOf(powder!));
    expect(food!.description).toContain('南侧'); expect(food!.description).toContain('食物');
    expect(powder!.description).toContain('怪物'); expect(powder!.description).toContain('消耗');
    expect(powder!.description).toContain('撤离');
  });

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

  it('guides northern mining to enough existing copper for three smelts and an industrial salvage source', () => {
    const north = WORLD_SUPPLY_ROUTES.find(route => route.id === 'north');
    expect(north, 'the northern materials route is discoverable on the map').toBeDefined();
    const nodes = north!.stops.map(stop => {
      const node = getWorldInteractable(stop.id)!;
      expect(node, stop.name).toBeDefined();
      expect({ x: stop.x, y: stop.y }).toEqual({ x: node.x, y: node.y });
      expect(stop.x).toBeGreaterThanOrEqual(north!.view.x);
      expect(stop.x).toBeLessThanOrEqual(north!.view.x + north!.view.size);
      expect(stop.y).toBeGreaterThanOrEqual(north!.view.y);
      expect(stop.y).toBeLessThanOrEqual(north!.view.y + north!.view.size);
      return node;
    });
    const copper = nodes.filter(node => node.type === 'boulder' && node.lootTable?.some(item => item.itemId === 'ore_copper'));
    const oreForThreeSmelts = craftingRecipe('smelt_copper')!.cost.extra!.find(item => item.itemId === 'ore_copper')!.count * 3;
    expect(copper.reduce((total, node) => total + (node.stock ?? 0), 0)).toBeGreaterThanOrEqual(oreForThreeSmelts);
    expect(nodes.some(node => node.type === 'car' && node.lootTable?.some(item => item.itemId === 'part' && item.count >= 5) && node.lootTable.some(item => item.itemId === 'scrap' && item.count >= 40))).toBe(true);
    expect(north!.stops.some(stop => stop.description.includes('镐') && stop.description.includes('熔炉'))).toBe(true);
    expect(north!.stops.some(stop => stop.description.includes('怪物'))).toBe(true);
    const ids = WORLD_SUPPLY_ROUTES.flatMap(route => route.stops.map(stop => stop.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
