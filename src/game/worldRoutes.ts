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
}
interface SupplyRoute {
  id: string; name: string; view: { x: number; y: number; size: number }; axis: 'x' | 'y'; stops: SupplyRouteStop[];
}

/** Map intelligence only. Western targets refer to existing containers and do not change world generation. */
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
];
