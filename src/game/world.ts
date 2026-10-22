import type { BuildingEntity, GroundTheme, InteractableEntity, MapZoneId, MonsterEntity, RegionId, SubMapDef } from '../types/game';
import { SUBMAPS } from './maps';
import { ITEM_DEFS } from './items';
import { buildCompoundWalls } from './compound';
import { groupBuildingsIntoHouses, houseCorners } from './house';

export const WORLD_MIN = -1024;
export const WORLD_MAX = 1024;
export const CHUNK_SIZE = 32;
export interface WorldLocation {
  id: string; name: string; x: number; y: number; theme: GroundTheme;
  region: RegionId; risk: SubMapDef['risk']; sourceMapId: MapZoneId;
}
export interface WorldChunk {
  key: string; interactables: InteractableEntity[]; monsters: MonsterEntity[]; buildings: BuildingEntity[];
}

const LANDMARK_OFFSETS: [MapZoneId, number, number][] = [
  ['camp_plaza', 0, 0], ['camp_workshop', 64, 0], ['camp_outskirts', 0, 72],
  ['mtn_logging', -240, 0], ['mtn_deep', -560, -160],
  ['mtn_quarry', -128, -352], ['mtn_peak', -160, -720],
  ['town_gas', 240, 0], ['town_street', 448, 32],
  ['town_factory', 640, -64], ['town_ruins', 760, 176],
  ['marsh_docks', 0, 256], ['marsh_bog', -80, 480],
  ['marsh_rift', 96, 688], ['marsh_abyss', 160, 880],
];

export const WORLD_LOCATIONS: WorldLocation[] = LANDMARK_OFFSETS.map(([sourceMapId, x, y]) => {
  const def = SUBMAPS[sourceMapId];
  return { id: sourceMapId, sourceMapId, x, y, name: def.name, theme: def.theme, region: def.region, risk: def.risk };
});

const MIN_CHUNK = WORLD_MIN / CHUNK_SIZE;
const MAX_CHUNK = WORLD_MAX / CHUNK_SIZE - 1;
const clampPosition = (v: number) => Math.max(WORLD_MIN, Math.min(WORLD_MAX, Number.isFinite(v) ? v : 0));

/** The upper world edge belongs to the last chunk, rather than creating a 65th row. */
export function worldToChunk(x: number, y: number): { x: number; y: number } {
  return {
    x: Math.min(MAX_CHUNK, Math.floor(clampPosition(x) / CHUNK_SIZE)),
    y: Math.min(MAX_CHUNK, Math.floor(clampPosition(y) / CHUNK_SIZE)),
  };
}

export function worldLocationAt(x: number, y: number): WorldLocation {
  let nearest = WORLD_LOCATIONS[0];
  let distance = Infinity;
  for (const location of WORLD_LOCATIONS) {
    const d = (x - location.x) ** 2 + (y - location.y) ** 2;
    if (d < distance) { distance = d; nearest = location; }
  }
  return nearest;
}

export function worldIsRoad(x: number, y: number, margin = 3): boolean {
  // Main roads and secondary east-west trails use global coordinates, never chunk-local noise.
  if (Math.abs(x) <= margin || Math.abs(y) <= margin) return true;
  if (Math.abs(y - Math.round(y / 128) * 128) <= margin) return true;
  return WORLD_LOCATIONS.some((l) => Math.abs(l.x) < Math.abs(l.y)
    ? Math.abs(y - l.y) <= margin && x >= Math.min(0, l.x) - margin && x <= Math.max(0, l.x) + margin
    : Math.abs(x - l.x) <= margin && y >= Math.min(0, l.y) - margin && y <= Math.max(0, l.y) + margin);
}

function onStream(x: number, y: number, margin = 4): boolean {
  return y > 120 && Math.abs(x - (100 + Math.sin(y / 110) * 30)) < margin;
}

function originalWorldThemeAt(x: number, y: number): GroundTheme {
  const location = worldLocationAt(x, y);
  if (Math.hypot(x, y) < 16) return 'camp';
  if (worldIsRoad(x, y)) return x > 130 ? 'urban' : 'field';
  if (onStream(x, y)) return 'lake';
  return location.theme;
}

