import { describe, expect, it } from 'vitest';
import { groupBuildingsIntoHouses, houseCorners, HOUSE_WALL_H, houseWallRuns, houseEntrance } from './house';
import { buildCompoundWalls } from './compound';
import { isPositionBlocked } from './navigation';
import type { BuildingEntity } from '../types/game';
import { drawHouseLayer } from './houseRenderer';

const wall = (id: string, x: number, y: number): BuildingEntity => ({
  id, type: 'iron_wall', name: '墙', x, y, hp: 850, maxHp: 850, level: 1, ownerName: '遗迹', facing: 'ew',
});

function paidRoom(cx = -14, cy = 16): BuildingEntity[] {
  const parts = buildCompoundWalls({ idPrefix: 'test', cx, cy, w: 6, h: 6, wallType: 'wood_wall', wallName: '墙', ownerName: '测试', doorSide: 'S', doorType: 'door', doorName: '自动防卫电控门' });
  for (let y = cy - 2; y <= cy + 2; y++) for (let x = cx - 2; x <= cx + 2; x++) parts.push({ ...wall('', x, y), type: 'wood_floor' });
  return parts.map((b, i) => ({ ...b, id: `build_${cx}_${cy}_${i}`, isOpen: false, ownerId: 'self', mapId: 'home_self' }));
}

describe('paid room recognition and cutaway', () => {
  const rooms = (parts: BuildingEntity[]) => groupBuildingsIntoHouses(parts).filter(g => (g as any).roofFloors);
  it('recognizes the earned25-floor/24-boundary room without adding/removing authority entities', () => {
    const parts = paidRoom(), original = JSON.stringify(parts), groups = groupBuildingsIntoHouses(parts), room = rooms(parts)[0] as any;
    expect(room).toBeDefined(); expect(room.members).toHaveLength(24); expect(room.roofFloors).toHaveLength(25);
    expect(room.door).toBe(parts.find(b => b.type === 'door')); expect(room.cx).toBe(-14); expect(room.cy).toBe(16);
    expect(groups.flatMap(g => g.members).map(b => b.id).sort()).toEqual(parts.filter(b => !b.type.endsWith('_floor')).map(b => b.id).sort());
    expect(JSON.stringify(parts)).toBe(original);
  });
  it.each(['missing-floor', 'missing-wall', 'wrong-facing', 'foreign-owner', 'foreign-map', 'no-door', 'corner-door'] as const)('does not give an incomplete or incompatible shell a roof: %s', fault => {
    let parts = paidRoom(); const north = parts.find(b => b.x === -14 && b.y === 13)!;
    if (fault === 'missing-floor') parts = parts.filter(b => !(b.type === 'wood_floor' && b.x === -14 && b.y === 16));
    if (fault === 'missing-wall') parts = parts.filter(b => b !== north);
    if (fault === 'wrong-facing') north.facing = 'ns';
    if (fault === 'foreign-owner') north.ownerId = 'other';
    if (fault === 'foreign-map') north.mapId = 'home_other';
    if (fault === 'no-door') parts.find(b => b.type === 'door')!.type = 'wood_wall';
    if (fault === 'corner-door') { parts.find(b => b.type === 'door')!.type = 'wood_wall'; parts.find(b => b.x === -17 && b.y === 19)!.type = 'door'; }
    expect(rooms(parts)).toHaveLength(0);
  });
  it('accepts floors under walls and keeps two rooms sharing a wall separate', () => {
    const a = paidRoom(0, 0), b = paidRoom(6, 0).filter(b => !(b.x === 3 && b.type !== 'wood_floor'));
    for (const part of a.filter(b => !b.type.endsWith('_floor'))) a.push({ ...part, id: part.id + '_floor', type: 'wood_floor' });
    const recognized = rooms([...a, ...b]) as any[];
    expect(recognized).toHaveLength(2); expect(recognized.map(r => r.cx).sort()).toEqual([0, 6]);
    expect(recognized.every(r => r.roofFloors.length === 25)).toBe(true);
  });
  it.each(['wood_wall', 'door'] as const)('uses a paid replacement %s instead of its retained destroyed original', type => {
    const parts = paidRoom(), old = parts.find(b => b.type === type)!; old.hp = 0;
    const replacement = { ...old, id: old.id + '_rebuilt', hp: old.maxHp };
    parts.push(replacement); const room = rooms(parts)[0];
    expect(room).toBeDefined(); expect(room.members).toContain(replacement); expect(room.members).not.toContain(old);
    expect(room.members).toHaveLength(24);
  });
  it('shows a real roof outside, hides it inside, keeps it for an open door and removes it for destroyed structure', () => {
    const parts = paidRoom(), room = rooms(parts)[0] as any; expect(room).toBeDefined();
    const fills: { color: string; alpha: number }[] = [], labels: string[] = [];
    const ctx: any = { globalAlpha: 1, fillStyle: '', fill: () => fills.push({ color: ctx.fillStyle, alpha: ctx.globalAlpha }), fillText: (text: string) => labels.push(text) };
    const context = new Proxy(ctx, { get: (target, key) => key in target ? target[key] : () => {} });
    const project = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
    const draw = (player: { x: number; y: number }) => { fills.length = labels.length = 0; drawHouseLayer(context, room.members, room.door, player, project, 'front', room.roofFloors); return fills.some(f => ['#a0745c', '#809184', '#909077'].includes(f.color)); };
    expect(draw({ x: -14, y: 22 })).toBe(true); expect(labels).toContain('营地房屋'); expect(labels).toContain('入口 · E 开门');
    expect(draw({ x: -14, y: 17 })).toBe(false); expect(fills.some(f => f.alpha === .18)).toBe(true);
    room.door.isOpen = true; expect(draw({ x: -14, y: 22 })).toBe(true); expect(labels).toContain('入口 · 可通行');
    for (const part of [room.members.find((b: BuildingEntity) => b.type === 'wood_wall'), room.door, room.roofFloors[0]]) {
      const hp = part.hp; part.hp = 0; expect(draw({ x: -14, y: 22 })).toBe(false); part.hp = hp;
    }
    const secondDoor = room.members.find((b: BuildingEntity) => b.x === -11 && b.y === 16)!;
    secondDoor.type = 'door'; secondDoor.isOpen = false;
    room.door.isOpen = false; draw({ x: -14, y: 22 });
    expect(fills.filter(f => f.color === '#536566')).toHaveLength(2);
  });
});

