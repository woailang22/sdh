import type { Item } from '../types/game';
import { gatheringDescription } from './equipmentRules';

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
  copper_bar: { id: 'copper_bar', name: '精炼铜锭', category: 'material', icon: '🟠', rarity: 3, maxCount: 99, desc: '在营地熔炉加工铜矿，制造升级工具。', buyPrice: 120, sellPrice: 80 },
  pickaxe_stone: { id: 'pickaxe_stone', name: '开山镐', category: 'tool', icon: '⛏️', rarity: 1, maxCount: 1, desc: gatheringDescription('pickaxe_stone')!, buyPrice: 40, sellPrice: 20 },
  axe_stone: { id: 'axe_stone', name: '石斧', category: 'tool', icon: '🪓', rarity: 1, maxCount: 1, desc: gatheringDescription('axe_stone')!, buyPrice: 40, sellPrice: 20 },
  rod_basic: { id: 'rod_basic', name: '简易钓竿', category: 'tool', icon: '🎣', rarity: 1, maxCount: 1, desc: gatheringDescription('rod_basic')!, buyPrice: 35, sellPrice: 15 },
  crude_gun: { id: 'crude_gun', name: '土铳', category: 'weapon', icon: '🔫', rarity: 1, maxCount: 1, desc: '粗制火枪，使用通用弹药。', buyPrice: 100, sellPrice: 50, damage: 55 },
  armor_cloth: { id: 'armor_cloth', name: '粗布护甲', category: 'armor', icon: '🧥', rarity: 1, maxCount: 1, desc: '护盾上限增加25。', buyPrice: 60, sellPrice: 30, shield: 25 },
  dried_fish: { id: 'dried_fish', name: '烤肉干', category: 'food', icon: '🍖', rarity: 1, maxCount: 99, desc: '恢复35点饱食。', buyPrice: 12, sellPrice: 6, satiety: 35 },
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
  ammo_556: { id: 'ammo_556', name: '5.56mm步枪弹×30', category: 'material', icon: '🎯', rarity: 3, maxCount: 999, desc: 'M4/AK通用中口径，工厂警卫库产出。', buyPrice: 45, sellPrice: 30 },
  ammo_762: { id: 'ammo_762', name: '7.62mm穿甲弹×30', category: 'material', icon: '🎯', rarity: 4, maxCount: 999, desc: '高穿甲，SVD/重机枪用，掠夺者军火箱产出。', buyPrice: 80, sellPrice: 55 },
  ammo_9mm: { id: 'ammo_9mm', name: '9mm手枪弹×30', category: 'material', icon: '🎯', rarity: 2, maxCount: 999, desc: 'MP5/1911用，便利店/民居常见。', buyPrice: 25, sellPrice: 16 },
  ammo_shell: { id: 'ammo_shell', name: '12号霰弹×10', category: 'material', icon: '🎯', rarity: 3, maxCount: 200, desc: 'M870近战爆发，汽修铺/工厂产出。', buyPrice: 50, sellPrice: 34 },
  ammo_signal: { id: 'ammo_signal', name: '信号枪弹×10', category: 'material', icon: '🎯', rarity: 2, maxCount: 200, desc: '采石场/雪峰通用信号弹。', buyPrice: 20, sellPrice: 12 },
  wp_p1911: { id: 'wp_p1911', name: 'P1911手枪', category: 'weapon', icon: '🔫', rarity: 2, maxCount: 1, desc: '单发38，开荒自卫枪。', buyPrice: 300, sellPrice: 200, damage: 38 },
  wp_mp5: { id: 'wp_mp5', name: 'MP5冲锋枪', category: 'weapon', icon: '🔫', rarity: 3, maxCount: 1, desc: '单发52，近战扫射王。', buyPrice: 650, sellPrice: 430, damage: 52 },
  wp_akm: { id: 'wp_akm', name: 'AKM突击步枪', category: 'weapon', icon: '🔫', rarity: 4, maxCount: 1, desc: '单发98，高后座高伤害。', buyPrice: 950, sellPrice: 640, damage: 98 },
  wp_m4a1: { id: 'wp_m4a1', name: 'M4A1突击步枪', category: 'weapon', icon: '🔫', rarity: 4, maxCount: 1, desc: '单发110，稳定之王。', buyPrice: 1100, sellPrice: 730, damage: 110 },
  wp_m870: { id: 'wp_m870', name: 'M870霰弹枪', category: 'weapon', icon: '🔫', rarity: 4, maxCount: 1, desc: '单发140×碎片，贴脸秒精英。', buyPrice: 1000, sellPrice: 660, damage: 140 },
  wp_svd: { id: 'wp_svd', name: 'SVD狙击步枪', category: 'weapon', icon: '🔫', rarity: 5, maxCount: 1, desc: '单发220，红区点名。', buyPrice: 1800, sellPrice: 1200, damage: 220 },
  wp_plasma: { id: 'wp_plasma', name: '破界等离子步枪', category: 'weapon', icon: '🔫', rarity: 5, maxCount: 1, desc: '单发320，蓝图毕业枪。', buyPrice: 3000, sellPrice: 2000, damage: 320 },
  helmet_t2: { id: 'helmet_t2', name: '2级战术头盔', category: 'armor', icon: '🪖', rarity: 2, maxCount: 1, desc: '护盾+15，便利店/五金店产出。', buyPrice: 250, sellPrice: 170, shield: 15 },
  helmet_t3: { id: 'helmet_t3', name: '3级防弹头盔', category: 'armor', icon: '🪖', rarity: 3, maxCount: 1, desc: '护盾+30，工厂警卫库产出。', buyPrice: 450, sellPrice: 300, shield: 30 },
  helmet_t4: { id: 'helmet_t4', name: '4级重型头盔', category: 'armor', icon: '🪖', rarity: 4, maxCount: 1, desc: '护盾+50，掠夺者前哨产出。', buyPrice: 800, sellPrice: 530, shield: 50 },
  vest_t2: { id: 'vest_t2', name: '2级轻型背心', category: 'armor', icon: '🦺', rarity: 2, maxCount: 1, desc: '护盾+25，粗布护甲同级。', buyPrice: 300, sellPrice: 200, shield: 25 },
  vest_t3: { id: 'vest_t3', name: '3级防弹背心', category: 'armor', icon: '🦺', rarity: 3, maxCount: 1, desc: '护盾+50，军用标准。', buyPrice: 600, sellPrice: 400, shield: 50 },
  vest_t4: { id: 'vest_t4', name: '4级重型背心', category: 'armor', icon: '🦺', rarity: 4, maxCount: 1, desc: '护盾+80，减伤20%，红区门票。', buyPrice: 1100, sellPrice: 730, shield: 80 },
  vest_t5: { id: 'vest_t5', name: '5级钛合金背心', category: 'armor', icon: '🦺', rarity: 5, maxCount: 1, desc: '护盾+110，减伤25%，毕业甲。', buyPrice: 2000, sellPrice: 1350, shield: 110 },
  med_bandage: { id: 'med_bandage', name: '亚麻绷带', category: 'medical', icon: '🩹', rarity: 2, maxCount: 10, desc: '恢复30生命，工作台可造。', buyPrice: 30, sellPrice: 20, heal: 30 },
  med_medkit: { id: 'med_medkit', name: '纳米医疗包', category: 'medical', icon: '💉', rarity: 4, maxCount: 10, desc: '恢复60生命，红区必备。', buyPrice: 120, sellPrice: 95, heal: 60 },
  med_surgery: { id: 'med_surgery', name: '野战手术包', category: 'medical', icon: '💉', rarity: 5, maxCount: 5, desc: '恢复100生命，BOSS战救命。', buyPrice: 300, sellPrice: 220, heal: 100 },
  med_painkiller: { id: 'med_painkiller', name: '止痛药', category: 'medical', icon: '💊', rarity: 2, maxCount: 10, desc: '恢复5生命+20体力，跑图神器。', buyPrice: 40, sellPrice: 26, heal: 5 },
  med_bloodbag: { id: 'med_bloodbag', name: '血袋', category: 'medical', icon: '🩸', rarity: 4, maxCount: 5, desc: '恢复80生命，医疗箱稀有。', buyPrice: 200, sellPrice: 140, heal: 80 },
  throw_frag: { id: 'throw_frag', name: '破片手雷×2', category: 'tool', icon: '💣', rarity: 3, maxCount: 10, desc: '范围300伤害，清群怪。', buyPrice: 120, sellPrice: 80 },
  throw_smoke: { id: 'throw_smoke', name: '烟雾弹×2', category: 'tool', icon: '💨', rarity: 2, maxCount: 10, desc: '遮蔽视野，脱战/摸箱用。', buyPrice: 60, sellPrice: 40 },
  throw_flash: { id: 'throw_flash', name: '闪光弹×2', category: 'tool', icon: '✨', rarity: 3, maxCount: 10, desc: '致盲3秒，越级打精英。', buyPrice: 80, sellPrice: 54 },
  throw_molly: { id: 'throw_molly', name: '燃烧瓶×2', category: 'tool', icon: '🔥', rarity: 3, maxCount: 10, desc: '持续120灼烧，封路守门。', buyPrice: 90, sellPrice: 60 },
  pickaxe_copper: { id: 'pickaxe_copper', name: '铜镐', category: 'tool', icon: '⛏️', rarity: 3, maxCount: 1, desc: gatheringDescription('pickaxe_copper')!, buyPrice: 350, sellPrice: 230 },
  att_scope4x: { id: 'att_scope4x', name: '4倍战术瞄具', category: 'material', icon: '🔭', rarity: 4, maxCount: 5, desc: 'SVD/M4配件，工厂/掠夺者产出。', buyPrice: 400, sellPrice: 280 },
  att_suppressor: { id: 'att_suppressor', name: '消音器', category: 'material', icon: '🔇', rarity: 4, maxCount: 5, desc: '开火无声，摸金必备。', buyPrice: 450, sellPrice: 300 },
  att_extmag: { id: 'att_extmag', name: '扩容弹匣', category: 'material', icon: '🎒', rarity: 3, maxCount: 5, desc: '备弹+50%，持续火力。', buyPrice: 250, sellPrice: 170 },
  att_foregrip: { id: 'att_foregrip', name: '垂直握把', category: 'material', icon: '🔧', rarity: 3, maxCount: 5, desc: '后座-30%，AKM救星。', buyPrice: 220, sellPrice: 150 },
  key_red: { id: 'key_red', name: '红色房卡', category: 'material', icon: '🟥', rarity: 5, maxCount: 3, desc: '废弃工厂核心实验室门卡，开曼德尔砖。', buyPrice: 1200, sellPrice: 900 },
  key_blue: { id: 'key_blue', name: '蓝色房卡', category: 'material', icon: '🟦', rarity: 4, maxCount: 3, desc: '加油站办公室/渔港小屋门卡。', buyPrice: 600, sellPrice: 450 },
  collect_mandel: { id: 'collect_mandel', name: '曼德尔砖', category: 'material', icon: '🧱', rarity: 5, maxCount: 5, desc: '三角洲头号藏品，红区房卡房产出。', buyPrice: 2000, sellPrice: 1500 },
  collect_dogtag: { id: 'collect_dogtag', name: '阵亡者身份牌', category: 'material', icon: '🎖️', rarity: 4, maxCount: 20, desc: 'BOSS/精英掉落，黑市高价回收。', buyPrice: 500, sellPrice: 380 },
  collect_watch: { id: 'collect_watch', name: '金表', category: 'material', icon: '⌚', rarity: 4, maxCount: 10, desc: '居民区/餐馆搜刮，体面人的遗产。', buyPrice: 450, sellPrice: 340 },
  collect_circuit: { id: 'collect_circuit', name: '军用电路板', category: 'material', icon: '💾', rarity: 4, maxCount: 20, desc: '无人机/汽修/工厂产出，改枪材料。', buyPrice: 380, sellPrice: 280 },
};

