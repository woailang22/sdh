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
