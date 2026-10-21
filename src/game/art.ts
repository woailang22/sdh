/**
 * 美术资源统一入口：public/art/ 图集的静态帧表 + 映射 helpers。
 *
 * 说明：不从 public/ import JSON（Vite 不打包 public 下文件，且 tsconfig 无
 * resolveJsonModule），帧 rect 由 atlas.json 实测抄录；运行时图片走
 * /art/<file> 直接引用（Vite 自动 serve public/）。
 */

export const ART_BASE = '/art';

export interface FrameRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArtFrame {
  file: string;
  frame: string;
}

/** 静态帧表：key 为文件名，value 为 frame id -> rect（源自 public/art/atlas.json）。 */
const FRAMES: Record<string, Record<string, FrameRect>> = {
  'world-environment-v1.png': {
    'understory': { x: 0, y: 0, width: 512, height: 512 },
    'outcrop': { x: 512, y: 0, width: 512, height: 512 },
    'reeds': { x: 1024, y: 0, width: 512, height: 512 },
    'tank': { x: 0, y: 512, width: 512, height: 512 },
    'rubble': { x: 512, y: 512, width: 512, height: 512 },
    'fence': { x: 1024, y: 512, width: 512, height: 512 },
  },
  'char-survivor.png': {
    'southeast': { x: 0, y: 0, width: 562, height: 724 },
    'southwest': { x: 562, y: 0, width: 524, height: 724 },
    'northwest': { x: 1086, y: 0, width: 531, height: 724 },
    'northeast': { x: 1617, y: 0, width: 555, height: 724 },
  },
  'monster-pack.png': {
    'small-fast': { x: 0, y: 0, width: 527, height: 778 },
    'medium-armored': { x: 527, y: 0, width: 681, height: 778 },
    'huge-boss': { x: 1208, y: 0, width: 813, height: 778 },
  },
  'building-walls.png': {
    'wood-wall': { x: 0, y: 0, width: 404, height: 450 },
    'stone-wall': { x: 404, y: 0, width: 440, height: 450 },
    'alloy-wall': { x: 844, y: 0, width: 410, height: 450 },
    'wood-floor': { x: 0, y: 450, width: 419, height: 302 },
    'stone-floor': { x: 419, y: 450, width: 412, height: 302 },
    'metal-grid-floor': { x: 831, y: 450, width: 423, height: 302 },
    'wood-door': { x: 0, y: 752, width: 417, height: 502 },
    'armored-door': { x: 417, y: 752, width: 412, height: 502 },
    'bunker-door': { x: 829, y: 752, width: 425, height: 502 },
  },
  'building-facility.png': {
    'watch-turret': { x: 0, y: 0, width: 441, height: 724 },
    'workbench': { x: 441, y: 0, width: 510, height: 724 },
    'storage-crate': { x: 951, y: 0, width: 398, height: 724 },
    'campfire': { x: 1349, y: 0, width: 424, height: 724 },
    'crystal-anchor': { x: 1773, y: 0, width: 399, height: 724 },
  },
  'nature-trees.png': {
    'pine': { x: 0, y: 0, width: 505, height: 724 },
    'oak': { x: 505, y: 0, width: 661, height: 724 },
    'boulder': { x: 1166, y: 0, width: 497, height: 724 },
    'dry-grass': { x: 1663, y: 0, width: 509, height: 724 },
  },
  'prop-wreck.png': {
    'wrecked-sedan': { x: 0, y: 0, width: 579, height: 724 },
    'concrete-ruin': { x: 579, y: 0, width: 428, height: 724 },
    'ammo-crate': { x: 1007, y: 0, width: 401, height: 724 },
    'medical-cabinet': { x: 1408, y: 0, width: 343, height: 724 },
    'wooden-box': { x: 1751, y: 0, width: 421, height: 724 },
  },
  'icon-weapons.png': {
    'assault-rifle': { x: 0, y: 0, width: 438, height: 724 },
    'submachine-gun': { x: 438, y: 0, width: 432, height: 724 },
    'shotgun': { x: 870, y: 0, width: 432, height: 724 },
    'sniper-rifle': { x: 1302, y: 0, width: 431, height: 724 },
    'pistol': { x: 1733, y: 0, width: 439, height: 724 },
  },
  'icon-gear.png': {
    'helmet': { x: 0, y: 0, width: 437, height: 724 },
    'plate-vest': { x: 437, y: 0, width: 433, height: 724 },
    'backpack': { x: 870, y: 0, width: 432, height: 724 },
    'pickaxe': { x: 1302, y: 0, width: 434, height: 724 },
    'axe': { x: 1736, y: 0, width: 436, height: 724 },
  },
  'icon-throwable.png': {
    'explosive-block': { x: 0, y: 0, width: 446, height: 724 },
    'molotov': { x: 446, y: 0, width: 427, height: 724 },
    'smoke-can': { x: 873, y: 0, width: 427, height: 724 },
    'flash-grenade': { x: 1300, y: 0, width: 428, height: 724 },
    'frag-grenade': { x: 1728, y: 0, width: 444, height: 724 },
  },
  'icon-medical-food.png': {
    'bandage': { x: 0, y: 0, width: 364, height: 724 },
    'medkit': { x: 364, y: 0, width: 361, height: 724 },
    'pills': { x: 725, y: 0, width: 362, height: 724 },
    'meat': { x: 1087, y: 0, width: 361, height: 724 },
    'fish': { x: 1448, y: 0, width: 361, height: 724 },
    'jam': { x: 1809, y: 0, width: 363, height: 724 },
  },
  'icon-material.png': {
    'wood': { x: 0, y: 0, width: 365, height: 724 },
    'stone': { x: 365, y: 0, width: 361, height: 724 },
    'scrap-gear': { x: 726, y: 0, width: 360, height: 724 },
    'circuit-part': { x: 1086, y: 0, width: 362, height: 724 },
    'battery': { x: 1448, y: 0, width: 361, height: 724 },
    'crystal': { x: 1809, y: 0, width: 363, height: 724 },
  },
  'ui-chrome.png': {
    'panel': { x: 0, y: 0, width: 1254, height: 640 },
    'primary-button': { x: 0, y: 640, width: 1254, height: 222 },
    'rarity-common': { x: 0, y: 862, width: 254, height: 392 },
    'rarity-uncommon': { x: 254, y: 862, width: 246, height: 392 },
    'rarity-rare': { x: 500, y: 862, width: 247, height: 392 },
    'rarity-epic': { x: 747, y: 862, width: 248, height: 392 },
    'rarity-mythic': { x: 995, y: 862, width: 259, height: 392 },
  },
  'veh-van.png': {
    'full': { x: 0, y: 0, width: 1024, height: 1024 },
  },
  'veh-truck.png': {
    'full': { x: 0, y: 0, width: 1024, height: 1024 },
  },
  'prop-scrap.png': {
    'full': { x: 0, y: 0, width: 1024, height: 1024 },
  },
  'prop-pond.png': {
    'full': { x: 0, y: 0, width: 1024, height: 1024 },
  },
  'prop-crystal-cluster.png': {
    'full': { x: 0, y: 0, width: 1024, height: 1024 },
  },
  'npc-allen.png': {
    'full': { x: 0, y: 0, width: 1024, height: 1024 },
  },
  'npc-vivian.png': {
    'full': { x: 0, y: 0, width: 1024, height: 1024 },
  },
  'drone.png': {
    'full': { x: 0, y: 0, width: 1024, height: 1024 },
  },
};

