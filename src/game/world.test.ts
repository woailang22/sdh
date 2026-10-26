import { describe, expect, it } from 'vitest';
import { SUBMAPS } from './maps';
import { ITEM_DEFS } from './items';
import { findPath, isPositionBlocked } from './navigation';
import { groupBuildingsIntoHouses, houseCorners } from './house';
import {
  CHUNK_SIZE, WORLD_MIN, WORLD_MAX, WORLD_LOCATIONS,
  generateWorldChunk, getWorldInteractable, getWorldMonster, migrateWorldPosition,
  worldLocationAt, worldThemeAt, worldToChunk,
} from './world';

describe('continuous world coordinates', () => {
  it('gives the existing raider armory ammunition and mechanical supplies without new rare or explosive rewards', () => {
    const node = getWorldInteractable('world:24:5:container:town_ruins:rebel_chest')!;
    expect(node).toMatchObject({ name: '掠夺者军火大储物箱', type: 'box', x: 782, y: 170, stock: 1, maxStock: 1, respawnSec: 900 });
    expect(node.lootTable!.map(i => [i.itemId, i.count])).toEqual([['ammo', 20], ['part', 2]]);
    expect(getWorldInteractable('world:24:5:container:town_ruins:rebel_med')!.lootTable!.map(i => [i.itemId, i.count])).toEqual([['medkit', 3], ['bandage', 3]]);
    expect(getWorldInteractable('world:24:5:container:town_ruins:rebel_credits')!.lootTable!.map(i => [i.itemId, i.count])).toEqual([['credits', 50]]);
  });

  it.each([
    { x: -576, y: -152, prefix: 'forest_post', ownerId: 'npc_forest_syndicate', hp: 600 },
    { x: 782, y: 170, prefix: 'rebel_post', ownerId: 'npc_raider_boss', hp: 850 },
  ])('assigns the locked $prefix walls to their existing gate faction without changing durability', ({ x, y, prefix, ownerId, hp }) => {
    const c = worldToChunk(x, y), buildings = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) buildings.push(...generateWorldChunk(c.x + dx, c.y + dy).buildings);
    const walls = buildings.filter(b => b.id.includes(`:${prefix}_`) && b.type.endsWith('_wall'));
    expect(walls).toHaveLength(11);
    for (const wall of walls) expect(wall).toMatchObject({ ownerId, hp, maxHp: hp });
    const gate = buildings.find(b => b.id.endsWith(`:${prefix}_door`))!;
    expect(gate).toMatchObject({ ownerId, isOpen: false, isLocked: true });
    expect(SUBMAPS[prefix === 'forest_post' ? 'mtn_deep' : 'town_ruins'].buildings.filter(b => b.id.startsWith(prefix + '_') && b.type.endsWith('_wall')).every(b => !b.ownerId)).toBe(true);
  });

  it.each([
    { cx: -10, cy: -4, name: '林场农舍', x: -304, y: -112, type: 'shelves', items: [['food', 3], ['water', 2], ['seed_potato', 1]] },
    { cx: -14, cy: -4, name: '护林诊所', x: -424, y: -104, type: 'med_cabinet', items: [['bandage', 3], ['antidote', 1]] },
    { cx: -17, cy: -5, name: '锯木维修间', x: -528, y: -144, type: 'shelves', items: [['scrap', 8], ['part', 2]] },
  ])('gives the existing $name a usable supply purpose without moving its shell', ({ cx, cy, name, x, y, type, items }) => {
    const chunk = generateWorldChunk(cx, cy), prefix = `world:${cx}:${cy}:poi`;
    const house = groupBuildingsIntoHouses(chunk.buildings).find(h => h.key === prefix)!;
    expect(house.door).toMatchObject({ name: name + '入口', x, y: y + 3, doorWidth: 3, isOpen: true });
    expect(houseCorners(house.members)).toEqual({ x0: x - 5, x1: x + 5, y0: y - 3, y1: y + 3 });
    const cabinet = getWorldInteractable(prefix + ':supplies')!;
    expect(cabinet).toMatchObject({ type, x: x - 2, y: y - 2, respawnSec: 300 });
    expect(cabinet.lootTable!.map(item => [item.itemId, item.count])).toEqual(items);
    expect(findPath({ x, y: y + 5 }, cabinet, chunk.buildings).length).toBeGreaterThan(0);
  });
  it.each([
    { cx: -1, cy: 3, name: '麦穗农舍', x: -16, y: 112, width: 8, height: 6, items: [['food', 3], ['water', 2], ['seed_potato', 1]] },
    { cx: 0, cy: 6, name: '渡口维修工棚', x: 24, y: 216, width: 12, height: 8, items: [['scrap', 8], ['part', 2]] },
    { cx: -1, cy: 10, name: '芦湾诊所', x: -24, y: 344, width: 12, height: 8, items: [['bandage', 3], ['antidote', 1]] },
    { cx: 0, cy: 14, name: '泥岸补给仓库', x: 24, y: 472, width: 8, height: 6, items: [['scrap', 10], ['fuel', 2], ['battery', 1]] },
    { cx: 0, cy: 18, name: '裂隙前哨诊所', x: 16, y: 592, width: 8, height: 6, items: [['bandage', 3], ['antidote', 1]] },
  ])('gives $name a distinct purpose while retaining its old footprint and container identity', ({ cx, cy, name, x, y, width, height, items }) => {
    const chunk = generateWorldChunk(cx, cy), id = `world:${cx}:${cy}:poi`;
    const house = groupBuildingsIntoHouses(chunk.buildings).find(h => h.key === id)!;
    expect(house.door?.name).toBe(name + '入口');
    expect(house.door).toMatchObject({ id: id + ':door', x, y: y + height / 2, isOpen: true, doorWidth: 3 });
    expect(houseCorners(house.members)).toEqual({ x0: x - width / 2, x1: x + width / 2, y0: y - height / 2, y1: y + height / 2 });
    const cabinet = chunk.interactables.find(n => n.id === id + ':supplies')!;
    expect(cabinet).toMatchObject({ x: x - 2, y: y - 2, respawnSec: 300 });
    expect(cabinet.lootTable?.map(l => [l.itemId, l.count])).toEqual(items);
    expect(findPath({ x: house.door!.x, y: house.door!.y + 2 }, cabinet, chunk.buildings).length).toBeGreaterThan(0);
  });

  it('separates research supplies, lord equipment and the legendary fishing target', () => {
    const cache = getWorldInteractable('world:3:21:i:marsh_rift:rift_cache')!;
    const armory = getWorldInteractable('world:2:21:i:marsh_rift:rift_armory');
    const pond = getWorldInteractable('world:5:27:i:marsh_abyss:aby_legend_pond');
    expect(cache.lootTable?.find(l => l.itemId === 'dark_core')?.count).toBe(2);
    expect(cache.lootTable?.find(l => l.itemId === 'blueprint')?.count).toBe(1);
    expect(armory).toBeDefined(); expect(pond?.type).toBe('pond');
    for (const id of ['wp_svd', 'key_red', 'helmet_t4', 'vest_t5']) {
      expect(cache.lootTable?.some(l => l.itemId === id)).toBe(false);
      expect(armory?.lootTable?.find(l => l.itemId === id)?.count).toBe(1);
    }
    expect(cache.lootTable?.some(l => l.itemId === 'fish_legend')).toBe(false);
    expect(pond?.lootTable?.find(l => l.itemId === 'fish_legend')?.count).toBe(1);
    for (const [node, lordId] of [[armory, 'world:3:21:m:marsh_rift:rf1'], [pond, 'world:5:27:m:marsh_abyss:ab1']] as const) {
      const lord = getWorldMonster(lordId)!;
      expect(node).toBeDefined(); expect(lord.hp).toBeGreaterThanOrEqual(1000);
      expect(Math.hypot(node!.x - lord.x, node!.y - lord.y)).toBeLessThan(3);
    }
  });

  it('keeps special red-zone refresh schedules without changing ordinary resource defaults', () => {
    for (const [id, seconds] of [
      ['world:3:21:i:marsh_rift:rift_cache', 1800],
      ['world:2:21:i:marsh_rift:rift_armory', 2700],
      ['world:5:28:i:marsh_abyss:aby_cache', 2700],
      ['world:5:27:i:marsh_abyss:aby_legend_pond', 3600],
    ] as const) {
      const node = getWorldInteractable(id);
      expect(node, id).toMatchObject({ stock: 1, maxStock: 1, respawnSec: seconds });
    }
    expect(getWorldInteractable('world:3:21:i:marsh_rift:rift_core')).toMatchObject({ stock: 3, maxStock: 3, respawnSec: 300 });
  });

  it('provides several mineable copper sources around the quarry without spreading them across starter land', () => {
    const quarry = WORLD_LOCATIONS.find(l => l.sourceMapId === 'mtn_quarry')!;
    const center = worldToChunk(quarry.x, quarry.y);
    const nodes = [];
    for (let x = center.x - 4; x <= center.x + 4; x++) for (let y = center.y - 4; y <= center.y + 4; y++) nodes.push(...generateWorldChunk(x, y).interactables);
    const copper = nodes.filter(n => n.type === 'boulder' && n.lootTable?.some(drop => drop.itemId === 'ore_copper'));
    expect(copper.length).toBeGreaterThanOrEqual(4);
    for (const vein of copper) {
      expect(Math.hypot(vein.x - quarry.x, vein.y - quarry.y)).toBeLessThanOrEqual(96);
      expect(worldLocationAt(vein.x, vein.y).sourceMapId).toBe('mtn_quarry');
      expect(vein.stock).toBe(3);
      expect(getWorldInteractable(vein.id)).toEqual(vein);
    }
    const starterCopper = [];
    for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) starterCopper.push(...generateWorldChunk(x, y).interactables.filter(n => n.type === 'boulder' && n.lootTable?.some(drop => drop.itemId === 'ore_copper')));
    expect(starterCopper).toHaveLength(0);
  });

  it('uses floor division for negative coordinates and keeps the inclusive edge in the last chunk', () => {
    expect([WORLD_MIN, WORLD_MAX, CHUNK_SIZE]).toEqual([-1024, 1024, 32]);
    expect(worldToChunk(-0.01, -32.01)).toEqual({ x: -1, y: -2 });
    expect(worldToChunk(-32, 31.99)).toEqual({ x: -1, y: 0 });
    expect(worldToChunk(WORLD_MIN, WORLD_MAX)).toEqual({ x: -32, y: 31 });
    expect(worldToChunk(-2000, 2000)).toEqual({ x: -32, y: 31 });
  });

  it('places all old public landmarks in a single geography', () => {
    expect(WORLD_LOCATIONS.map((l) => l.sourceMapId).sort()).toEqual(
      Object.keys(SUBMAPS).filter((id) => !id.startsWith('home_')).sort(),
    );
    for (const location of WORLD_LOCATIONS) {
      expect(worldLocationAt(location.x, location.y).id).toBe(location.id);
      expect(location.name).toBe(SUBMAPS[location.sourceMapId].name);
    }
    expect(worldLocationAt(0, 0).sourceMapId).toBe('camp_plaza');
    expect(WORLD_LOCATIONS.find((l) => l.sourceMapId === 'mtn_logging')!.x).toBeLessThan(0);
    expect(WORLD_LOCATIONS.find((l) => l.sourceMapId === 'mtn_quarry')!.y).toBeLessThan(0);
    expect(WORLD_LOCATIONS.find((l) => l.sourceMapId === 'town_factory')!.x).toBeGreaterThan(0);
    expect(WORLD_LOCATIONS.find((l) => l.sourceMapId === 'marsh_bog')!.y).toBeGreaterThan(0);
  });

  it('migrates public positions by landmark offsets while preserving personal spaces', () => {
    for (const location of WORLD_LOCATIONS) {
      expect(migrateWorldPosition(location.sourceMapId, 5, -7)).toEqual({
        mapId: 'world', x: location.x + 5, y: location.y - 7,
      });
    }
    expect(migrateWorldPosition('home_player', 3, -9)).toEqual({ mapId: 'home_player', x: 3, y: -9 });
    expect(migrateWorldPosition('world', 7, 9)).toEqual({ mapId: 'world', x: 7, y: 9 });
    expect(migrateWorldPosition('forest', 0, 0).mapId).toBe('world');
  });

  it('keeps roads continuous over chunk boundaries and supplies a continuous stream', () => {
    for (let x = -1000; x <= 1000; x += 16) {
      expect(['field', 'urban', 'camp', 'plaza']).toContain(worldThemeAt(x, 0));
    }
    for (let y = 140; y < 1000; y += 16) {
      const riverX = 100 + Math.sin(y / 110) * 30;
      expect(['lake', 'field', 'urban']).toContain(worldThemeAt(riverX, y));
    }
    expect(worldThemeAt(-600, -100)).toBe('forest');
    expect(worldThemeAt(-170, -710)).toBe('quarry');
    expect(worldThemeAt(800, 200)).toBe('ruins');
  });

  it('offers coherent woodland, rock, water and open ground during early exploration', () => {
    for (const [x, y, theme] of [[-55, 25, 'forest'], [30, -52, 'quarry'], [78, 62, 'lake'], [42, 35, 'field']] as const) {
      for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        expect(worldThemeAt(x + dx, y + dy), `${x + dx},${y + dy}`).toBe(theme);
      }
    }
  });
});

