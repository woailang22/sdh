import { describe, expect, it } from 'vitest';
import { groupBuildingsIntoHouses, houseCorners, HOUSE_WALL_H, houseWallRuns, houseEntrance } from './house';
import { buildCompoundWalls } from './compound';
import { isPositionBlocked } from './navigation';
import type { BuildingEntity } from '../types/game';

const wall = (id: string, x: number, y: number): BuildingEntity => ({
  id, type: 'iron_wall', name: '墙', x, y, hp: 850, maxHp: 850, level: 1, ownerName: '遗迹', facing: 'ew',
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