/** 取图集某帧的源矩形，无此帧返回 null。 */
export function frameRect(file: string, frame: string): FrameRect | null {
  return FRAMES[file]?.[frame] ?? null;
}

/** 道具 id -> 图标帧；无美术覆盖返回 null（调用方回退 emoji）。 */
const ICON_MAP: Record<string, ArtFrame> = {
  // 武器
  rifle: { file: 'icon-weapons.png', frame: 'assault-rifle' },
  wp_akm: { file: 'icon-weapons.png', frame: 'assault-rifle' },
  wp_m4a1: { file: 'icon-weapons.png', frame: 'assault-rifle' },
  wp_plasma: { file: 'icon-weapons.png', frame: 'assault-rifle' },
  wp_mp5: { file: 'icon-weapons.png', frame: 'submachine-gun' },
  wp_m870: { file: 'icon-weapons.png', frame: 'shotgun' },
  wp_svd: { file: 'icon-weapons.png', frame: 'sniper-rifle' },
  wp_p1911: { file: 'icon-weapons.png', frame: 'pistol' },
  // 防具/背包/工具
  helmet_t2: { file: 'icon-gear.png', frame: 'helmet' },
  helmet_t3: { file: 'icon-gear.png', frame: 'helmet' },
  helmet_t4: { file: 'icon-gear.png', frame: 'helmet' },
  vest: { file: 'icon-gear.png', frame: 'plate-vest' },
  vest_t2: { file: 'icon-gear.png', frame: 'plate-vest' },
  vest_t3: { file: 'icon-gear.png', frame: 'plate-vest' },
  vest_t4: { file: 'icon-gear.png', frame: 'plate-vest' },
  vest_t5: { file: 'icon-gear.png', frame: 'plate-vest' },
  pack_canvas: { file: 'icon-gear.png', frame: 'backpack' },
  pack_tactical: { file: 'icon-gear.png', frame: 'backpack' },
  pickaxe_copper: { file: 'icon-gear.png', frame: 'pickaxe' },
  // 投掷/爆破
  throw_frag: { file: 'icon-throwable.png', frame: 'frag-grenade' },
  throw_molly: { file: 'icon-throwable.png', frame: 'molotov' },
  throw_smoke: { file: 'icon-throwable.png', frame: 'smoke-can' },
  throw_flash: { file: 'icon-throwable.png', frame: 'flash-grenade' },
  c4_explosive: { file: 'icon-throwable.png', frame: 'explosive-block' },
  thermite_charge: { file: 'icon-throwable.png', frame: 'explosive-block' },
  // 医疗
  bandage: { file: 'icon-medical-food.png', frame: 'bandage' },
  med_bandage: { file: 'icon-medical-food.png', frame: 'bandage' },
  medkit: { file: 'icon-medical-food.png', frame: 'medkit' },
  med_medkit: { file: 'icon-medical-food.png', frame: 'medkit' },
  med_surgery: { file: 'icon-medical-food.png', frame: 'medkit' },
  med_bloodbag: { file: 'icon-medical-food.png', frame: 'medkit' },
  antidote: { file: 'icon-medical-food.png', frame: 'pills' },
  med_painkiller: { file: 'icon-medical-food.png', frame: 'pills' },
  // 食物
  food: { file: 'icon-medical-food.png', frame: 'meat' },
  fish: { file: 'icon-medical-food.png', frame: 'fish' },
  fish2: { file: 'icon-medical-food.png', frame: 'fish' },
  fish_carp: { file: 'icon-medical-food.png', frame: 'fish' },
  fish_bass: { file: 'icon-medical-food.png', frame: 'fish' },
  fish_eel: { file: 'icon-medical-food.png', frame: 'fish' },
  fish_catfish: { file: 'icon-medical-food.png', frame: 'fish' },
  fish_crimson: { file: 'icon-medical-food.png', frame: 'fish' },
  fish_legend: { file: 'icon-medical-food.png', frame: 'fish' },
  jam_berry: { file: 'icon-medical-food.png', frame: 'jam' },
  honey_wild: { file: 'icon-medical-food.png', frame: 'jam' },
  wine_starfruit: { file: 'icon-medical-food.png', frame: 'jam' },
  // 材料
  wood: { file: 'icon-material.png', frame: 'wood' },
  stone: { file: 'icon-material.png', frame: 'stone' },
  ore_copper: { file: 'icon-material.png', frame: 'stone' },
  ore_silver: { file: 'icon-material.png', frame: 'stone' },
  ore_gold: { file: 'icon-material.png', frame: 'stone' },
  ore_iridium: { file: 'icon-material.png', frame: 'crystal' },
  scrap: { file: 'icon-material.png', frame: 'scrap-gear' },
  box: { file: 'icon-material.png', frame: 'scrap-gear' },
  fuel: { file: 'icon-material.png', frame: 'scrap-gear' },
  part: { file: 'icon-material.png', frame: 'circuit-part' },
  collect_circuit: { file: 'icon-material.png', frame: 'circuit-part' },
  att_scope4x: { file: 'icon-material.png', frame: 'circuit-part' },
  att_suppressor: { file: 'icon-material.png', frame: 'circuit-part' },
  att_extmag: { file: 'icon-material.png', frame: 'circuit-part' },
  att_foregrip: { file: 'icon-material.png', frame: 'circuit-part' },
  battery: { file: 'icon-material.png', frame: 'battery' },
  shard: { file: 'icon-material.png', frame: 'crystal' },
  plasma: { file: 'icon-material.png', frame: 'crystal' },
  dark_core: { file: 'icon-material.png', frame: 'crystal' },
};

