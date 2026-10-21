import type { BuildableType } from '../types/game';

// Initial playtest costs; shared by the server and the construction palette.
export const BUILD_RECIPES: Partial<Record<BuildableType, { wood?: number; stone?: number; scrap?: number; parts?: number; hp: number; name: string }>> = {
  wood_floor: { wood: 4, hp: 300, name: '原木板材地板' }, stone_floor: { stone: 6, hp: 550, name: '石质防爆地砖' }, iron_floor: { scrap: 6, hp: 800, name: '铁制网纹格栅' },
  wood_wall: { wood: 6, hp: 350, name: '加固原木围墙' }, stone_wall: { stone: 8, hp: 600, name: '厚重条石防护墙' }, iron_wall: { scrap: 6, hp: 850, name: '战术重合金铁墙' },
  glass_wall: { scrap: 5, parts: 1, hp: 400, name: '钢化玻璃观察墙' }, door: { wood: 4, scrap: 4, parts: 1, hp: 650, name: '自动防卫电控门' },
  safe_door: { stone: 10, scrap: 20, parts: 4, hp: 5000, name: '高耐久重装防爆安全门' }, storage_box: { wood: 8, scrap: 2, hp: 400, name: '战术领地储物箱' },
  workbench: { wood: 10, stone: 5, scrap: 4, parts: 1, hp: 500, name: '机械工程工作台' }, turret: { scrap: 15, parts: 2, hp: 750, name: '自律防御塔' },
  spikes: { wood: 6, scrap: 2, hp: 300, name: '拒马铁刺陷阱' }, electric_core: { scrap: 12, parts: 2, hp: 600, name: '电磁防卫核心' }, flame_core: { scrap: 12, parts: 2, hp: 600, name: '聚能烈焰燃芯' },
  // Initial playtest costs: basic survival is cheaper than industrial processing and research.
  campfire: { wood: 8, stone: 6, hp: 300, name: '营地篝火' }, bed: { wood: 12, scrap: 4, hp: 300, name: '简易营地床' },
  farm_plot: { wood: 8, stone: 4, hp: 250, name: '营地种植田' }, furnace: { stone: 20, scrap: 10, parts: 1, hp: 600, name: '矿物熔炉' },
  research_table: { wood: 12, scrap: 20, parts: 3, hp: 500, name: '蓝图研究台' },
};