export function worldThemeAt(x: number, y: number): GroundTheme {
  const original = originalWorldThemeAt(x, y);
  if (Math.hypot(x, y) < 16 || worldIsRoad(x, y) || worldLocationAt(x, y).region !== 'camp') return original;
  // Broad, irregular edges form recognizable places rather than per-tile noise.
  const edge = Math.sin(x / 13) * 0.08 + Math.sin(y / 11) * 0.06;
  if (((x + 55) / 68) ** 2 + ((y - 25) / 40) ** 2 < 1 + edge) return 'forest';
  if (((x - 30) / 38) ** 2 + ((y + 52) / 34) ** 2 < 1 + edge) return 'quarry';
  if (((x - 78) / 22) ** 2 + ((y - 62) / 12) ** 2 < 1 + edge) return 'lake';
  return original === 'camp' || original === 'plaza' ? 'field' : original;
}

function hash(x: number, y: number, salt = 0): number {
  let value = Math.imul(x + 16384, 374761393) ^ Math.imul(y + 16384, 668265263) ^ Math.imul(salt + 1, 1274126177);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return (value ^ (value >>> 16)) >>> 0;
}

const inWorld = (x: number, y: number) => x >= WORLD_MIN && x < WORLD_MAX && y >= WORLD_MIN && y < WORLD_MAX;
const nearLandmark = (x: number, y: number, radius: number) => WORLD_LOCATIONS.some((l) => Math.hypot(x - l.x, y - l.y) < radius);

function loot(itemId: string, count: number): { itemId: string; name: string; count: number } {
  return { itemId, name: ITEM_DEFS[itemId]?.name ?? itemId, count };
}

function resource(id: string, name: string, type: InteractableEntity['type'], x: number, y: number, drops: { itemId: string; name: string; count: number }[]): InteractableEntity {
  return {
    id, name, type, x, y, radius: 2.8, prompt: '[E/F 采集 / 搜索]',
    available: true, searchDuration: type === 'box' ? 1.2 : 1.8, lootTable: drops,
    stock: 3, maxStock: 3, respawnSec: 300,
  };
}

const ITEM_ID_BY_NAME = new Map(Object.values(ITEM_DEFS).map((item) => [item.name, item.id]));
const PUBLIC_LOOT_KEYWORDS: [RegExp, string][] = [
  [/信用|旧钞|赃款/, 'credits'], [/绷带/, 'bandage'], [/解毒/, 'antidote'],
  [/医疗|急救|针剂/, 'medkit'], [/信号.*弹/, 'ammo_signal'], [/弹药|穿甲弹|步枪弹/, 'ammo'],
  [/炸药|爆破|C4/i, 'c4_explosive'], [/原木|杉木|松木|枯木|纤维/, 'wood'],
  [/石块|石料|花岗/, 'stone'], [/铁矿/, 'iron_ore'], [/废铁|钢板|角钢|钢梁/, 'scrap'],
  [/零件|轴承|链条|活塞|齿轮|电机|紧固件/, 'part'], [/电池|电瓶/, 'battery'],
  [/燃油|柴油/, 'fuel'], [/饮用水|桶装水/, 'water'], [/鱼获|青鱼/, 'fish'],
  [/口粮|干粮|食储|肉|鱼干|罐头|莲藕|能量合剂/, 'food'],
];

function publicContainerLoot(original: BuildingEntity, location: WorldLocation): NonNullable<InteractableEntity['lootTable']> {
  const drops = new Map<string, number>();
  for (const stored of original.storedLoot ?? []) {
    const itemId = ITEM_ID_BY_NAME.get(stored.name) ?? PUBLIC_LOOT_KEYWORDS.find(([pattern]) => pattern.test(stored.name))?.[1];
    if (!itemId || !Number.isFinite(stored.count) || stored.count <= 0) continue;
    // Old demonstration stashes contained hundreds of currency units. Public
    // containers use finite, modest stock rather than importing that economy.
    const cap = itemId === 'credits' ? 50 : ITEM_DEFS[itemId]?.category === 'medical' ? 3 : 20;
    drops.set(itemId, Math.min(cap, (drops.get(itemId) ?? 0) + Math.floor(stored.count)));
  }
  if (drops.size === 0) {
    const thematic = PUBLIC_LOOT_KEYWORDS.find(([pattern]) => pattern.test(original.name))?.[1];
    const itemId = thematic ?? (location.region === 'town' ? 'scrap' : location.region === 'mountain' ? 'stone' : 'food');
    drops.set(itemId, ['part', 'medkit', 'c4_explosive', 'battery'].includes(itemId) ? 2 : 5);
  }
  return [...drops].map(([itemId, count]) => loot(itemId, count));
}

