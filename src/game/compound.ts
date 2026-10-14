import type { BuildingEntity, DecoDef, BuildableType } from '../types/game';

export type WallKind = 'wood_wall' | 'stone_wall' | 'iron_wall';
export type DoorSide = 'N' | 'S' | 'E' | 'W';

export interface CompoundOpts {
  idPrefix: string;
  cx: number; cy: number;
  w: number; h: number; // 院落内径（格数），w>=2 h>=2
  wallType: WallKind;
  wallName: string;
  ownerName: string;
  level?: number;
  wallHp?: number;
  doorSide: DoorSide;
  doorType: 'door' | 'safe_door';
  doorName: string;
  doorExtra?: Partial<BuildingEntity>;
}

const WALL_HP: Record<WallKind, number> = {
  wood_wall: 350,
  stone_wall: 600,
  iron_wall: 850,
};

function wallId(prefix: string, side: string, i: number): string {
  return `${prefix}_${side}_${i}`;
}

/** Duckov 式闭合院：STEP=1 相邻无缝。南北边 facing ew，东西边 facing ns。门替换所在边中点一段。 */
export function buildCompoundWalls(o: CompoundOpts): BuildingEntity[] {
  const level = o.level ?? 1;
  const hp = o.wallHp ?? WALL_HP[o.wallType];
  const out: BuildingEntity[] = [];
  const x0 = o.cx - o.w / 2;
  const x1 = o.cx + o.w / 2;
  const y0 = o.cy - o.h / 2;
  const y1 = o.cy + o.h / 2;
  const midX = o.cx;
  const midY = o.cy;

  const pushWall = (id: string, x: number, y: number, facing: 'ew' | 'ns') => {
    out.push({
      id, type: o.wallType as BuildableType, name: o.wallName,
      x, y, hp, maxHp: hp, level, ownerName: o.ownerName, facing,
    });
  };
  const pushDoor = (x: number, y: number, facing: 'ew' | 'ns') => {
    const base: BuildingEntity = {
      id: `${o.idPrefix}_door`, type: o.doorType as BuildableType, name: o.doorName,
      x, y, hp: o.doorType === 'safe_door' ? 5000 : 650,
      maxHp: o.doorType === 'safe_door' ? 5000 : 650,
      level: o.doorType === 'safe_door' ? 2 : 1,
      isOpen: o.doorType === 'safe_door' ? false : true,
      isLocked: o.doorType === 'safe_door' ? true : false,
      ownerName: o.ownerName, facing,
    };
    out.push({ ...base, ...(o.doorExtra ?? {}) });
  };

  // 北边 y0：x0..x1 STEP=1 facing ew；若门在北则中点换门
  for (let x = x0; x <= x1; x++) {
    if (o.doorSide === 'N' && x === midX) pushDoor(x, y0, 'ew');
    else pushWall(wallId(o.idPrefix, 'n', x), x, y0, 'ew');
  }
  // 南边 y1
  for (let x = x0; x <= x1; x++) {
    if (o.doorSide === 'S' && x === midX) pushDoor(x, y1, 'ew');
    else pushWall(wallId(o.idPrefix, 's', x), x, y1, 'ew');
  }
  // 东西边只做中间段（四角已归南北边，避免重复堆叠）：y0+1..y1-1 facing ns
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    if (o.doorSide === 'W' && y === midY) pushDoor(x0, y, 'ns');
    else pushWall(wallId(o.idPrefix, 'w', y), x0, y, 'ns');
  }
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    if (o.doorSide === 'E' && y === midY) pushDoor(x1, y, 'ns');
    else pushWall(wallId(o.idPrefix, 'e', y), x1, y, 'ns');
  }
  return out;
}

/** 地基必须与院落同心，w+2/h+2。 */
export function compoundFoundation(cx: number, cy: number, w: number, h: number, type: DecoDef['type'] = 'foundation'): DecoDef {
  return { x: cx, y: cy, w: w + 2, h: h + 2, type };
}

/** 封闭校验：按边重建期望点集，缺任一段即 false。只认本 helper 生成的矩形（含 1 扇门）。 */
export function isEnclosed(buildings: BuildingEntity[]): boolean {
  if (buildings.length === 0) return false;
  const pts = new Set(buildings.map((b) => `${b.x},${b.y}`));
  const xs = buildings.map((b) => b.x);
  const ys = buildings.map((b) => b.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  for (let x = x0; x <= x1; x++) {
    if (!pts.has(`${x},${y0}`)) return false;
    if (!pts.has(`${x},${y1}`)) return false;
  }
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    if (!pts.has(`${x0},${y}`)) return false;
    if (!pts.has(`${x1},${y}`)) return false;
  }
  return true;
}

/** 盒子是否在圈内（严格内点，不压墙）。 */
export function boxInside(bx: number, by: number, walls: BuildingEntity[]): boolean {
  const xs = walls.map((b) => b.x);
  const ys = walls.map((b) => b.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return bx > x0 && bx < x1 && by > y0 && by < y1;
}
