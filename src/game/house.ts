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

/** 同前缀墙+门并为一组；storage_box/turret 等不参组，原样单成员返回 */
export function groupBuildingsIntoHouses(buildings: BuildingEntity[]): HouseGroup[] {
  const wallGroups = new Map<string, BuildingEntity[]>();
  const singles: BuildingEntity[] = [];
  for (const b of buildings) {
    if (!isHousePart(b)) {
      singles.push(b);
      continue;
    }
    const key = prefixOf(b.id);
    const arr = wallGroups.get(key);
    if (arr) arr.push(b);
    else wallGroups.set(key, [b]);
  }
  const out: HouseGroup[] = [];
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
