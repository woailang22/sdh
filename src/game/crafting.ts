import { makeItem } from './items';
import type { Item } from '../types/game';
import { gatheringDescription, inventoryCapacity } from './equipmentRules';

export interface CraftCost {
  wood: number;
  stone: number;
  scrap: number;
  parts: number;
  extra?: { itemId: string; count: number }[];
}

export interface CraftOrder {
  id: string;
  cost: CraftCost;
}

export interface Recipe {
  id: string;
  name: string;
  resultName: string;
  icon: string;
  category: string;
  desc: string;
  cost: CraftCost;
  resultItemId: string;
  resultCount: number;
}

const RECIPES: Omit<Recipe, 'resultItemId' | 'resultCount'>[] = [
  { id: 'smelt_copper', name: '冶炼铜锭 ×1', resultName: '精炼铜锭', icon: '🟠', category: '矿物冶炼', desc: '在营地熔炉加工，消耗铜矿3和木材2。', cost: { wood: 2, stone: 0, scrap: 0, parts: 0, extra: [{ itemId: 'ore_copper', count: 3 }] } },
  { id: 'plasma_rifle', name: '制造等离子步枪', resultName: '破界等离子步枪', icon: '🔫', category: '武器打造', desc: '研究蓝图后在工作台制造，需要铜锭和稀有晶核。', cost: { wood: 0, stone: 0, scrap: 40, parts: 8, extra: [{ itemId: 'copper_bar', count: 4 }, { itemId: 'dark_core', count: 2 }] } },
  {
    id: 'stone_pickaxe',
    name: '开山镐',
    resultName: '开山镐',
    icon: '⛏️',
    category: '工具打造',
    desc: gatheringDescription('pickaxe_stone')!,
    cost: { wood: 8, stone: 6, scrap: 0, parts: 0 },
  },
  {
    id: 'stone_axe',
    name: '石斧',
    resultName: '石斧',
    icon: '🪓',
    category: '工具打造',
    desc: gatheringDescription('axe_stone')!,
    cost: { wood: 10, stone: 4, scrap: 0, parts: 0 },
  },
  {
    id: 'rod_basic',
    name: '简易钓竿',
    resultName: '简易钓竿',
    icon: '🎣',
    category: '工具打造',
    desc: gatheringDescription('rod_basic')!,
    cost: { wood: 8, stone: 0, scrap: 4, parts: 0 },
  },
  {
    id: 'crude_gun',
    name: '土铳（粗制火枪）',
    resultName: '土铳',
    icon: '🔫',
    category: '武器打造',
    desc: '第一把枪！装填步枪弹药，单发55伤害。先有它再谈打怪。',
    cost: { wood: 12, stone: 0, scrap: 10, parts: 1 },
  },
  {
    id: 'bandage',
    name: '亚麻绷带 ×2',
    resultName: '亚麻绷带',
    icon: '🩹',
    category: '医疗合成',
    desc: '每个恢复30点生命，穷人的救命稻草。',
    cost: { wood: 0, stone: 0, scrap: 6, parts: 0 },
  },
  {
    id: 'dried_fish',
    name: '篝火烤肉干 ×2',
    resultName: '烤肉干',
    icon: '🍖',
    category: '食物加工',
    desc: '每个恢复35点饱食。别等饿到掉血才想起吃饭。',
    cost: { wood: 6, stone: 0, scrap: 0, parts: 0, extra: [{ itemId: 'fish', count: 2 }] },
  },
  {
    id: 'ammo_pack',
    name: '步枪弹药 ×30',
    resultName: '步枪弹药',
    icon: '🎯',
    category: '弹药制造',
    desc: '有枪没弹等于烧火棍，记得按 R 装填。',
    cost: { wood: 0, stone: 0, scrap: 15, parts: 1 },
  },
  {
    id: 'nano_medkit',
    name: '纳米医疗包 ×1',
    resultName: '纳米医疗包',
    icon: '💉',
    category: '医疗合成',
    desc: '恢复60点生命，红区攻坚必备。',
    cost: { wood: 0, stone: 0, scrap: 10, parts: 1 },
  },
  {
    id: 'cloth_armor',
    name: '粗布护甲',
    resultName: '粗布护甲',
    icon: '🧥',
    category: '护甲打造',
    desc: '护盾上限+25，废土独行第一件护具，进背包后记得穿上。',
    cost: { wood: 4, stone: 0, scrap: 8, parts: 0 },
  },
  {
    id: 'pack_canvas',
    name: '帆布背包',
    resultName: '帆布背包',
    icon: '🎒',
    category: '背包打造',
    desc: `背包格 +2（共${inventoryCapacity('pack_canvas')}格）。装备后生效。`,
    cost: { wood: 6, stone: 0, scrap: 12, parts: 0 },
  },
  {
    id: 'pack_tactical',
    name: '战术携行具',
    resultName: '战术携行具',
    icon: '🧳',
    category: '背包打造',
    desc: `背包格 +4（共${inventoryCapacity('pack_tactical')}格）。装备后生效。`,
    cost: { wood: 0, stone: 0, scrap: 25, parts: 3 },
  },
  {
    id: 'armor_plate',
    name: '军用防弹背心',
    resultName: '军用防弹背心',
    icon: '🦺',
    category: '护甲打造',
    desc: '护盾上限+50，受伤减免15%。穿上它再去红区。',
    cost: { wood: 0, stone: 0, scrap: 20, parts: 2 },
  },
  { id: 'grow_parsnip', name: '种植：防风草 ×4', resultName: '防风草', icon: '🥕', category: '农圩种植', desc: '种子×1农圩种植，工作台浓缩为12秒。', cost: { wood: 2, stone: 0, scrap: 0, parts: 0, extra: [{ itemId: 'seed_parsnip', count: 1 }] } },
  { id: 'grow_potato', name: '种植：土豆 ×4', resultName: '土豆', icon: '🥔', category: '农圩种植', desc: '种子×1，量大管饱。', cost: { wood: 2, stone: 0, scrap: 2, parts: 0, extra: [{ itemId: 'seed_potato', count: 1 }] } },
  { id: 'grow_corn', name: '种植：玉米 ×4', resultName: '玉米', icon: '🌽', category: '农圩种植', desc: '种子×1，鱼汤原料。', cost: { wood: 4, stone: 0, scrap: 2, parts: 0, extra: [{ itemId: 'seed_corn', count: 1 }] } },
  { id: 'grow_pumpkin', name: '种植：南瓜 ×3', resultName: '南瓜', icon: '🎃', category: '农圩种植', desc: '种子×1，腌菜原料。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'seed_pumpkin', count: 1 }] } },
  { id: 'grow_starfruit', name: '种植：星果 ×2', resultName: '星果', icon: '🌟', category: '农圩种植', desc: '种子×1，酿酒暴利。', cost: { wood: 6, stone: 0, scrap: 6, parts: 1, extra: [{ itemId: 'seed_starfruit', count: 1 }] } },
  { id: 'jam_pot', name: '蓝莓果酱 ×2', resultName: '蓝莓果酱', icon: '🫙', category: '食物加工', desc: '蓝莓×3→果酱×2，售价翻倍。', cost: { wood: 4, stone: 0, scrap: 6, parts: 0, extra: [{ itemId: 'crop_blueberry', count: 3 }] } },
  { id: 'cook_pot', name: '鱼汤 ×2', resultName: '鱼汤', icon: '🍲', category: '食物加工', desc: '鲈鱼×2+水感废料，恢复60饱食。', cost: { wood: 6, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'fish_bass', count: 2 }] } },
  { id: 'copper_pickaxe', name: '铜镐', resultName: '铜镐', icon: '⛏️', category: '工具打造', desc: gatheringDescription('pickaxe_copper')!, cost: { wood: 6, stone: 0, scrap: 8, parts: 0, extra: [{ itemId: 'ore_copper', count: 8 }] } },
  { id: 'ammo_reload', name: '复装弹药 ×30', resultName: '复装弹药', icon: '🎯', category: '弹药制造', desc: '废铁×10+零件×1，通用备弹+30。', cost: { wood: 0, stone: 0, scrap: 10, parts: 1 } },
  { id: 'surgery_craft', name: '野战手术包 ×1', resultName: '野战手术包', icon: '💉', category: '医疗合成', desc: '绷带×2+零件×1，恢复100生命。', cost: { wood: 0, stone: 0, scrap: 14, parts: 1, extra: [{ itemId: 'med_bandage', count: 2 }] } },
  { id: 'star_wine', name: '星果酒 ×1', resultName: '星果酒', icon: '🍷', category: '食物加工', desc: '星果×3陈酿，毕业暴利。', cost: { wood: 10, stone: 0, scrap: 8, parts: 1, extra: [{ itemId: 'crop_starfruit', count: 3 }] } },
  { id: 'gun_upgrade_m4', name: '改装：M4A1（耗AKM+扩容匣）', resultName: 'M4A1', icon: '🔫', category: '武器打造', desc: 'AKM+扩容弹匣→M4A1（110伤），旧枪折价。', cost: { wood: 0, stone: 0, scrap: 15, parts: 2, extra: [{ itemId: 'att_extmag', count: 1 }, { itemId: 'wp_akm', count: 1 }] } },
  { id: 'pickle_pot', name: '腌南瓜 ×2', resultName: '腌南瓜', icon: '🥒', category: '食物加工', desc: '南瓜×2→腌菜×2。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'crop_pumpkin', count: 2 }] } },
  { id: 'cheese_press', name: '羊奶酪 ×1', resultName: '羊奶酪', icon: '🧀', category: '食物加工', desc: '玉米×2+蜂蜜×1→奶酪。', cost: { wood: 4, stone: 0, scrap: 6, parts: 0, extra: [{ itemId: 'crop_corn', count: 2 }, { itemId: 'honey_wild', count: 1 }] } },
  { id: 'stirfry_pan', name: '蔬菜炒 ×2', resultName: '蔬菜炒', icon: '🥗', category: '食物加工', desc: '玉米×2+防风草×2→蔬菜炒。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'crop_corn', count: 2 }, { itemId: 'crop_parsnip', count: 2 }] } },
  { id: 'energy_mix', name: '能量棒 ×2', resultName: '能量棒', icon: '🍫', category: '食物加工', desc: '蜂蜜×2+裂隙鲶鱼×1→能量棒。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'honey_wild', count: 2 }, { itemId: 'fish_catfish', count: 1 }] } },
];


const RESULTS: Record<string, [string, number]> = {"stone_pickaxe": ["pickaxe_stone", 1], "stone_axe": ["axe_stone", 1], "rod_basic": ["rod_basic", 1], "crude_gun": ["crude_gun", 1], "bandage": ["med_bandage", 2], "dried_fish": ["dried_fish", 2], "ammo_pack": ["ammo", 30], "nano_medkit": ["med_medkit", 1], "cloth_armor": ["armor_cloth", 1], "pack_canvas": ["pack_canvas", 1], "pack_tactical": ["pack_tactical", 1], "armor_plate": ["vest", 1], "grow_parsnip": ["crop_parsnip", 4], "grow_potato": ["crop_potato", 4], "grow_corn": ["crop_corn", 4], "grow_pumpkin": ["crop_pumpkin", 3], "grow_starfruit": ["crop_starfruit", 2], "jam_pot": ["jam_berry", 2], "cook_pot": ["cook_fishsoup", 2], "copper_pickaxe": ["pickaxe_copper", 1], "ammo_reload": ["ammo", 30], "surgery_craft": ["med_surgery", 1], "star_wine": ["wine_starfruit", 1], "gun_upgrade_m4": ["wp_m4a1", 1], "pickle_pot": ["pickle_veg", 2], "cheese_press": ["cheese_goat", 1], "stirfry_pan": ["cook_stirfry", 2], "energy_mix": ["cook_energybar", 2]};

RESULTS.smelt_copper = ['copper_bar', 1];
RESULTS.plasma_rifle = ['wp_plasma', 1];

export const CRAFT_RECIPES: Recipe[] = RECIPES.map(recipe => ({ ...recipe, resultItemId: RESULTS[recipe.id][0], resultCount: RESULTS[recipe.id][1] }));

export function recipeFacility(recipe: Recipe): 'farm_plot' | 'campfire' | 'furnace' | undefined {
  if (recipe.id.startsWith('grow_')) return 'farm_plot';
  if (recipe.id.startsWith('smelt_')) return 'furnace';
  if (recipe.category === '食物加工') return 'campfire';
  return undefined;
}

export function craftingResult(recipeId: string): Item | undefined {
  const recipe = CRAFT_RECIPES.find(r => r.id === recipeId);
  return recipe ? makeItem(recipe.resultItemId, recipe.resultCount) : undefined;
}