export function iconFor(itemId: string): ArtFrame | null {
  return ICON_MAP[itemId] ?? null;
}

/** 图标在 /art 下的完整 URL，无覆盖返回 null。 */
export function iconUrl(itemId: string): string | null {
  const f = iconFor(itemId);
  return f ? `${ART_BASE}/${f.file}` : null;
}

/** 图标 strip 全图原始尺寸（实测自 atlas.json，用于 <img> 等比渲染）。 */
const STRIP_WH: Record<string, { w: number; h: number }> = {
  'icon-weapons.png': { w: 2172, h: 724 },
  'icon-gear.png': { w: 2172, h: 724 },
  'icon-throwable.png': { w: 2172, h: 724 },
  'icon-medical-food.png': { w: 2172, h: 724 },
  'icon-material.png': { w: 2172, h: 724 },
};

export interface SpriteStyle {
  /** 目标帧渲染宽高。 */
  width: number;
  height: number;
  /** 为显示目标帧，img 需向左偏移的 px（相对渲染尺寸）。 */
  offsetX: number;
  src: string;
  /** strip 全图渲染宽（img 标签宽），按 strip 高度等比。 */
  imgW: number;
}

/**
 * UI 精灵裁剪样式：图标图都是横向 strip，用 overflow:hidden 容器 + 负 margin
 * 只露出一帧。返回相对渲染尺寸的数值，调用方按 size 缩放。
 */
