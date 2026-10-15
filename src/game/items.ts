import type { Item } from '../types/game';

export type ItemQuality = 0 | 1 | 2 | 3;

export interface ItemDef {
  id: string;
  name: string;
  category: 'weapon' | 'tool' | 'medical' | 'food' | 'material' | 'armor' | 'pack';
  icon: string;
  rarity: 1 | 2 | 3 | 4 | 5;
  maxCount: number;
  desc: string;
  buyPrice: number;
  sellPrice: number;
  heal?: number;
  satiety?: number;
  damage?: number;
  shield?: number;
}

export const ITEM_DEFS: Record<string, ItemDef> = {
  wood: { id: 'wood', name: '优质原木', category: 'material', icon: '🪵', rarity: 1, maxCount: 999, desc: '砍树产出，建造与制造基底。', buyPrice: 5, sellPrice: 3 },
  stone: { id: 'stone', name: '花岗石料', category: 'material', icon: '🪨', rarity: 1, maxCount: 999, desc: '采石产出，墙体与工具原料。', buyPrice: 5, sellPrice: 3 },
  scrap: { id: 'scrap', name: '特种废铁', category: 'material', icon: '⚙️', rarity: 1, maxCount: 999, desc: '拆车/废墟产出，工作台核心材料。', buyPrice: 15, sellPrice: 12 },
  box: { id: 'box', name: '水下锈蚀铁盒', category: 'material', icon: '📦', rarity: 1, maxCount: 20, desc: '开出随机废料，开盒惊喜。', buyPrice: 30, sellPrice: 18 },
  part: { id: 'part', name: '机械零件', category: 'material', icon: '🔧', rarity: 3, maxCount: 999, desc: '搜刮产出，枪械/载具关键件。', buyPrice: 40, sellPrice: 28 },
  battery: { id: 'battery', name: '高耐腐蚀电池', category: 'material', icon: '🔋', rarity: 3, maxCount: 20, desc: '汽修铺/快艇残骸产出。', buyPrice: 60, sellPrice: 42 },
  iron_ore: { id: 'iron_ore', name: '伴生铁矿', category: 'material', icon: '⛏️', rarity: 3, maxCount: 999, desc: '采石场伴生，加固墙体用。', buyPrice: 35, sellPrice: 24 },
  fuel: { id: 'fuel', name: '高纯度燃油', category: 'material', icon: '🛢️', rarity: 3, maxCount: 50, desc: '油罐车/加油站产出。', buyPrice: 45, sellPrice: 30 },
  food: { id: 'food', name: '战术能量肉排', category: 'food', icon: '🥩', rarity: 2, maxCount: 99, desc: '点击食用，恢复35点饱食。', buyPrice: 12, sellPrice: 8, satiety: 35, heal: 0 },
  fish: { id: 'fish', name: '变异黄颡鱼', category: 'food', icon: '🐟', rarity: 2, maxCount: 99, desc: '一号钓台常见鱼，烤制更香。', buyPrice: 20, sellPrice: 14, satiety: 30, heal: 5 },
  fish2: { id: 'fish2', name: '裂隙荧光金鳟', category: 'food', icon: '🐟', rarity: 2, maxCount: 99, desc: '裂隙水域荧光鱼，售价更高。', buyPrice: 45, sellPrice: 32, satiety: 40, heal: 10 },
  water: { id: 'water', name: '高纯度饮用水', category: 'food', icon: '💧', rarity: 2, maxCount: 99, desc: '水井/餐馆产出，恢复15点饱食。', buyPrice: 8, sellPrice: 5, satiety: 15, heal: 0 },
  ammo: { id: 'ammo', name: '7.62mm步枪弹药包', category: 'material', icon: '🎯', rarity: 3, maxCount: 999, desc: '通用步枪备弹，按R装填。', buyPrice: 10, sellPrice: 6 },
  c4_explosive: { id: 'c4_explosive', name: '高爆C4塑胶炸药', category: 'tool', icon: '💣', rarity: 4, maxCount: 20, desc: '突袭破拆高耐久安全门。', buyPrice: 150, sellPrice: 100 },
  thermite_charge: { id: 'thermite_charge', name: '微型铝热熔切弹', category: 'tool', icon: '🔥', rarity: 4, maxCount: 20, desc: '无声熔切，破拆不拉警报。', buyPrice: 180, sellPrice: 120 },
  medkit: { id: 'medkit', name: '纳米急救箱', category: 'medical', icon: '💉', rarity: 4, maxCount: 10, desc: '点击使用，恢复60点生命。', buyPrice: 120, sellPrice: 95, heal: 60 },
  bandage: { id: 'bandage', name: '草药绷带', category: 'medical', icon: '🩹', rarity: 2, maxCount: 10, desc: '点击使用，恢复30点生命。', buyPrice: 30, sellPrice: 20, heal: 30 },
  antidote: { id: 'antidote', name: '抗酸蚀解毒剂', category: 'medical', icon: '💊', rarity: 3, maxCount: 10, desc: '解除酸雨/毒雾持续掉血。', buyPrice: 80, sellPrice: 55, heal: 10 },
  credits: { id: 'credits', name: '废土信用点', category: 'material', icon: '💰', rarity: 2, maxCount: 999999, desc: '货币，直接进钱包。', buyPrice: 1, sellPrice: 1 },
  shard: { id: 'shard', name: '高纯度紫晶石', category: 'material', icon: '💎', rarity: 4, maxCount: 999, desc: '裂隙产出，高阶制造与货币。', buyPrice: 320, sellPrice: 280 },
  plasma: { id: 'plasma', name: '虚空高能等离子聚合体', category: 'material', icon: '🟣', rarity: 5, maxCount: 999, desc: '异象核心提取，毕业材料。', buyPrice: 500, sellPrice: 420 },
  dark_core: { id: 'dark_core', name: '坍界暗物质晶核', category: 'material', icon: '🕳️', rarity: 5, maxCount: 999, desc: 'BOSS掉落，最硬通货之一。', buyPrice: 600, sellPrice: 500 },
  blueprint: { id: 'blueprint', name: '破界级等离子步枪蓝图', category: 'material', icon: '📜', rarity: 5, maxCount: 10, desc: '鉴定后换500信用点（后续开图纸解锁）。', buyPrice: 500, sellPrice: 500 },
  rifle: { id: 'rifle', name: '战术突击步枪', category: 'weapon', icon: '🔫', rarity: 5, maxCount: 1, desc: '单发124伤害，装填步枪弹药（R）。', buyPrice: 1200, sellPrice: 800, damage: 124 },
  vest: { id: 'vest', name: '军用防弹背心', category: 'armor', icon: '🦺', rarity: 5, maxCount: 1, desc: '护盾上限+50，受伤减免15%。', buyPrice: 900, sellPrice: 600, shield: 50 },
  pack_canvas: { id: 'pack_canvas', name: '帆布背包', category: 'pack', icon: '🎒', rarity: 3, maxCount: 1, desc: '背包格+2。', buyPrice: 200, sellPrice: 140 },
  pack_tactical: { id: 'pack_tactical', name: '战术携行具', category: 'pack', icon: '🧳', rarity: 4, maxCount: 1, desc: '背包格+4。', buyPrice: 500, sellPrice: 350 },
  seed_parsnip: { id: 'seed_parsnip', name: '防风草种子×5', category: 'material', icon: '🌱', rarity: 1, maxCount: 99, desc: '农圩种植，4天成熟，星露谷开局菜。', buyPrice: 20, sellPrice: 8 },
  seed_potato: { id: 'seed_potato', name: '土豆种子×5', category: 'material', icon: '🌱', rarity: 1, maxCount: 99, desc: '农圩种植，6天成熟，产量大。', buyPrice: 35, sellPrice: 12 },
  seed_corn: { id: 'seed_corn', name: '玉米种子×5', category: 'material', icon: '🌱', rarity: 2, maxCount: 99, desc: '夏秋两季作物，连续收获。', buyPrice: 60, sellPrice: 20 },
  seed_pumpkin: { id: 'seed_pumpkin', name: '南瓜种子×3', category: 'material', icon: '🌱', rarity: 2, maxCount: 99, desc: '秋季巨型作物，单价高。', buyPrice: 80, sellPrice: 28 },
  seed_starfruit: { id: 'seed_starfruit', name: '星果种子×1', category: 'material', icon: '✨', rarity: 4, maxCount: 20, desc: '沙漠商人限定，毕业经济作物。', buyPrice: 400, sellPrice: 150 },
  crop_parsnip: { id: 'crop_parsnip', name: '防风草', category: 'food', icon: '🥕', rarity: 1, maxCount: 99, desc: '恢复20饱食，银星以上更值钱。', buyPrice: 35, sellPrice: 35, satiety: 20, heal: 2 },
  crop_potato: { id: 'crop_potato', name: '土豆', category: 'food', icon: '🥔', rarity: 1, maxCount: 99, desc: '恢复25饱食，量大管饱。', buyPrice: 50, sellPrice: 50, satiety: 25, heal: 3 },
  crop_corn: { id: 'crop_corn', name: '玉米', category: 'food', icon: '🌽', rarity: 2, maxCount: 99, desc: '恢复30饱食，可加工爆米花。', buyPrice: 75, sellPrice: 75, satiety: 30, heal: 5 },
  crop_pumpkin: { id: 'crop_pumpkin', name: '南瓜', category: 'food', icon: '🎃', rarity: 2, maxCount: 99, desc: '恢复40饱食+10生命，秋收之王。', buyPrice: 160, sellPrice: 160, satiety: 40, heal: 10 },
  crop_starfruit: { id: 'crop_starfruit', name: '星果', category: 'food', icon: '🌟', rarity: 4, maxCount: 99, desc: '恢复60饱食+20生命，酿酒暴利。', buyPrice: 750, sellPrice: 750, satiety: 60, heal: 20 },
  crop_blueberry: { id: 'crop_blueberry', name: '蓝莓×3', category: 'food', icon: '🫐', rarity: 2, maxCount: 99, desc: '一次收三颗，果酱原料。', buyPrice: 90, sellPrice: 90, satiety: 35, heal: 8 },
  ore_copper: { id: 'ore_copper', name: '铜矿石', category: 'material', icon: '🟤', rarity: 2, maxCount: 999, desc: '升级铜制农具，伐木场工具棚产出。', buyPrice: 30, sellPrice: 20 },
  ore_silver: { id: 'ore_silver', name: '银矿石', category: 'material', icon: '⬜', rarity: 3, maxCount: 999, desc: '升级钢制工具，采石场伴生。', buyPrice: 80, sellPrice: 60 },
  ore_gold: { id: 'ore_gold', name: '金矿石', category: 'material', icon: '🟡', rarity: 4, maxCount: 999, desc: '升级金制工具，雪峰富矿产出。', buyPrice: 180, sellPrice: 140 },
  ore_iridium: { id: 'ore_iridium', name: '铱矿石', category: 'material', icon: '🟪', rarity: 5, maxCount: 999, desc: '升级铱制工具，深渊裂口限定。', buyPrice: 400, sellPrice: 320 },
  fish_carp: { id: 'fish_carp', name: '星露鲤鱼', category: 'food', icon: '🐟', rarity: 1, maxCount: 99, desc: '渔港浅滩常见鱼，新手练级鱼。', buyPrice: 30, sellPrice: 30, satiety: 25, heal: 3 },
  fish_bass: { id: 'fish_bass', name: '大嘴鲈鱼', category: 'food', icon: '🐟', rarity: 2, maxCount: 99, desc: '湖心深水鱼，鱼汤原料。', buyPrice: 60, sellPrice: 60, satiety: 35, heal: 6 },
  fish_eel: { id: 'fish_eel', name: '沼泽鳗鱼', category: 'food', icon: '🐍', rarity: 3, maxCount: 99, desc: '雨天沼泽限定，烹饪高档料。', buyPrice: 120, sellPrice: 120, satiety: 45, heal: 10 },
  fish_catfish: { id: 'fish_catfish', name: '裂隙鲶鱼', category: 'food', icon: '🐟', rarity: 3, maxCount: 99, desc: '裂隙水域大物，能量棒原料。', buyPrice: 150, sellPrice: 150, satiety: 50, heal: 12 },
  fish_crimson: { id: 'fish_crimson', name: '绯红锦鲤', category: 'food', icon: '🔴', rarity: 4, maxCount: 20, desc: '深渊荧光苔附近，深红传说前兆。', buyPrice: 400, sellPrice: 400, satiety: 60, heal: 20 },
  fish_legend: { id: 'fish_legend', name: '传说之鱼', category: 'food', icon: '👑', rarity: 5, maxCount: 5, desc: '全图唯一大物，售价封顶，神话藏品。', buyPrice: 2000, sellPrice: 2000, satiety: 100, heal: 50 },
  jam_berry: { id: 'jam_berry', name: '蓝莓果酱', category: 'food', icon: '🫙', rarity: 3, maxCount: 99, desc: '果酱桶加工，售价翻倍，恢复45饱食。', buyPrice: 180, sellPrice: 180, satiety: 45, heal: 10 },
  pickle_veg: { id: 'pickle_veg', name: '腌南瓜', category: 'food', icon: '🥒', rarity: 3, maxCount: 99, desc: '腌菜瓮加工，恢复40饱食。', buyPrice: 320, sellPrice: 320, satiety: 40, heal: 12 },
  cheese_goat: { id: 'cheese_goat', name: '羊奶酪', category: 'food', icon: '🧀', rarity: 3, maxCount: 99, desc: '奶酪机加工，恢复50饱食+15生命。', buyPrice: 240, sellPrice: 240, satiety: 50, heal: 15 },
  wine_starfruit: { id: 'wine_starfruit', name: '星果酒', category: 'food', icon: '🍷', rarity: 5, maxCount: 50, desc: '木桶陈酿90天，毕业暴利单品。', buyPrice: 2250, sellPrice: 2250, satiety: 40, heal: 30 },
  honey_wild: { id: 'honey_wild', name: '野蜂蜜', category: 'food', icon: '🍯', rarity: 2, maxCount: 99, desc: '蜂箱采集，恢复30饱食+能量棒原料。', buyPrice: 100, sellPrice: 100, satiety: 30, heal: 8 },
  cook_stirfry: { id: 'cook_stirfry', name: '蔬菜炒', category: 'food', icon: '🥗', rarity: 2, maxCount: 50, desc: '烹饪锅制作，恢复45饱食+10生命。', buyPrice: 110, sellPrice: 110, satiety: 45, heal: 10 },
  cook_fishsoup: { id: 'cook_fishsoup', name: '鱼汤', category: 'food', icon: '🍲', rarity: 3, maxCount: 50, desc: '鲈鱼+莲藕熬制，恢复60饱食+20生命。', buyPrice: 220, sellPrice: 220, satiety: 60, heal: 20 },
  cook_energybar: { id: 'cook_energybar', name: '能量棒', category: 'food', icon: '🍫', rarity: 3, maxCount: 50, desc: '蜂蜜+鲶鱼干粮，恢复55饱食+30体力感。', buyPrice: 200, sellPrice: 200, satiety: 55, heal: 15 },
};