/** Ordinary public doors have a three-tile opening; high-risk locked rooms retain their locks. */
function publicBuildings(location: WorldLocation): BuildingEntity[] {
  if (location.sourceMapId === 'camp_outskirts') return [];
  let buildings = SUBMAPS[location.sourceMapId].buildings.filter((b) => b.type !== 'storage_box');
  for (const door of buildings.filter((b) => b.type === 'door')) {
    const prefix = door.id.replace(/_door$/, '');
    const shell = buildings.filter((b) => b.id.startsWith(`${prefix}_`) && (b.type.includes('wall') || b.type === 'door'));
    const wall = shell.find((b) => b.type === 'wood_wall' || b.type === 'stone_wall' || b.type === 'iron_wall');
    if (!wall || shell.length < 8) continue;
    const minX = Math.min(...shell.map((b) => b.x));
    const maxX = Math.max(...shell.map((b) => b.x));
    const minY = Math.min(...shell.map((b) => b.y));
    const maxY = Math.max(...shell.map((b) => b.y));
    // Legacy 4×2 rooms were completely filled by three boxes. Preserve the
    // furniture coordinates and expand only their public outer walls.
    const expanded = buildCompoundWalls({
      idPrefix: prefix, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
      w: Math.max(8, maxX - minX), h: Math.max(8, maxY - minY),
      wallType: wall.type as 'wood_wall' | 'stone_wall' | 'iron_wall', wallName: wall.name,
      ownerName: wall.ownerName ?? '公共遗迹', wallHp: wall.hp, level: wall.level,
      doorSide: door.y === maxY ? 'S' : door.y === minY ? 'N' : door.x === minX ? 'W' : 'E',
      doorType: 'door', doorName: door.name,
      doorExtra: { isOpen: true, isLocked: false, doorWidth: 3, mapId: 'world' },
    });
    const replaced = new Set(shell.map((b) => b.id));
    buildings = [...buildings.filter((b) => !replaced.has(b.id)), ...expanded];
  }
  const doors = buildings.filter((b) => b.type === 'door');
  return buildings.filter((b) => !b.type.includes('wall') || !doors.some((d) =>
    Math.hypot(b.x - d.x, b.y - d.y) < 1.5,
  ));
}

function populatePointOfInterest(chunk: WorldChunk, x: number, y: number, starter = false) {
  const location = worldLocationAt(x, y);
  const variant = hash(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE), 72) % 4;
  const kind = starter ? 0 : location.region === 'town' ? variant : location.region === 'mountain' ? 2 : variant % 2 === 0 ? 0 : 3;
  const labels = ['路边农舍', '野外诊所', '维修工棚', '补给仓库'];
  const [width, height] = [[8, 6], [8, 8], [10, 6], [12, 8]][kind];
  const prefix = `${chunk.key}:poi`;
  const walls = buildCompoundWalls({
    idPrefix: prefix, cx: x, cy: y, w: width, h: height,
    wallType: location.region === 'town' ? 'stone_wall' : 'wood_wall',
    wallName: `${labels[kind]}外墙`, ownerName: '公共遗迹',
    doorSide: 'S', doorType: 'door', doorName: `${labels[kind]}入口`,
    doorExtra: { isOpen: true, isLocked: false, doorWidth: 3, mapId: 'world' },
  }).filter((b) => !(b.type.includes('wall') && b.y === y + height / 2 && Math.abs(b.x - x) < 2));
  chunk.buildings.push(...walls.map((b) => ({ ...b, id: b.id.replace(`${prefix}_`, `${prefix}:`), mapId: 'world' as const })));
  const drops = kind === 0 ? [loot('food', 3), loot('water', 2), loot('seed_potato', 1)]
    : kind === 1 ? [loot('bandage', 3), loot('antidote', 1)]
    : kind === 2 ? [loot('scrap', 8), loot('part', 2)]
    : [loot('scrap', 10), loot('fuel', 2), loot('battery', 1)];
  chunk.interactables.push(resource(`${prefix}:supplies`, `${labels[kind]}${kind === 1 ? '药柜' : '物资柜'}`, kind === 1 ? 'med_cabinet' : 'shelves', x - 2, y - 2, drops));
  if (location.risk === 'HIGH' || location.risk === 'EXTREME') {
    chunk.interactables.push(resource(`${prefix}:secured`, `${labels[kind]}封存补给`, 'ammo_crate', x + 2, y - 2,
      location.region === 'marsh' ? [loot('shard', 1), loot('bandage', 1)] : [loot('ammo', 12), loot('part', 2)]));
  }
}