export function spriteStyle(file: string, frame: string, size: number): SpriteStyle | null {
  const r = frameRect(file, frame);
  const strip = STRIP_WH[file];
  if (!r || !strip) return null;
  const scale = size / strip.h;
  return {
    width: r.width * scale,
    height: size,
    offsetX: r.x === 0 ? 0 : -r.x * scale,
    src: `${ART_BASE}/${file}`,
    imgW: strip.w * scale,
  };
}

/** 预加载一批 /art 图片，返回缓存 map（Canvas/组件共用）。 */
export function preloadArt(files: string[]): Map<string, HTMLImageElement> {
  const cache = new Map<string, HTMLImageElement>();
  if (typeof Image === 'undefined') return cache;
  for (const f of files) {
    const src = `${ART_BASE}/${f}`;
    const img = new Image();
    img.src = src;
    cache.set(src, img);
  }
  return cache;
}

/** 紧身裁剪框（alpha>32 实测，源自 public/art/atlas.json contentBounds）。 */
const CONTENT_BOUNDS: Record<string, Record<string, FrameRect>> = {
  'char-survivor.png': {
    'southeast': { x: 183, y: 61, width: 261, height: 595 },
    'southwest': { x: 680, y: 60, width: 268, height: 596 },
    'northwest': { x: 1224, y: 59, width: 271, height: 602 },
    'northeast': { x: 1739, y: 57, width: 280, height: 603 },
  },
  'monster-pack.png': {
    'small-fast': { x: 33, y: 382, width: 469, height: 332 },
    'medium-armored': { x: 553, y: 201, width: 633, height: 521 },
    'huge-boss': { x: 1231, y: 13, width: 767, height: 726 },
  },
  'building-facility.png': {
    'watch-turret': { x: 43, y: 118, width: 372, height: 470 },
    'workbench': { x: 468, y: 215, width: 457, height: 375 },
    'storage-crate': { x: 976, y: 276, width: 351, height: 312 },
    'campfire': { x: 1372, y: 269, width: 371, height: 329 },
    'crystal-anchor': { x: 1804, y: 162, width: 323, height: 432 },
  },
  'nature-trees.png': {
    'pine': { x: 46, y: 17, width: 438, height: 681 },
    'oak': { x: 526, y: 58, width: 609, height: 635 },
    'boulder': { x: 1198, y: 253, width: 421, height: 437 },
    'dry-grass': { x: 1708, y: 312, width: 393, height: 375 },
  },
  'ui-chrome.png': {
    'rarity-common': { x: 23, y: 900, width: 220, height: 226 },
    'rarity-uncommon': { x: 265, y: 901, width: 224, height: 225 },
    'rarity-rare': { x: 512, y: 900, width: 225, height: 226 },
    'rarity-epic': { x: 758, y: 900, width: 225, height: 226 },
    'rarity-mythic': { x: 1008, y: 900, width: 225, height: 227 },
  },
  'veh-van.png': {
    'full': { x: 97, y: 218, width: 844, height: 615 },
  },
  'veh-truck.png': {
    'full': { x: 34, y: 221, width: 952, height: 630 },
  },
  'prop-scrap.png': {
    'full': { x: 134, y: 280, width: 766, height: 493 },
  },
  'prop-pond.png': {
    'full': { x: 116, y: 192, width: 807, height: 656 },
  },
  'prop-crystal-cluster.png': {
    'full': { x: 281, y: 173, width: 486, height: 682 },
  },
  'npc-allen.png': {
    'full': { x: 300, y: 30, width: 394, height: 957 },
  },
  'npc-vivian.png': {
    'full': { x: 357, y: 18, width: 334, height: 990 },
  },
  'drone.png': {
    'full': { x: 86, y: 222, width: 852, height: 602 },
  },
  'prop-wreck.png': {
    'wrecked-sedan': { x: 38, y: 195, width: 527, height: 343 },
    'ammo-crate': { x: 1032, y: 269, width: 336, height: 274 },
    'medical-cabinet': { x: 1448, y: 152, width: 256, height: 382 },
    'wooden-box': { x: 1799, y: 251, width: 331, height: 280 },
  },
};