export const WEAPON_DAMAGE: Record<string, number> = { rifle: 124, crude_gun: 55 };
export const ARMOR_BONUS_TABLE: Record<string, number> = { armor_cloth: 25, armor_vest: 50, vest: 50 };
export const MED_HEAL: Record<string, number> = { med_bandage: 30, bandage: 30, med_medkit: 60, medkit: 60, antidote: 10 };
export const THROW_DAMAGE: Record<string, number> = { c4_explosive: 400, thermite_charge: 250 };
export const SEED_GROW: Record<string, { cropId: string; outCount: number }> = {
  seed_parsnip: { cropId: 'crop_parsnip', outCount: 4 },
  seed_potato: { cropId: 'crop_potato', outCount: 4 },
  seed_corn: { cropId: 'crop_corn', outCount: 4 },
  seed_pumpkin: { cropId: 'crop_pumpkin', outCount: 3 },
  seed_starfruit: { cropId: 'crop_starfruit', outCount: 2 },
};
export const COOK_SOURCE: Record<string, { materials: { itemId: string; count: number }[] }> = {
  cook_stirfry: { materials: [{ itemId: 'crop_corn', count: 2 }, { itemId: 'crop_parsnip', count: 2 }] },
  cook_fishsoup: { materials: [{ itemId: 'fish_bass', count: 2 }, { itemId: 'water', count: 2 }] },
  cook_energybar: { materials: [{ itemId: 'honey_wild', count: 2 }, { itemId: 'fish_catfish', count: 1 }] },
  jam_berry: { materials: [{ itemId: 'crop_blueberry', count: 3 }] },
  pickle_veg: { materials: [{ itemId: 'crop_pumpkin', count: 2 }] },
  cheese_goat: { materials: [{ itemId: 'crop_corn', count: 2 }, { itemId: 'honey_wild', count: 1 }] },
  wine_starfruit: { materials: [{ itemId: 'crop_starfruit', count: 3 }] },
};
export const FOOD_VALUE: Record<string, { satiety: number; heal: number }> = {
  food: { satiety: 35, heal: 0 },
  fish: { satiety: 30, heal: 5 },
  fish2: { satiety: 40, heal: 10 },
  water: { satiety: 15, heal: 0 },
  crop_parsnip: { satiety: 20, heal: 2 },
  crop_potato: { satiety: 25, heal: 3 },
  crop_corn: { satiety: 30, heal: 5 },
  crop_pumpkin: { satiety: 40, heal: 10 },
  crop_starfruit: { satiety: 60, heal: 20 },
  crop_blueberry: { satiety: 35, heal: 8 },
  fish_carp: { satiety: 25, heal: 3 },
  fish_bass: { satiety: 35, heal: 6 },
  fish_eel: { satiety: 45, heal: 10 },
  fish_catfish: { satiety: 50, heal: 12 },
  fish_crimson: { satiety: 60, heal: 20 },
  fish_legend: { satiety: 100, heal: 50 },
  jam_berry: { satiety: 45, heal: 10 },
  pickle_veg: { satiety: 40, heal: 12 },
  cheese_goat: { satiety: 50, heal: 15 },
  wine_starfruit: { satiety: 40, heal: 30 },
  honey_wild: { satiety: 30, heal: 8 },
  cook_stirfry: { satiety: 45, heal: 10 },
  cook_fishsoup: { satiety: 60, heal: 20 },
  cook_energybar: { satiety: 55, heal: 15 },
};

