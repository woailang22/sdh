import { describe, expect, it } from 'vitest';
import { buildCompoundWalls, compoundFoundation, isEnclosed, boxInside } from './compound';

describe('compound walls', () => {
  it('5x4 iron yard is enclosed with door on south', () => {
    const walls = buildCompoundWalls({
      idPrefix: 't_yard',
      cx: 0, cy: 0, w: 4, h: 3,
      wallType: 'iron_wall', wallName: '测试铁墙', ownerName: '测试',
      doorSide: 'S', doorType: 'door', doorName: '测试门',
    });
    // 北边 w+1=5 段，南边 w 段墙+1 扇门，东西边各 h-1=2 段（四角归南北边）
    // 总数 = 5 + (4+1) + 2 + 2 = 14
    expect(walls).toHaveLength(14);
    expect(isEnclosed(walls)).toBe(true);
  });
  it('old STEP=2 layout is detected as gapped', () => {
    // 复刻旧加油站 bug：-8 与 -4 夹 -6 门，漏 -7/-5
    const walls = buildCompoundWalls({
      idPrefix: 'old_gas',
      cx: 0, cy: 0, w: 4, h: 2,
      wallType: 'iron_wall', wallName: '旧墙', ownerName: '旧',
      doorSide: 'S', doorType: 'door', doorName: '旧门',
    });
    const gapped = walls.filter((b) => b.type !== 'door');
    // 手动抽掉两段模拟 STEP=2 漏缝
    const broken = gapped.filter((_, i) => i % 2 === 0).concat(walls.filter((b) => b.type === 'door'));
    expect(isEnclosed(broken)).toBe(false);
  });
  it('box inside vs outside', () => {
    const walls = buildCompoundWalls({
      idPrefix: 't_box', cx: 10, cy: 10, w: 4, h: 3,
      wallType: 'stone_wall', wallName: '石墙', ownerName: '测试',
      doorSide: 'S', doorType: 'door', doorName: '门',
    });
    expect(boxInside(10, 10, walls)).toBe(true);
    expect(boxInside(10, 30, walls)).toBe(false);
  });
  it('foundation is centered and padded by 2', () => {
    const f = compoundFoundation(6, 6, 4, 3, 'foundation');
    expect(f).toEqual({ x: 6, y: 6, w: 6, h: 5, type: 'foundation' });
  });
});