describe('complete house geometry', () => {
  const room = () => buildCompoundWalls({ idPrefix: 'room', cx: 0, cy: 0, w: 8, h: 6, wallType: 'wood_wall', wallName: '墙', ownerName: '遗迹', doorSide: 'S', doorType: 'door', doorName: '入口', doorExtra: { doorWidth: 3 } }).filter(b => !(b.type.endsWith('_wall') && b.y === 3 && Math.abs(b.x) < 2));
  it('retains all four sides and leaves the actual three-tile door opening clear', () => {
    const buildings = room();
    const runs = houseWallRuns(buildings);
    expect(new Set(runs.map(r => r.side))).toEqual(new Set(['N', 'S', 'E', 'W']));
    const south = runs.filter(r => r.side === 'S');
    expect(south).toHaveLength(2);
    expect(south.every(r => r.end.x <= -1.5 || r.start.x >= 1.5)).toBe(true);
    const door = buildings.find(b => b.type === 'door')!;
    expect(houseEntrance(buildings, door)).toMatchObject({ side: 'S', start: { x: -1.5, y: 3 }, end: { x: 1.5, y: 3 } });
    expect(isPositionBlocked(1.1, 3, [{ ...door, isOpen: false }])).toBe(true);
    expect(isPositionBlocked(1.1, 3, [{ ...door, isOpen: true }])).toBe(false);
  });
  it('does not paint a solid wall over a destroyed section', () => {
    const buildings = room();
    buildings.find(b => b.y === -3 && b.x === 0)!.hp = 0;
    expect(houseWallRuns(buildings).filter(r => r.side === 'N').every(r => r.end.x <= -0.5 || r.start.x >= 0.5)).toBe(true);
  });
  it('retains the existing public roof, doorway caption and inside cutaway', () => {
    const members = room().map(b => ({ ...b, id: 'world:0:0:poi:' + b.id })), door = members.find(b => b.type === 'door')!;
    door.name = '林边民居入口'; door.isOpen = false;
    const colors: string[] = [], labels: string[] = [], target: any = { fillStyle: '', globalAlpha: 1, fill: () => colors.push(target.fillStyle), fillText: (label: string) => labels.push(label) };
    const ctx = new Proxy(target, { get: (object, key) => key in object ? object[key] : () => {} });
    const draw = (y: number) => { colors.length = labels.length = 0; drawHouseLayer(ctx, members, door, { x: 0, y }, (x, y) => ({ x, y }), 'front'); return colors.some(c => ['#a0745c', '#809184', '#909077'].includes(c)); };
    expect(draw(6)).toBe(true); expect(labels).toContain('林边民居'); expect(labels).toContain('入口 · E 开门');
    expect(draw(0)).toBe(false); expect(labels).not.toContain('营地房屋');
  });
});