export function getItemDef(id: string): ItemDef {
  const d = ITEM_DEFS[id];
  if (!d) throw new Error(`unknown item: ${id}`);
  return d;
}

export function makeItem(id: string, count: number): Item {
  const d = getItemDef(id);
  return {
    id: d.id, name: d.name, category: d.category, icon: d.icon,
    count: Math.max(1, Math.min(d.maxCount, count)), maxCount: d.maxCount,
    desc: d.desc, rarity: d.rarity,
  };
}

export function qualitySellPrice(id: string, quality: ItemQuality): number {
  const base = getItemDef(id).sellPrice;
  if (quality === 1) return Math.floor(base * 1.25);
  if (quality === 2) return Math.floor(base * 1.5);
  if (quality === 3) return base * 2;
  return base;
}

export type LootResourceNew = 'wood' | 'stone' | 'scrap' | 'parts' | 'food' | 'ammo' | 'c4' | 'medical' | 'weapon' | 'armor' | 'credits' | 'shard' | 'blueprint' | 'pack' | 'throwable' | 'valuable' | 'seed';

export function lootResourceOfNew(itemId: string): LootResourceNew {
  if (itemId.startsWith('seed_')) return 'seed';
  if (itemId.startsWith('crop_') || itemId.startsWith('fish_') || itemId.startsWith('cook_') || itemId.startsWith('jam_') || itemId.startsWith('wine_') || itemId.startsWith('pickle_') || itemId.startsWith('cheese_') || itemId.startsWith('honey_')) return 'food';
  if (itemId.startsWith('ore_')) return 'parts';
  if (itemId === 'wood') return 'wood';
  if (itemId === 'stone') return 'stone';
  if (itemId === 'part' || itemId === 'battery' || itemId === 'iron_ore' || itemId === 'fuel') return 'parts';
  if (itemId === 'food' || itemId === 'fish' || itemId === 'fish2' || itemId === 'water') return 'food';
  if (itemId === 'ammo') return 'ammo';
  if (itemId === 'c4_explosive' || itemId === 'thermite_charge') return 'c4';
  if (itemId === 'medkit' || itemId === 'bandage' || itemId === 'antidote') return 'medical';
  if (itemId === 'rifle') return 'weapon';
  if (itemId === 'vest') return 'armor';
  if (itemId === 'credits') return 'credits';
  if (itemId === 'shard' || itemId === 'plasma' || itemId === 'dark_core') return 'shard';
  if (itemId === 'blueprint') return 'blueprint';
  if (itemId === 'pack_canvas' || itemId === 'pack_tactical') return 'pack';
  return 'scrap';
}