function addPointOfInterest(chunk: WorldChunk, cx: number, cy: number): boolean {
  const x = cx * CHUNK_SIZE + 16;
  const y = cy * CHUNK_SIZE + 16;
  if (hash(cx, cy, 71) % 7 !== 0 || nearLandmark(x, y, 60) || worldIsRoad(x, y, 10) || onStream(x, y, 14)) return false;
  populatePointOfInterest(chunk, x, y);
  return true;
}

// Protect actual authored rooms, furniture and containers instead of excluding
// a 42–60 tile circle around every landmark. These bounds span chunk edges.
const LANDMARK_FOOTPRINTS = WORLD_LOCATIONS.flatMap(location => [
  ...groupBuildingsIntoHouses(publicBuildings(location)).map(group => {
    const { x0, x1, y0, y1 } = houseCorners(group.members);
    return { x0: x0 + location.x - 1, x1: x1 + location.x + 1, y0: y0 + location.y - 1, y1: y1 + location.y + 1 };
  }),
  ...SUBMAPS[location.sourceMapId].interactables.map(e => ({ x0: e.x + location.x - 2, x1: e.x + location.x + 2, y0: e.y + location.y - 2, y1: e.y + location.y + 2 })),
]);

function overlapsLandmark(x: number, y: number, halfWidth: number, halfHeight: number): boolean {
  return LANDMARK_FOOTPRINTS.some(b => x + halfWidth >= b.x0 && x - halfWidth <= b.x1 && y + halfHeight >= b.y0 && y - halfHeight <= b.y1);
}

function addRoadsideBuilding(chunk: WorldChunk, cx: number, cy: number) {
  if (chunk.buildings.some(b => b.type === 'door' || b.type === 'safe_door')) return;
  const midX = cx * CHUNK_SIZE + 16, midY = cy * CHUNK_SIZE + 16;
  if (!worldIsRoad(midX, midY, 24) && hash(cx, cy, 701) % 3 !== 0) return;
  const atSpawn = Math.abs(midX) < 32 && Math.abs(midY) < 32;
  if (atSpawn && cx !== cy) return; // Two nearby houses, with open gathering space on the other sides.
  // Try spare parts of the block before giving up. Existing nodes and houses
  // retain their IDs and positions, so previously depleted nodes stay depleted.
  const candidates = atSpawn ? [[cx < 0 ? 20 : 12, cy < 0 ? 20 : 12]] : [[16, 16], [24, 24], [8, 24], [24, 8], [8, 8], [16, 24], [24, 16]];
  for (const [dx, dy] of candidates) {
    const x = cx * CHUNK_SIZE + dx, y = cy * CHUNK_SIZE + dy;
    if (Math.hypot(x, y - 9) < 11 || worldIsRoad(x, y, 11) || onStream(x, y, 14) || overlapsLandmark(x, y, 7, 6)) continue;
    if (chunk.interactables.some(e => Math.abs(e.x - x) < 7 && Math.abs(e.y - y) < 6)) continue;
    if (chunk.monsters.some(m => Math.abs(m.x - x) < 9 && Math.abs(m.y - y) < 8)) continue;
    populatePointOfInterest(chunk, x, y, worldLocationAt(x, y).region === 'camp' && Math.hypot(x, y) < 64);
    return;
  }
}

