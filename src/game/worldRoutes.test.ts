import { describe, expect, it } from 'vitest';
import { getWorldInteractable } from './world';
import { WORLD_SUPPLY_ROUTES, WORLD_ROADSIDE_STOPS } from './worldRoutes';
import { craftingRecipe } from './crafting';
import { BUILD_RECIPES } from './buildingRecipes';

describe('world supply route intelligence', () => {
  it('offers a forest supply route through distinct existing rooms before the guarded timber target', () => {
    const forest = WORLD_SUPPLY_ROUTES.find(route => route.id === 'forest');
    expect(forest, 'deep woodland needs a discoverable supply route').toBeDefined();
    const span = Math.max(...forest!.stops.map(stop => stop.x)) - Math.min(...forest!.stops.map(stop => stop.x));
    expect(span / forest!.view.size, 'the woodland targets should occupy most of the route view, including on a narrow map').toBeGreaterThan(.5);
    expect(forest!.stops.map(stop => stop.id)).toEqual(['world:-10:-4:poi:supplies', 'world:-14:-4:poi:supplies', 'world:-17:-5:poi:supplies', 'world:-18:-6:i:mtn_deep:deep_tree']);
    const expected = [[['food', 3], ['water', 2], ['seed_potato', 1]], [['bandage', 3], ['antidote', 1]], [['scrap', 8], ['part', 2]]];
    for (const [index, stop] of forest!.stops.entries()) {
      const node = getWorldInteractable(stop.id)!; expect(node, stop.name).toBeDefined();
      expect({ x: stop.x, y: stop.y }).toEqual({ x: node.x, y: node.y });
      expect(stop.x).toBeGreaterThanOrEqual(forest!.view.x); expect(stop.x).toBeLessThanOrEqual(forest!.view.x + forest!.view.size);
      expect(stop.y).toBeGreaterThanOrEqual(forest!.view.y); expect(stop.y).toBeLessThanOrEqual(forest!.view.y + forest!.view.size);
      if (index < 3) expect(node.lootTable!.map(item => [item.itemId, item.count])).toEqual(expected[index]);
    }
    expect(forest!.stops[0].description).toContain('南侧'); expect(forest!.stops[0].description).toContain('返程');
    expect(forest!.stops[1].description).toContain('怪物'); expect(forest!.stops[3].description).toContain('斧');
    expect(getWorldInteractable(forest!.stops[3].id)!.type).toBe('tree');
    const south = WORLD_SUPPLY_ROUTES.find(route => route.id === 'south')!;
    expect(south.stops.map(stop => stop.id)).toEqual(['world:-1:3:poi','world:0:6:poi','world:-1:10:poi','world:0:14:poi','world:0:18:poi']);
  });
  it('offers an eastern route to seven existing nodes with exact coordinates and a complete view', () => {
    const east = WORLD_SUPPLY_ROUTES.find(route => route.id === 'east');
    expect(east, 'eastern industrial exploration must be discoverable').toBeDefined();
    expect(east!.name).toBe('东行工业线'); expect(east!.axis).toBe('x');
    expect(east!.stops.map(stop => stop.id)).toEqual([
      'world:4:0:poi:supplies', 'world:6:0:poi:supplies', 'world:7:0:i:town_gas:gas_tanker',
      'world:13:0:i:town_street:st_hardware', 'world:14:1:i:town_street:st_diner',
      'world:19:-3:i:town_factory:fac_press', 'world:20:-3:i:town_factory:fac_shelves',
    ]);
    for (const stop of east!.stops) {
      const node = getWorldInteractable(stop.id)!; expect(node, stop.name).toBeDefined();
      expect({ x: stop.x, y: stop.y }).toEqual({ x: node.x, y: node.y });
      expect(stop.x).toBeGreaterThanOrEqual(east!.view.x); expect(stop.x).toBeLessThanOrEqual(east!.view.x + east!.view.size);
      expect(stop.y).toBeGreaterThanOrEqual(east!.view.y); expect(stop.y).toBeLessThanOrEqual(east!.view.y + east!.view.size);
      expect(node.stock).toBeGreaterThan(0); expect(node.respawnSec).toBeGreaterThan(0);
    }
    const ids = WORLD_SUPPLY_ROUTES.flatMap(route => route.stops.map(stop => stop.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('places food and usable workshop materials before guarded salvage and explains the extra requirements', () => {
    const east = WORLD_SUPPLY_ROUTES.find(route => route.id === 'east');
    expect(east).toBeDefined();
    const [farm, workshop, tanker] = east!.stops;
    const loot = (id: string) => getWorldInteractable(id)!.lootTable!;
    expect(loot(farm.id).map(i => [i.itemId, i.count])).toEqual([['food', 3], ['water', 2], ['seed_potato', 1]]);
    const stock = loot(workshop.id);
    expect(stock.find(i => i.itemId === 'scrap')!.count).toBeGreaterThanOrEqual(BUILD_RECIPES.workbench!.scrap! + BUILD_RECIPES.storage_box!.scrap!);
    expect(stock.find(i => i.itemId === 'part')!.count).toBeGreaterThanOrEqual(BUILD_RECIPES.workbench!.parts!);
    expect(farm.description).toContain('南侧'); expect(workshop.description).toContain('南侧');
    expect(workshop.description).toContain('木材'); expect(workshop.description).toContain('石料'); expect(workshop.description).toContain('回营');
    expect(tanker.description).toContain('怪物'); expect(tanker.description).toContain('交易'); expect(tanker.description).not.toContain('熔炉');
    expect(loot(tanker.id).some(i => i.itemId === 'fuel')).toBe(true);
  });

  it('connects deeper finite salvage to actual research, turret and ammo costs while retaining food and combat conditions', () => {
    const east = WORLD_SUPPLY_ROUTES.find(route => route.id === 'east'); expect(east).toBeDefined();
    const [diner, press, shelves] = east!.stops.slice(4);
    expect(getWorldInteractable(diner.id)!.lootTable!.map(i => [i.itemId, i.count])).toEqual([['food', 10], ['water', 6]]);
    const stock = [press, shelves].flatMap(stop => getWorldInteractable(stop.id)!.lootTable!);
    const amount = (id: string) => stock.filter(i => i.itemId === id).reduce((sum, i) => sum + i.count, 0);
    const ammo = craftingRecipe('ammo_pack')!.cost;
    expect(amount('scrap')).toBeGreaterThanOrEqual(BUILD_RECIPES.research_table!.scrap! + BUILD_RECIPES.turret!.scrap! + ammo.scrap);
    expect(amount('part')).toBeGreaterThanOrEqual(BUILD_RECIPES.research_table!.parts! + BUILD_RECIPES.turret!.parts! + ammo.parts);
    expect(press.description).toContain('高风险'); expect(press.description).toContain('研究台'); expect(press.description).toContain('蓝图');
    expect(shelves.description).toContain('炮塔'); expect(shelves.description).toContain('装弹'); expect(diner.description).toContain('返程');
  });

  it('marks real northern food before the open powder store without inventing loot', () => {
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
    expect(supplies(powder!.id)).toContainEqual(['c4_explosive', 1]);
    expect(supplies(powder!.id)).toContainEqual(['ammo', 20]);
    expect(north.stops.indexOf(food!)).toBeLessThan(north.stops.indexOf(powder!));
    expect(food!.description).toContain('南侧'); expect(food!.description).toContain('食物');
    expect(powder!.description).toContain('怪物'); expect(powder!.description).toContain('消耗');
    expect(powder!.description).toContain('撤离');
  });

  it('keeps southern room definitions separate from western map-only targets', () => {
    const south = WORLD_SUPPLY_ROUTES.find(route => route.id === 'south')!;
    expect(south.stops.map(point => point.id)).toEqual(WORLD_ROADSIDE_STOPS.filter(point => point.route === 'south').map(point => point.id));
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