describe('groupBuildingsIntoHouses', () => {
  it('groups a landmark across world chunks and keeps placed walls individually accurate', () => {
    const groups = groupBuildingsIntoHouses([
      wall('world:7:-1:b:town_gas:gas_office_n_-8', 232, -2),
      wall('world:7:0:b:town_gas:gas_office_s_-8', 232, 2),
      wall('build_one', 0, 0), wall('build_two', 20, 20),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups.find(g => g.members.length === 2)?.members.map(b => b.y)).toEqual([-2, 2]);
  });
  it('groups procedural point of interest sides into one actual building', () => {
    const groups = groupBuildingsIntoHouses([
      wall('world:-3:6:poi:n_-5', -85, 204),
      wall('world:-3:6:poi:s_5', -75, 212),
      { ...wall('world:-3:6:poi:door', -80, 212), type: 'door' as const },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].door).not.toBeNull();
  });
  it('same prefix walls form one house, others stay single', () => {
    const bs = [wall('gas_office_n_-8', -8, -14), wall('gas_office_s_-8', -8, -12), wall('ru_cw_1', 6, 8)];
    const groups = groupBuildingsIntoHouses(bs);
    expect(groups).toHaveLength(2);
    expect(groups[0].members).toHaveLength(2);
    expect(groups[1].members).toHaveLength(1);
  });
  it('door id with same prefix joins its house', () => {
    const door: BuildingEntity = { id: 'gas_office_door', type: 'door', name: '门', x: -6, y: -12, hp: 650, maxHp: 650, level: 1, ownerName: '遗迹', facing: 'ew', isOpen: true, isLocked: false };
    const groups = groupBuildingsIntoHouses([wall('gas_office_n_-8', -8, -14), door]);
    expect(groups).toHaveLength(1);
    expect(groups[0].door?.id).toBe('gas_office_door');
  });
});

describe('houseCorners', () => {
  it('4x2 yard yields integer bounds and wall height constant', () => {
    const bs = [wall('a_n_0', -8, -14), wall('a_n_1', -7, -14), wall('a_s_0', -8, -12), wall('a_s_1', -7, -12)];
    const c = houseCorners(bs);
    expect(c).toEqual({ x0: -8, x1: -7, y0: -14, y1: -12 });
    expect(HOUSE_WALL_H).toBe(44);
  });
});

describe('house label rule', () => {
  it('scattered walls stay separate houses', () => {
    const bs = [
      { id: 'ru_cw_1', type: 'stone_wall', name: '断墙', x: -15, y: -15, hp: 250, maxHp: 600, level: 1, ownerName: '遗迹' },
      { id: 'rift_cover_n1', type: 'iron_wall', name: '残墙', x: 5, y: 5, hp: 300, maxHp: 850, level: 1, ownerName: '先锋' },
    ];
    expect(groupBuildingsIntoHouses(bs as any)).toHaveLength(2);
  });
});