function addForageResources(chunk: WorldChunk, cx: number, cy: number) {
  const rooms = groupBuildingsIntoHouses(chunk.buildings).filter(g => g.members.length >= 8).map(g => houseCorners(g.members));
  const candidates: InteractableEntity[] = [];
  for (let i = 0; i < 16; i++) {
    const x = cx * CHUNK_SIZE + 3 + (i % 4) * 8 + hash(cx, cy, 800 + i * 2) % 3;
    const y = cy * CHUNK_SIZE + 3 + Math.floor(i / 4) * 8 + hash(cx, cy, 801 + i * 2) % 3;
    if (Math.hypot(x, y - 9) < 8 || worldIsRoad(x, y, 4) || overlapsLandmark(x, y, 1, 1)) continue;
    if (rooms.some(r => x > r.x0 - 2 && x < r.x1 + 2 && y > r.y0 - 2 && y < r.y1 + 2)) continue;
    if (chunk.interactables.some(e => Math.hypot(e.x - x, e.y - y) < 3)) continue;
    // Retained IDs keep their original kind, loot and coordinates in existing saves.
    const location = worldLocationAt(x, y), theme = originalWorldThemeAt(x, y);
    const variant = hash(cx, cy, 900 + i) % 6;
    let node: InteractableEntity;
    if (theme === 'lake') node = resource('', '河岸浅滩', 'pond', x, y, [loot('fish', 1), loot('water', 1)]);
    else if (theme === 'rift') node = variant === 0 ? resource('', '裂隙晶簇', 'crystal', x, y, [loot('shard', 1)]) : resource('', '裂隙风化石', 'boulder', x, y, [loot('stone', 3)]);
    else if (location.region === 'town') node = variant < 2 ? resource('', '废弃车辆', 'car', x, y, [loot('scrap', 4), loot('part', 1)]) : resource('', '废料堆', 'scrap', x, y, [loot('scrap', 3)]);
    else if (theme === 'quarry') node = resource('', variant === 0 ? '露天铁矿' : '碎石堆', 'boulder', x, y, variant === 0 ? [loot('stone', 3), loot('iron_ore', 1)] : [loot('stone', 3)]);
    else node = variant === 0 ? resource('', '可拾取枯枝', 'box', x, y, [loot('wood', 3)])
      : variant === 1 ? resource('', '林边松树', 'tree', x, y, [loot('wood', 4)])
      : variant === 2 ? resource('', '可拾取碎石', 'box', x, y, [loot('stone', 3)])
      : variant === 3 ? resource('', '地表岩石', 'boulder', x, y, [loot('stone', 3)])
      : variant === 4 ? resource('', '遗落的行粮', 'box', x, y, [loot('food', 1), loot('water', 1)])
      : resource('', '散落金属', 'scrap', x, y, [loot('scrap', 2)]);
    node.id = `${chunk.key}:forage:${i}`;
    if (node.type === 'box' || node.type === 'car') { node.stock = 1; node.maxStock = 1; }
    candidates.push(node);
  }
  const atSpawn = cx >= -1 && cx <= 0 && cy >= -1 && cy <= 0;
  const theme = worldThemeAt(cx * CHUNK_SIZE + 16, cy * CHUNK_SIZE + 16);
  const target = atSpawn ? (cx === cy ? 3 : 2) : theme === 'forest' ? 10 : theme === 'quarry' ? 8 : theme === 'field' ? 4 : 6;
  const budget = Math.min(5, Math.max(0, target - chunk.interactables.length));
  const anchor = { x: cx * CHUNK_SIZE + 6 + hash(cx, cy, 1100) % 20, y: cy * CHUNK_SIZE + 6 + hash(cx, cy, 1101) % 20 };
  const score = (node: InteractableEntity) => {
    if (atSpawn) return Math.hypot(node.x, node.y - 1);
    const matches = node.lootTable?.some(l => l.itemId === (theme === 'forest' ? 'wood' : theme === 'quarry' ? 'stone' : ''));
    return Math.hypot(node.x - anchor.x, node.y - anchor.y) - (matches ? 24 : 0);
  };
  candidates.sort((a, b) => score(a) - score(b));
  const selected: InteractableEntity[] = [];
  if (atSpawn) for (const item of ['wood', 'stone']) {
    const node = candidates.find(e => Math.hypot(e.x, e.y - 1) <= 24 && e.lootTable?.some(l => l.itemId === item));
    if (node && selected.length < budget) selected.push(node);
  }
  for (const node of candidates) {
    if (selected.length >= budget) break;
    if (!selected.includes(node)) selected.push(node);
  }
  chunk.interactables.push(...selected);
}

