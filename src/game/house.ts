import type { BuildingEntity } from '../types/game';

/** 整屋墙高（px），所有房子统一，门窗按此比例开洞 */
export const HOUSE_WALL_H = 44;
/** 屋顶尖顶峰高（px），平顶为 0 */
export const HOUSE_PEAK_H = 26;

export interface HouseGroup {
  key: string;
  members: BuildingEntity[];
  door: BuildingEntity | null;
  cx: number;
  cy: number;
  /** Actual paid interior floor references; derived appearance, never a saved asset. */
  roofFloors?: BuildingEntity[];
}

function prefixOf(id: string): string {
  if (/^(build_|b_)/.test(id)) return id;
  const procedural = /^(world:-?\d+:-?\d+:poi):/.exec(id);
  if (procedural) return procedural[1];
  id = id.replace(/^world:-?\d+:-?\d+:b:/, 'world:');
  // gas_office_n_-8 → gas_office；gas_office_door → gas_office；ru_cw_1 → ru_cw
  if (id.endsWith('_door')) return id.slice(0, -5);
  const parts = id.split('_');
  if (parts.length <= 2) return parts[0];
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (/^-?\d+$/.test(last) && (prev === 'n' || prev === 's' || prev === 'e' || prev === 'w')) {
    return parts.slice(0, -2).join('_');
  }
  return parts.slice(0, -1).join('_');
}

function isHousePart(b: BuildingEntity): boolean {
  return b.type === 'iron_wall' || b.type === 'stone_wall' || b.type === 'wood_wall' || b.type === 'glass_wall' || b.type === 'door' || b.type === 'safe_door';
}

function placedRooms(buildings: BuildingEntity[]): HouseGroup[] {
  const sites = new Map<string, { floors: Map<string, BuildingEntity>; structure: Map<string, BuildingEntity[]> }>();
  const cell = (x: number, y: number) => `${x},${y}`;
  for (const b of buildings) {
    if (!/^(build_|b_)/.test(b.id) || !b.ownerId || !b.mapId || !Number.isInteger(b.x) || !Number.isInteger(b.y)) continue;
    if (!isHousePart(b) && !b.type.endsWith('_floor')) continue;
    const key = `${b.mapId}\0${b.ownerId}`;
    let site = sites.get(key);
    if (!site) { site = { floors: new Map(), structure: new Map() }; sites.set(key, site); }
    const position = cell(b.x, b.y);
    if (b.type.endsWith('_floor')) {
      const old = site.floors.get(position);
      if (!old || old.hp <= 0 || b.hp > 0) site.floors.set(position, b);
    }
    else site.structure.set(position, [...(site.structure.get(position) ?? []), b]);
  }
  const result: HouseGroup[] = [];
  for (const { floors, structure } of sites.values()) {
    const visited = new Set<string>();
    for (const [seed, floor] of floors) {
      if (visited.has(seed) || structure.has(seed)) continue;
      const component = [floor]; visited.add(seed);
      let minX = floor.x, maxX = floor.x, minY = floor.y, maxY = floor.y;
      for (let index = 0; index < component.length; index++) {
        const b = component[index];
        minX = Math.min(minX, b.x); maxX = Math.max(maxX, b.x); minY = Math.min(minY, b.y); maxY = Math.max(maxY, b.y);
        for (const [x, y] of [[b.x - 1, b.y], [b.x + 1, b.y], [b.x, b.y - 1], [b.x, b.y + 1]]) {
          const key = cell(x, y), next = floors.get(key);
          if (next && !visited.has(key) && !structure.has(key)) { visited.add(key); component.push(next); }
        }
      }
      if ((maxX - minX + 1) * (maxY - minY + 1) !== component.length) continue;
      const x0 = minX - 1, x1 = maxX + 1, y0 = minY - 1, y1 = maxY + 1;
      const members: BuildingEntity[] = []; let door: BuildingEntity | null = null, complete = true;
      const take = (x: number, y: number, facing: 'ew' | 'ns', corner = false) => {
        const matches = structure.get(cell(x, y));
        const live = matches?.filter(b => b.hp > 0);
        if (!matches?.length || (live?.length ?? 0) > 1) { complete = false; return; }
        const b = live?.[0] ?? matches[0], isDoor = b.type === 'door' || b.type === 'safe_door';
        if ((!corner && (b.facing ?? 'ew') !== facing) || (isDoor && (corner || (b.doorWidth ?? 1) !== 1))) { complete = false; return; }
        if (isDoor) door ??= b;
        members.push(b);
      };
      for (let x = x0; x <= x1; x++) { take(x, y0, 'ew', x === x0 || x === x1); take(x, y1, 'ew', x === x0 || x === x1); }
      for (let y = minY; y <= maxY; y++) { take(x0, y, 'ns'); take(x1, y, 'ns'); }
      if (complete && door) result.push({ key: `room:${floor.id}`, members, door, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, roofFloors: component });
    }
  }
  return result;
}

