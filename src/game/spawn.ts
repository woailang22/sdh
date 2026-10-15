import type { MapZoneId } from '../types/game';

export interface SpawnPoint { x: number; y: number; mapId: MapZoneId; label: string; }
export interface BasePlot { x: number; y: number; mapId: MapZoneId; label: string; w: number; h: number; }

/** 出生全在中立营地广场，但8点位分散站，不再叠罗汉 */
export const SPAWN_POINTS: SpawnPoint[] = [
  { x: -6, y: -6, mapId: 'camp_plaza', label: '西门集结点' },
  { x: 6, y: -6, mapId: 'camp_plaza', label: '东门集结点' },
  { x: -6, y: 6, mapId: 'camp_plaza', label: '西南集结点' },
  { x: 6, y: 6, mapId: 'camp_plaza', label: '东南集结点' },
  { x: 0, y: -9, mapId: 'camp_plaza', label: '北门集结点' },
  { x: 0, y: 9, mapId: 'camp_plaza', label: '南门集结点' },
  { x: -9, y: 0, mapId: 'camp_plaza', label: '西墙集结点' },
  { x: 9, y: 0, mapId: 'camp_plaza', label: '东墙集结点' },
];

/** 野外可圈地8块：4地域各2块，同图内间距≥8格，互不踩院 */
export const BASE_PLOTS: BasePlot[] = [
  { x: -18, y: 14, mapId: 'town_street', label: '商业街西废墟地块', w: 4, h: 2 },
  { x: 18, y: -14, mapId: 'town_gas', label: '加油站北荒地块', w: 4, h: 2 },
  { x: -20, y: 16, mapId: 'mtn_logging', label: '伐木场南坡地块', w: 4, h: 2 },
  { x: 20, y: -16, mapId: 'mtn_quarry', label: '采石场东台地块', w: 4, h: 2 },
  { x: -20, y: -16, mapId: 'marsh_docks', label: '渔港西滩涂地块', w: 4, h: 2 },
  { x: 20, y: 16, mapId: 'marsh_bog', label: '沼泽东高脚地块', w: 4, h: 2 },
  { x: -22, y: 18, mapId: 'town_ruins', label: '居民区西北角地块', w: 4, h: 2 },
  { x: 22, y: 18, mapId: 'mtn_deep', label: '深林南空地块', w: 4, h: 2 },
];

export function spawnForIndex(i: number): SpawnPoint {
  return SPAWN_POINTS[((i % SPAWN_POINTS.length) + SPAWN_POINTS.length) % SPAWN_POINTS.length];
}

export function basePlotForIndex(i: number): BasePlot {
  return BASE_PLOTS[((i % BASE_PLOTS.length) + BASE_PLOTS.length) % BASE_PLOTS.length];
}