export function generateWorldChunk(cx: number, cy: number): WorldChunk {
  const key = `world:${cx}:${cy}`;
  const chunk: WorldChunk = { key, interactables: [], monsters: [], buildings: [] };
  if (!Number.isInteger(cx) || !Number.isInteger(cy) || cx < MIN_CHUNK || cx > MAX_CHUNK || cy < MIN_CHUNK || cy > MAX_CHUNK) return chunk;
  const owns = (x: number, y: number) => inWorld(x, y) && Math.floor(x / CHUNK_SIZE) === cx && Math.floor(y / CHUNK_SIZE) === cy;
  for (const location of WORLD_LOCATIONS) {
    // Only the fixed small landmark catalog is considered, never other world chunks.
    if (Math.abs(location.x - (cx * CHUNK_SIZE + 16)) > 64 || Math.abs(location.y - (cy * CHUNK_SIZE + 16)) > 64) continue;
    const source = SUBMAPS[location.sourceMapId];
    for (const original of source.interactables) {
      const x = original.x + location.x;
      const y = original.y + location.y;
      if (!owns(x, y)) continue;
      chunk.interactables.push({
        ...original, id: `${key}:i:${location.id}:${original.id}`, x, y,
        lootTable: original.lootTable?.map((l) => ({ ...l })),
        ...(original.type === 'workbench' ? {} : { stock: original.stock ?? 3, maxStock: original.maxStock ?? original.stock ?? 3, respawnSec: original.respawnSec ?? 300 }),
      });
    }
    for (const original of source.monsters) {
      const x = original.x + location.x;
      const y = original.y + location.y;
      if (!owns(x, y)) continue;
      chunk.monsters.push({
        ...original, id: `${key}:m:${location.id}:${original.id}`, x, y, spawnX: x, spawnY: y,
        targetX: undefined, targetY: undefined, animTime: hash(Math.round(x), Math.round(y)) / 4294967296,
      });
    }
    if (location.region !== 'camp') {
      for (const original of source.buildings.filter((b) => b.type === 'storage_box')) {
        const x = original.x + location.x;
        const y = original.y + location.y;
        if (!owns(x, y)) continue;
        chunk.interactables.push({
          ...resource(`${key}:container:${location.id}:${original.id}`, original.name, 'box', x, y, publicContainerLoot(original, location)),
          stock: 1, maxStock: 1, respawnSec: 900,
        });
      }
    }
    for (const original of publicBuildings(location)) {
      const x = original.x + location.x;
      const y = original.y + location.y;
      if (!owns(x, y)) continue;
      chunk.buildings.push({
        ...original, id: `${key}:b:${location.id}:${original.id}`, x, y, mapId: 'world',
        storedLoot: original.storedLoot?.map((l) => ({ ...l })),
        ...(original.type === 'door' ? { isOpen: true, isLocked: false } : {}),
      });
    }
  }

  const hasPoi = addPointOfInterest(chunk, cx, cy);
  const count = 5 + hash(cx, cy, 2) % 5;
  for (let i = 0; i < count; i++) {
    // A small jittered grid leaves broad open gaps rather than forming solid tree walls.
    const x = cx * CHUNK_SIZE + 3 + (i % 3) * 10 + hash(cx, cy, i * 2 + 5) % 5;
    const y = cy * CHUNK_SIZE + 3 + Math.floor(i / 3) * 10 + hash(cx, cy, i * 2 + 6) % 5;
    if (nearLandmark(x, y, 42) || Math.hypot(x, y - 9) < 24 || worldIsRoad(x, y, 5)) continue;
    if (hasPoi && Math.abs(x - (cx * CHUNK_SIZE + 16)) < 8 && Math.abs(y - (cy * CHUNK_SIZE + 16)) < 10) continue;
    const location = worldLocationAt(x, y);
    const theme = originalWorldThemeAt(x, y);
    const variant = hash(cx, cy, i + 101) % 4;
    let node: InteractableEntity;
    if (theme === 'lake' || (location.region === 'marsh' && variant === 0)) {
      node = resource('', '河岸浅滩', 'pond', x, y, [loot('fish', 1), loot('water', 1)]);
    } else if (theme === 'rift') {
      node = variant === 0 ? resource('', '裂隙晶簇', 'crystal', x, y, [loot('shard', 1)])
        : resource('', '裂隙风化石', 'boulder', x, y, [loot('stone', 5)]);
    } else if (location.region === 'town') {
      node = variant === 0 ? resource('', '废弃车辆', 'car', x, y, [loot('scrap', 5), loot('part', 1)])
        : resource('', '散落废铁', 'scrap', x, y, [loot('scrap', 3)]);
    } else if (theme === 'quarry') {
      const copper = variant === 3 && location.sourceMapId === 'mtn_quarry' && Math.hypot(x - location.x, y - location.y) <= 96;
      node = resource('', copper ? '露天铜矿' : variant === 0 ? '露天铁矿' : '风化石堆', 'boulder', x, y,
        copper ? [loot('stone', 3), loot('ore_copper', 1)] : variant === 0 ? [loot('stone', 3), loot('iron_ore', 1)] : [loot('stone', 5)]);
    } else if (variant < 2) {
      node = resource('', variant === 0 ? '林间枯枝' : '黑松树', variant === 0 ? 'box' : 'tree', x, y, [loot('wood', variant === 0 ? 3 : 6)]);
    } else {
      node = resource('', '地表碎石', variant === 2 ? 'box' : 'boulder', x, y, [loot('stone', 3)]);
    }
    node.id = `${key}:node:${i}`;
    chunk.interactables.push(node);
  }

  const mx = cx * CHUNK_SIZE + 26;
  const my = cy * CHUNK_SIZE + 27;
  const location = worldLocationAt(mx, my);
  if (!hasPoi && location.risk !== 'SAFE' && !nearLandmark(mx, my, 50) && !worldIsRoad(mx, my, 6) && !onStream(mx, my, 8) && hash(cx, cy, 501) % 3 === 0) {
    const hp = location.risk === 'EXTREME' ? 280 : location.risk === 'HIGH' ? 180 : 90;
    chunk.monsters.push({
      id: `${key}:roamer:0`, name: location.region === 'marsh' ? '湿地潜行者' : location.region === 'town' ? '废土游荡者' : '林地异变兽',
      x: mx, y: my, spawnX: mx, spawnY: my, hp, maxHp: hp, speed: 1.8, damage: hp / 10,
      state: 'roam', animTime: 0, attackCooldown: 0, windup: 0,
    });
  }
  addRoadsideBuilding(chunk, cx, cy);
  addForageResources(chunk, cx, cy);
  chunk.interactables = chunk.interactables.filter(node => node.type === 'pond' ||
    worldThemeAt(node.x, node.y) !== 'lake' || originalWorldThemeAt(node.x, node.y) === 'lake');
  if (owns(90, 62)) chunk.interactables.push(resource(`${key}:water:0`, '野外浅水塘', 'pond', 90, 62, [loot('fish', 1), loot('water', 1)]));
  return chunk;
}