/** Recognize paid floor rooms, then retain legacy prefix groups and separate furniture. */
export function groupBuildingsIntoHouses(buildings: BuildingEntity[]): HouseGroup[] {
  const rooms = placedRooms(buildings);
  const roomIds = new Set(rooms.flatMap(room => room.members.map(b => b.id)));
  const wallGroups = new Map<string, BuildingEntity[]>();
  const singles: BuildingEntity[] = [];
  for (const b of buildings) {
    if (b.type.endsWith('_floor') || roomIds.has(b.id)) continue;
    if (!isHousePart(b)) {
      singles.push(b);
      continue;
    }
    const key = prefixOf(b.id);
    const arr = wallGroups.get(key);
    if (arr) arr.push(b);
    else wallGroups.set(key, [b]);
  }
  const out: HouseGroup[] = [...rooms];
  for (const [key, members] of wallGroups) {
    const door = members.find((m) => m.type === 'door' || m.type === 'safe_door') ?? null;
    const xs = members.map((m) => m.x);
    const ys = members.map((m) => m.y);
    out.push({ key, members, door, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 });
  }
  for (const s of singles) {
    out.push({ key: s.id, members: [s], door: null, cx: s.x, cy: s.y });
  }
  return out;
}

/** 院落四角边界（整数格），drawHouse 的唯一输入 */
export function houseCorners(members: BuildingEntity[]): { x0: number; x1: number; y0: number; y1: number } {
  const xs = members.map((m) => m.x);
  const ys = members.map((m) => m.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

export function houseRoofVisible(members: BuildingEntity[], player: { x: number; y: number }, roofFloors?: BuildingEntity[]) {
  const { x0, x1, y0, y1 } = houseCorners(members);
  const inside = player.x > x0 - 0.8 && player.x < x1 + 0.8 && player.y > y0 - 0.8 && player.y < y1 + 0.8;
  return !inside && members.every(b => roofFloors ? b.hp > 0 : !b.type.endsWith('_wall') || b.hp > 0) && (roofFloors?.every(b => b.hp > 0) ?? true);
}

export interface HouseWallRun {
  side: 'N' | 'S' | 'E' | 'W';
  start: { x: number; y: number };
  end: { x: number; y: number };
}

/** Merge only surviving wall cells. Doors and breached wall cells stay holes. */
export function houseWallRuns(members: BuildingEntity[]): HouseWallRun[] {
  const { x0, x1, y0, y1 } = houseCorners(members);
  const result: HouseWallRun[] = [];
  for (const side of ['N', 'W', 'S', 'E'] as const) {
    const horizontal = side === 'N' || side === 'S';
    const fixed = side === 'N' ? y0 : side === 'S' ? y1 : side === 'W' ? x0 : x1;
    const min = horizontal ? x0 : y0, max = horizontal ? x1 : y1;
    const intervals = members.filter(b => b.type.endsWith('_wall') && b.hp > 0 && Math.abs((horizontal ? b.y : b.x) - fixed) < 0.01)
      .map(b => ({ a: Math.max(min, (horizontal ? b.x : b.y) - 0.5), z: Math.min(max, (horizontal ? b.x : b.y) + 0.5) })).sort((a, b) => a.a - b.a);
    const merged: { a: number; z: number }[] = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval.a <= last.z + 0.01) last.z = Math.max(last.z, interval.z);
      else merged.push({ ...interval });
    }
    result.push(...merged.filter(r => r.z > r.a).map(r => ({ side, start: horizontal ? { x: r.a, y: fixed } : { x: fixed, y: r.a }, end: horizontal ? { x: r.z, y: fixed } : { x: fixed, y: r.z } })));
  }
  return result;
}

export function houseEntrance(members: BuildingEntity[], door: BuildingEntity): HouseWallRun {
  const { x0, x1, y0, y1 } = houseCorners(members);
  const side = door.y === y1 ? 'S' : door.y === y0 ? 'N' : door.x === x0 ? 'W' : 'E';
  const half = Math.max(0.5, Math.min(2, (door.doorWidth ?? 1) / 2));
  return side === 'N' || side === 'S'
    ? { side, start: { x: Math.max(x0, door.x - half), y: door.y }, end: { x: Math.min(x1, door.x + half), y: door.y } }
    : { side, start: { x: door.x, y: Math.max(y0, door.y - half) }, end: { x: door.x, y: Math.min(y1, door.y + half) } };
}