export const WEAPON_DAMAGE: Record<string, number> = {
  rifle: 124, crude_gun: 55,
  wp_p1911: 38, wp_mp5: 52, wp_akm: 98, wp_m4a1: 110, wp_m870: 140, wp_svd: 220, wp_plasma: 320,
};
export const ARMOR_BONUS_TABLE: Record<string, number> = {
  armor_cloth: 25, armor_vest: 50, vest: 50,
  helmet_t2: 15, helmet_t3: 30, helmet_t4: 50,
  vest_t2: 25, vest_t3: 50, vest_t4: 80, vest_t5: 110,
};
export const MED_HEAL: Record<string, number> = {
  med_bandage: 30, bandage: 30, med_medkit: 60, medkit: 60, antidote: 10,
  med_surgery: 100, med_painkiller: 5, med_bloodbag: 80,
};
export const THROW_DAMAGE: Record<string, number> = {
  c4_explosive: 400, thermite_charge: 250,
  throw_frag: 300, throw_smoke: 0, throw_flash: 0, throw_molly: 120,
};
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
  dried_fish: { satiety: 35, heal: 0 },
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
  if (itemId.startsWith('ammo_')) return 'ammo';
  if (itemId.startsWith('wp_')) return 'weapon';
  if (itemId.startsWith('helmet_') || itemId.startsWith('vest_')) return 'armor';
  if (itemId.startsWith('med_')) return 'medical';
  if (itemId.startsWith('throw_')) return 'throwable';
  if (itemId.startsWith('att_') || itemId.startsWith('key_') || itemId.startsWith('collect_')) return 'valuable';
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