/** Recover a single static definition in bounded work; persistent depletion is stored separately. */
export function getWorldInteractable(id: string): InteractableEntity | undefined {
  const match = /^world:(-?\d+):(-?\d+):/.exec(id);
  if (!match) return undefined;
  return generateWorldChunk(Number(match[1]), Number(match[2])).interactables.find((e) => e.id === id);
}

export function getWorldMonster(id: string): MonsterEntity | undefined {
  const match = /^world:(-?\d+):(-?\d+):/.exec(id);
  if (!match) return undefined;
  return generateWorldChunk(Number(match[1]), Number(match[2])).monsters.find((monster) => monster.id === id);
}

export function migrateWorldPosition(mapId: MapZoneId, x: number, y: number): { mapId: MapZoneId; x: number; y: number } {
  if (mapId.startsWith('home_')) return { mapId, x, y };
  const aliases: Partial<Record<MapZoneId, MapZoneId>> = {
    sanctuary: 'camp_plaza', highway: 'town_gas', pond: 'marsh_docks', forest: 'mtn_logging', rift_core: 'marsh_rift',
  };
  const source = aliases[mapId] ?? mapId;
  const location = WORLD_LOCATIONS.find((l) => l.sourceMapId === source);
  return { mapId: 'world', x: clampPosition(x + (location?.x ?? 0)), y: clampPosition(y + (location?.y ?? 0)) };
}
