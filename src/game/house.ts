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