describe('deterministic, local world generation', () => {
  const neighborhood = (x: number, y: number, radius = 2) => {
    const center = worldToChunk(x, y);
    const chunks = [];
    for (let dx = -radius; dx <= radius; dx++) for (let dy = -radius; dy <= radius; dy++) chunks.push(generateWorldChunk(center.x + dx, center.y + dy));
    return { interactables: chunks.flatMap(c => c.interactables), buildings: chunks.flatMap(c => c.buildings) };
  };

  it('provides reachable starter wood and stone within the first short walk', () => {
    const { interactables, buildings } = neighborhood(0, 1);
    const nearby = interactables.filter(e => e.type !== 'workbench' && Math.hypot(e.x, e.y - 1) <= 24);
    expect(nearby.length).toBeGreaterThanOrEqual(6);
    expect(nearby.length).toBeLessThanOrEqual(9);
    for (const itemId of ['wood', 'stone']) {
      const sources = nearby.filter(e => e.lootTable?.some(l => l.itemId === itemId));
      expect(sources.length, itemId).toBeGreaterThanOrEqual(2);
      expect(sources.some(e => findPath({ x: 0, y: 1 }, e, buildings).length > 0), itemId).toBe(true);
    }
  });

  it('limits supplementary resources instead of filling every available grid position', () => {
    let total = 0;
    for (let cx = -8; cx < 8; cx++) for (let cy = -8; cy < 8; cy++) {
      const nodes = generateWorldChunk(cx, cy).interactables;
      const supplementary = nodes.filter(e => e.id.includes(':forage:'));
      expect(supplementary.length, `${cx},${cy}`).toBeLessThanOrEqual(5);
      total += supplementary.length;
    }
    expect(total).toBeLessThan(700);
  });

  it('keeps land resources out of the new pond and provides a real fishing source', () => {
    const { interactables } = neighborhood(78, 62);
    const wet = interactables.filter(e => worldThemeAt(e.x, e.y) === 'lake' && Math.hypot(e.x - 78, e.y - 62) < 24);
    expect(wet.length).toBeGreaterThan(0);
    expect(wet.every(e => e.type === 'pond')).toBe(true);
    expect(wet.some(e => e.lootTable?.some(l => l.itemId === 'fish'))).toBe(true);
  });

  it('puts an enterable, stocked building near spawn rather than leaving a landmark exclusion desert', () => {
    const { buildings, interactables } = neighborhood(0, 1);
    const door = buildings.find(b => b.id.includes(':poi:') && b.type === 'door' && Math.hypot(b.x, b.y - 1) <= 36);
    expect(door).toBeDefined();
    const inside = { x: door!.x, y: door!.y - 2 };
    expect(isPositionBlocked(inside.x, inside.y, buildings)).toBe(false);
    expect(findPath({ x: 0, y: 1 }, inside, buildings).length).toBeGreaterThan(0);
    const cabinet = interactables.find(e => e.id === door!.id.replace(/:door$/, ':supplies'));
    expect(cabinet?.lootTable?.some(l => l.itemId === 'food')).toBe(true);
    expect(cabinet?.lootTable?.some(l => l.itemId === 'water')).toBe(true);
  });

  it('sizes starter cottages separately from larger warehouses', () => {
    const starter = groupBuildingsIntoHouses(generateWorldChunk(0, 0).buildings).find(g => g.key === 'world:0:0:poi')!;
    const small = houseCorners(starter.members);
    expect([small.x1 - small.x0, small.y1 - small.y0]).toEqual([8, 6]);
    expect(starter.door?.doorWidth).toBe(3);
  });

  it('keeps roads supplied with discoverable buildings and nearby resources across the world', () => {
    for (const x of [-928, -512, -320, -160, 96, 160, 320, 512, 928]) {
      for (const y of [0, 128]) {
        const { buildings, interactables } = neighborhood(x, y);
        expect(buildings.some(b => b.type === 'door' && Math.hypot(b.x - x, b.y - y) <= 64), `${x},${y}`).toBe(true);
        expect(interactables.filter(e => e.type !== 'workbench' && Math.hypot(e.x - x, e.y - y) <= 32).length, `${x},${y}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('recreates chunks independently without sharing mutable template or loot references', () => {
    const a = generateWorldChunk(0, 0);
    const b = generateWorldChunk(0, 0);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    a.interactables[0].available = false;
    a.buildings[0].hp = 1;
    expect(generateWorldChunk(0, 0)).toEqual(b);
    const withLoot = generateWorldChunk(7, 0);
    const item = withLoot.interactables.find((e) => e.lootTable?.length)!;
    expect(item).toBeDefined();
    const originalCount = getWorldInteractable(item.id)!.lootTable![0].count;
    item.lootTable![0].count = 99999;
    expect(getWorldInteractable(item.id)!.lootTable![0].count).toBe(originalCount);
  });

  it('translates original resources and monsters into exactly their owning chunk', () => {
    for (const location of WORLD_LOCATIONS) {
      const source = SUBMAPS[location.sourceMapId];
      for (const original of [...source.interactables, ...source.monsters]) {
        const x = original.x + location.x;
        const y = original.y + location.y;
        const c = worldToChunk(x, y);
        const chunk = generateWorldChunk(c.x, c.y);
        const entity = [...chunk.interactables, ...chunk.monsters].find((e) => e.id.endsWith(`:${original.id}`));
        expect(entity, `${location.id}:${original.id}`).toMatchObject({ x, y, name: original.name });
        if ('spawnX' in original) expect(entity).toMatchObject({ spawnX: x, spawnY: y });
      }
    }
  });

  it('recovers resource definitions directly from stable chunk IDs and rejects malformed IDs', () => {
    for (const [cx, cy] of [[0, 0], [-1, -1], [-24, 15], [31, -32]]) {
      for (const entity of generateWorldChunk(cx, cy).interactables) {
        expect(entity.id.startsWith(`world:${cx}:${cy}:`)).toBe(true);
        expect(getWorldInteractable(entity.id)).toEqual(entity);
      }
    }
    for (const id of ['tree', 'world:999:0:i:x', 'world:NaN:0:i:x', 'world:0:0:i:missing']) {
      expect(getWorldInteractable(id)).toBeUndefined();
    }
  });

  it('keeps saved resource positions and stable door identities through room layout updates', () => {
    expect(getWorldInteractable('world:-2:-1:node:0')).toMatchObject({ x: -58, y: -25, type: 'tree' });
    expect(getWorldInteractable('world:-2:-1:node:5')).toMatchObject({ x: -40, y: -15, type: 'box' });
    expect(generateWorldChunk(-32, -32).buildings.find(b => b.id === 'world:-32:-32:poi:door')).toMatchObject({ x: -1008, doorWidth: 3 });
  });

  it('turns authored public storage into searchable thematic containers instead of private warehouses', () => {
    for (const location of WORLD_LOCATIONS) {
      for (const original of SUBMAPS[location.sourceMapId].buildings.filter((b) => b.type === 'storage_box')) {
        const c = worldToChunk(location.x + original.x, location.y + original.y);
        const chunk = generateWorldChunk(c.x, c.y);
        expect(chunk.buildings.some((b) => b.type === 'storage_box')).toBe(false);
        const container = chunk.interactables.find((e) => e.id.endsWith(`:${original.id}`));
        if (location.region === 'camp') {
          expect(container).toBeUndefined();
          continue;
        }
        expect(container, original.id).toMatchObject({ type: 'box', x: original.x + location.x, y: original.y + location.y });
        expect(container).toMatchObject({ stock: 1, maxStock: 1 });
        expect(container!.lootTable!.length).toBeGreaterThan(0);
        expect(getWorldInteractable(container!.id)).toEqual(container);
        for (const drop of container!.lootTable!) {
          expect(ITEM_DEFS[drop.itemId], original.id).toBeDefined();
          expect(drop.count).toBeGreaterThan(0);
          if (drop.itemId === 'credits') expect(drop.count).toBeLessThanOrEqual(50);
        }
        const ids = container!.lootTable!.map((l) => l.itemId);
        if (original.id === 'gas_office_med') expect(ids).toEqual(['medkit', 'antidote']);
        if (original.id === 'st_dn_water') expect(ids).toEqual(['water']);
        if (original.id === 'st_hw_box') expect(ids).toContain('part');
        if (original.id === 'lg_cabin_wood') expect(ids).toEqual(['wood']);
      }
    }
  });

  it('reconstructs authored and generated monsters by chunk ID without sharing mutable state', () => {
    const location = WORLD_LOCATIONS.find((l) => l.id === 'town_gas')!;
    const original = SUBMAPS.town_gas.monsters[0];
    const c = worldToChunk(location.x + original.x, location.y + original.y);
    const monster = generateWorldChunk(c.x, c.y).monsters.find((m) => m.id.endsWith(`:${original.id}`))!;
    expect(getWorldMonster(monster.id)).toEqual(monster);
    monster.hp = 1;
    expect(getWorldMonster(monster.id)!.hp).toBe(original.maxHp);
    const roamer = [-32, -31, -30, -29, -28, -27, -26, -25]
      .flatMap((x) => generateWorldChunk(x, -30).monsters).find((m) => m.id.includes(':roamer:'))!;
    expect(roamer).toBeDefined();
    expect(getWorldMonster(roamer.id)).toEqual(roamer);
    expect(getWorldMonster('world:100:0:roamer:0')).toBeUndefined();
    expect(getWorldMonster('invalid')).toBeUndefined();
  });

  it('returns empty chunks outside the finite world', () => {
    for (const [x, y] of [[-33, 0], [32, 0], [0, 32], [0.5, 0], [NaN, 0]]) {
      const chunk = generateWorldChunk(x, y);
      expect(chunk.interactables).toEqual([]);
      expect(chunk.monsters).toEqual([]);
      expect(chunk.buildings).toEqual([]);
    }
  });

  it('keeps world density bounded, uniquely partitioned, and populated beyond the old landmarks', () => {
    const seen = new Set<string>();
    const distantPoiQuadrants = new Set<string>();
    const types = new Set<string>();
    for (let cx = -32; cx < 32; cx++) {
      for (let cy = -32; cy < 32; cy++) {
        const chunk = generateWorldChunk(cx, cy);
        expect(chunk.interactables.length).toBeLessThanOrEqual(32);
        expect(chunk.monsters.length).toBeLessThanOrEqual(10);
        expect(chunk.buildings.length).toBeLessThanOrEqual(100);
        for (const resource of chunk.interactables) {
          expect(chunk.buildings.some((b) => b.type.includes('wall') && Math.hypot(b.x - resource.x, b.y - resource.y) < 0.9), resource.id).toBe(false);
        }
        for (const entity of [...chunk.interactables, ...chunk.monsters, ...chunk.buildings]) {
          expect(Number.isFinite(entity.x) && Number.isFinite(entity.y)).toBe(true);
          expect(entity.x).toBeGreaterThanOrEqual(WORLD_MIN);
          expect(entity.x).toBeLessThan(WORLD_MAX);
          expect(entity.y).toBeGreaterThanOrEqual(WORLD_MIN);
          expect(entity.y).toBeLessThan(WORLD_MAX);
          expect(worldToChunk(entity.x, entity.y)).toEqual({ x: cx, y: cy });
          expect(seen.has(entity.id), entity.id).toBe(false);
          seen.add(entity.id);
          if ('type' in entity) types.add(entity.type);
          if (entity.id.includes(':poi:') && Math.abs(entity.x) > 700 && Math.abs(entity.y) > 700) {
            distantPoiQuadrants.add(`${Math.sign(entity.x)},${Math.sign(entity.y)}`);
          }
        }
      }
    }
    expect(distantPoiQuadrants.size).toBe(4);
    for (const type of ['tree', 'boulder', 'pond', 'scrap', 'med_cabinet', 'shelves']) expect(types.has(type)).toBe(true);
  }, 20000);

  it('provides open, unlocked public doors with a wide usable entrance and fitting interior containers', () => {
    let poiCount = 0;
    for (let cx = -32; cx < 32; cx++) {
      for (let cy = -32; cy < 32; cy++) {
        const chunk = generateWorldChunk(cx, cy);
        for (const door of chunk.buildings.filter((b) => b.type === 'door')) {
          expect(door.isOpen).toBe(true);
          expect(door.isLocked).toBe(false);
          const nearbyWalls = chunk.buildings.filter((b) => b.type.includes('wall') && Math.hypot(b.x - door.x, b.y - door.y) < 1.5);
          expect(nearbyWalls, door.id).toHaveLength(0);
          if (door.id.includes(':poi:')) {
            poiCount++;
            const containers = chunk.interactables.filter((e) => e.id.includes(':poi:'));
            expect(containers.length).toBeGreaterThan(0);
            for (const container of containers) {
              expect(container.y).toBeLessThan(door.y);
              expect(container.lootTable?.length).toBeGreaterThan(0);
              if (container.type === 'med_cabinet') expect(container.lootTable!.every((l) => ['bandage', 'antidote', 'medkit'].includes(l.itemId))).toBe(true);
            }
          }
        }
      }
    }
    expect(poiCount).toBeGreaterThan(100);
  }, 20000);

  it('leaves room to walk between the entrances and furniture in translated landmark buildings', () => {
    for (const [mapId, prefix] of [['town_gas', 'gas_office'], ['mtn_logging', 'lg_cabin'], ['marsh_docks', 'dock_hut']]) {
      const location = WORLD_LOCATIONS.find((l) => l.id === mapId)!;
      const chunk = worldToChunk(location.x, location.y);
      const buildings = [];
      const storage = [];
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const generated = generateWorldChunk(chunk.x + dx, chunk.y + dy);
        buildings.push(...generated.buildings.filter((b) => b.id.includes(`:${prefix}_`)));
        storage.push(...generated.interactables.filter((e) => e.id.includes(`:container:${location.id}:`) && e.id.includes(`:${prefix}_`)));
      }
      const door = buildings.find((b) => b.type === 'door')!;
      expect(storage.length).toBeGreaterThan(0);
      for (const box of storage) expect(Math.hypot(box.x - door.x, box.y - door.y), `${mapId}:${box.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it('preserves the initial public spawn and excludes the tutorial private territory', () => {
    for (let cx = -1; cx <= 1; cx++) {
      for (let cy = -1; cy <= 1; cy++) {
        const chunk = generateWorldChunk(cx, cy);
        expect([...chunk.interactables, ...chunk.monsters, ...chunk.buildings].every((e) => Math.hypot(e.x, e.y - 9) > 2)).toBe(true);
        expect(chunk.buildings.every((b) => b.ownerId !== 'demo_player_nightblade')).toBe(true);
      }
    }
    const out = WORLD_LOCATIONS.find((l) => l.sourceMapId === 'camp_outskirts')!;
    const c = worldToChunk(out.x + 18, out.y - 4);
    expect(generateWorldChunk(c.x, c.y).buildings.some((b) => b.id.includes('demo_yard'))).toBe(false);
  });
});