/** 取紧身裁剪框；无则回退 frameRect；都没有返回 null。 */
export function frameContent(file: string, frame: string): FrameRect | null {
  return CONTENT_BOUNDS[file]?.[frame] ?? frameRect(file, frame);
}

/** 屏幕空间瞄准角（0=右，y 向下）→ 幸存者四向帧。 */
export function angleToSurvivorFrame(angle: number): string {
  const TAU = Math.PI * 2;
  const n = ((angle % TAU) + TAU) % TAU;
  if (n < Math.PI / 2) return 'southeast';
  if (n < Math.PI) return 'southwest';
  if (n < Math.PI * 1.5) return 'northwest';
  return 'northeast';
}

export interface SpriteSpec {
  file: string;
  frame: string;
  w: number;
  h: number;
  yOff: number;
  alpha: number;
}

const INTERACTABLE_SPRITES: Record<string, SpriteSpec> = {
  car: { file: 'prop-wreck.png', frame: 'wrecked-sedan', w: 104, h: 68, yOff: 8, alpha: 1 },
  boulder: { file: 'nature-trees.png', frame: 'boulder', w: 60, h: 62, yOff: 6, alpha: 1 },
  shelves: { file: 'building-facility.png', frame: 'storage-crate', w: 52, h: 46, yOff: 4, alpha: 1 },
  med_cabinet: { file: 'prop-wreck.png', frame: 'medical-cabinet', w: 34, h: 51, yOff: 4, alpha: 1 },
  ammo_crate: { file: 'prop-wreck.png', frame: 'ammo-crate', w: 48, h: 39, yOff: 4, alpha: 1 },
  box: { file: 'prop-wreck.png', frame: 'wooden-box', w: 46, h: 39, yOff: 4, alpha: 1 },
  workbench: { file: 'building-facility.png', frame: 'workbench', w: 60, h: 49, yOff: 2, alpha: 1 },
  campfire: { file: 'building-facility.png', frame: 'campfire', w: 64, h: 57, yOff: 4, alpha: 0.9 },
  crystal: { file: 'prop-crystal-cluster.png', frame: 'full', w: 40, h: 56, yOff: 4, alpha: 1 },
  van: { file: 'veh-van.png', frame: 'full', w: 110, h: 80, yOff: 8, alpha: 1 },
  van2: { file: 'veh-truck.png', frame: 'full', w: 116, h: 77, yOff: 8, alpha: 1 },
  scrap: { file: 'prop-scrap.png', frame: 'full', w: 72, h: 46, yOff: 4, alpha: 1 },
  pond: { file: 'prop-pond.png', frame: 'full', w: 84, h: 68, yOff: 6, alpha: 1 },
};

