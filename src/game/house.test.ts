import { describe, expect, it } from 'vitest';
import { groupBuildingsIntoHouses, houseCorners, HOUSE_WALL_H } from './house';
import type { BuildingEntity } from '../types/game';

const wall = (id: string, x: number, y: number): BuildingEntity => ({
  id, type: 'iron_wall', name: '墙', x, y, hp: 850, maxHp: 850, level: 1, ownerName: '遗迹', facing: 'ew',
});

describe('groupBuildingsIntoHouses', () => {
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
