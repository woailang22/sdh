export const ROADSIDE_USES = {
  farm: { template: 0, supplies: '口粮 · 饮水 · 种子', color: '#c5ac72' },
  workshop: { template: 2, supplies: '废铁 · 零件', color: '#b77b52' },
  clinic: { template: 1, supplies: '绷带 · 解毒剂', color: '#7ca98a' },
  warehouse: { template: 3, supplies: '废铁 · 燃油 · 电池', color: '#6d8a91' },
} as const;

export interface RoadsideStop {
  id: string; name: string; x: number; y: number; kind: keyof typeof ROADSIDE_USES; description: string;
}

/** Existing rooms and container IDs: this route does not add buildings or loot nodes. */
export const WORLD_ROADSIDE_STOPS: RoadsideStop[] = [
  { id: 'world:-1:3:poi', name: '麦穗农舍', x: -16, y: 112, kind: 'farm', description: '南下前的口粮补给。厨房物资柜有饮水与土豆种子，可带回营地种植。' },
  { id: 'world:0:6:poi', name: '渡口维修工棚', x: 24, y: 216, kind: 'workshop', description: '渡口北侧的旧维修间。搜取废铁与零件，供营地设施制造和修复使用。' },
  { id: 'world:-1:10:poi', name: '芦湾诊所', x: -24, y: 344, kind: 'clinic', description: '离开渡口后可绕进废弃诊所搜药，补充绷带与解毒剂，再向泥沼深入。' },
  { id: 'world:0:14:poi', name: '泥岸补给仓库', x: 24, y: 472, kind: 'warehouse', description: '深入湿地的物资中转点。废铁、燃油和电池用于营地加工与建设。' },
  { id: 'world:0:18:poi', name: '裂隙前哨诊所', x: 16, y: 592, kind: 'clinic', description: '裂隙外围的最后一处沿路药柜。先整理医疗物资，再决定深入红区或带物资返回。' },
];

interface SupplyRouteStop {
  id: string; name: string; x: number; y: number; description: string; supplies: string; color: string;
  labelOffset?: { x: number; y: number };
}
interface SupplyRoute {
  id: string; name: string; view: { x: number; y: number; size: number }; axis: 'x' | 'y'; stops: SupplyRouteStop[];
}

/** Map intelligence only. Targets refer to existing nodes and do not change world generation. */
export const WORLD_SUPPLY_ROUTES: SupplyRoute[] = [
  {
    id: 'south', name: '南下补给线', view: { x: -320, y: 48, size: 640 }, axis: 'y',
    stops: WORLD_ROADSIDE_STOPS.map(point => ({ ...point, ...ROADSIDE_USES[point.kind] })),
  },
  {
    id: 'west', name: '西行材料线', view: { x: -320, y: -160, size: 384 }, axis: 'x',
    stops: [
      { id: 'world:-5:-2:poi:supplies', name: '近郊维修工棚', x: -138, y: -42, supplies: '废铁 · 零件', color: '#b77b52', description: '西行首批零件来源。由南侧宽门进入，搜取物资柜，供工作台与仓库建设使用。' },
      { id: 'world:-6:0:poi:supplies', name: '林缘维修工棚', x: -186, y: 22, supplies: '废铁 · 零件', color: '#b77b52', description: '南侧入口通往物资柜。上一处被搜空时可继续西行，找到材料后也可直接回营，不必深入伐木场。' },
      { id: 'world:-8:-1:i:mtn_logging:log_truck', name: '侧翻运材卡车', x: -240, y: -16, supplies: '废铁 · 原木 · 零件', color: '#c5ac72', description: '伐木场北侧的运材车，废铁较多。附近有怪物，先观察再搜刮；携带食物，预留回营路线。' },
      { id: 'world:-8:0:i:mtn_logging:log_toolshed', name: '伐木工具棚', x: -254, y: 4, supplies: '零件 · 废铁 · 铜矿 · 握把', color: '#7ca98a', description: '林场西侧工具棚有机械材料、铜矿和握把。与运材车不同用途；注意林场怪物，材料够用即可撤离。' },
    ],
  },
  {
    id: 'north', name: '北上采矿线', view: { x: -256, y: -416, size: 448 }, axis: 'y',
    stops: [
      { id: 'world:-1:-6:poi:supplies', name: '北路补给农舍', x: -18, y: -178, supplies: '食物 · 饮水 · 种子', color: '#c5ac72', labelOffset: { x: 26, y: 10 }, description: '由农舍南侧入口进入，物资柜可搜食物、饮水和种子。北上前先准备往返补给，已被搜取的物资不会因离开地图而补满。' },
      { id: 'world:-4:-9:node:6', name: '矿场南缘铜矿', x: -124, y: -265, supplies: '铜矿 · 石料', color: '#c68b5c', description: '北岭矿场外围的铜矿露头，需装备镐。每 3 份铜矿和 2 原木可在营地熔炉炼成 1 铜锭，用于研究后的高级制造。' },
      { id: 'world:-3:-9:node:6', name: '东侧铜矿露头', x: -89, y: -265, supplies: '铜矿 · 石料', color: '#c68b5c', labelOffset: { x: 26, y: 10 }, description: '沿矿场南缘向东补充铜矿。矿点耗尽后需要等待恢复，带足食物，保留回营冶炼的木材。' },
      { id: 'world:-3:-9:node:4', name: '坡脚铜矿露头', x: -79, y: -275, supplies: '铜矿 · 石料', color: '#c68b5c', labelOffset: { x: 26, y: -28 }, description: '第三处外围矿点，可继续补齐铜矿，不必为采矿深入值班室。铜锭需回营地熔炉加工。' },
      { id: 'world:-4:-11:i:mtn_quarry:q_dozer', name: '采石推土机残骸', x: -120, y: -346, supplies: '废铁 · 零件', color: '#b77b52', description: '矿场机械残骸提供废铁和零件，附近有怪物，先观察再搜刮。零件不足可先走西行材料线；带材料回营再制造。' },
      { id: 'world:-5:-11:i:mtn_quarry:q_powder', name: '采石场炸药库', x: -140, y: -344, supplies: 'C4 · 弹药', color: '#c58a77', labelOffset: { x: -26, y: 60 }, description: '搜刮矿场现有炸药与弹药，注意附近怪物。攻营破拆会消耗携带的真实炸药，破门本身不产生战利品；先带足食物并规划撤离路线，留意营地自动防御。' },
    ],
  },
];