export function interactableSprite(type: string): SpriteSpec | null {
  return INTERACTABLE_SPRITES[type] ?? null;
}

const BUILDING_SPRITES: Record<string, SpriteSpec> = {
  turret: { file: 'building-facility.png', frame: 'watch-turret', w: 36, h: 46, yOff: 0, alpha: 1 },
  workbench: { file: 'building-facility.png', frame: 'workbench', w: 56, h: 46, yOff: 0, alpha: 1 },
  storage_box: { file: 'building-facility.png', frame: 'storage-crate', w: 44, h: 39, yOff: 0, alpha: 1 },
  anchor_core: { file: 'building-facility.png', frame: 'crystal-anchor', w: 44, h: 59, yOff: 0, alpha: 1 },
};

export function buildingSprite(type: string): SpriteSpec | null {
  return BUILDING_SPRITES[type] ?? null;
}

const RARITY_FRAME_ID: Record<number, string> = {
  1: 'rarity-common',
  2: 'rarity-uncommon',
  3: 'rarity-rare',
  4: 'rarity-epic',
  5: 'rarity-mythic',
};

export interface FrameBgStyle {
  backgroundImage: string;
  backgroundSize: string;
  backgroundPosition: string;
  width: number;
  height: number;
}

/** 稀有度框背景样式（background-position 精灵，居中）；越界返回 null（调用方保留现有边框）。 */
export function rarityFrameStyle(rarity: number | undefined, size: number): FrameBgStyle | null {
  if (!Number.isInteger(rarity) || (rarity as number) < 1 || (rarity as number) > 5) return null;
  const frame = RARITY_FRAME_ID[rarity as number];
  const r = frameContent('ui-chrome.png', frame);
  if (!r) return null;
  const scale = size / 1254;
  const w = r.width * scale;
  const h = r.height * scale;
  const dx = (size - w) / 2;
  const dy = (size - h) / 2;
  return {
    backgroundImage: `url(${ART_BASE}/ui-chrome.png)`,
    backgroundSize: `${1254 * scale}px ${1254 * scale}px`,
    backgroundPosition: `${dx - r.x * scale}px ${dy - r.y * scale}px`,
    width: size,
    height: size,
  };
}
