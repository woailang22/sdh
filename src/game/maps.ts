import type {
  MapZoneId,
  RegionId,
  RegionDef,
  SubMapDef,
  InteractableEntity,
  MonsterEntity,
  BuildingEntity,
} from '../types/game';
import { buildCompoundWalls } from './compound';

export const REGIONS: RegionDef[] = [
  { id: 'camp', name: '恒界营地', icon: '🏕️', desc: '安全区：建造/制造大本营，不产野外物资' },
  { id: 'town', name: '废土城镇', icon: '🏙️', desc: '城市废墟：废铁/零件/弹药/枪械' },
  { id: 'mountain', name: '黑松山地', icon: '⛰️', desc: '山地密林：原木/石料/铁矿' },
  { id: 'marsh', name: '湿地裂隙', icon: '🌊', desc: '渔港沼泽与裂隙前线：食物/晶石/首领' },
];

// ---------- 小物件工厂 ----------
const I = (
  id: string, name: string, type: InteractableEntity['type'],
  x: number, y: number, prompt: string,
  lootTable?: { itemId: string; name: string; count: number }[],
  searchDuration = 1.6,
): InteractableEntity => ({
  id, name, type, x, y, radius: 2.8, prompt, available: true,
  searchDuration, lootTable,
});

const M = (
  id: string, name: string, x: number, y: number,
  hp: number, speed: number, damage: number,
): MonsterEntity => ({
  id, name, x, y, hp, maxHp: hp, speed, damage,
  state: 'roam', animTime: Math.random(), attackCooldown: 0,
  spawnX: x, spawnY: y, windup: 0,
});

const woodLoot = (n: number, name = '优质原木') => [{ itemId: 'wood', name, count: n }];
const stoneLoot = (n: number, name = '花岗石料') => [{ itemId: 'stone', name, count: n }];

/** 4区域 × 12图（旧ID已退役，不在此表） */
export const SUBMAPS: Record<string, SubMapDef> = {
  // ================= 恒界营地 =================
  camp_plaza: {
    id: 'camp_plaza', region: 'camp', name: '营地广场', theme: 'camp',
    desc: '开拓团主营：锚点核心/公共储物/防卫塔',
    risk: 'SAFE',
    gates: [
      { x: 28, y: 0, targetMap: 'camp_workshop', targetX: -28, targetY: 0, name: '东侧工坊通道', icon: '🛠️', desc: '前往工坊区' },
      { x: 0, y: 28, targetMap: 'camp_outskirts', targetX: 0, targetY: -28, name: '南门外圩', icon: '🌾', desc: '前往城墙外圩' },
    ],
    interactables: [
      I('plaza_workbench', '前哨军工制造台', 'workbench', 3.5, 1.5, '[E/F 打开军工制造]'),
    ],
    monsters: [],
    buildings: [
      { id: 'anchor_1', type: 'anchor_core', name: '开拓团 · 坍界锚点水晶核心', x: 0.0, y: 0.0, hp: 6000, maxHp: 6000, level: 3, ownerName: '恒界开拓团' },
      { id: 'camp_turret_1', type: 'turret', name: '营地电弧防卫塔', x: 4.5, y: -4.5, hp: 1200, maxHp: 1200, level: 2, fireCooldown: 0, ownerName: '恒界开拓团' },
      { id: 'camp_storage_1', type: 'storage_box', name: '前哨公共储物箱', x: -3.0, y: 0.5, hp: 800, maxHp: 800, level: 2, ownerName: '恒界开拓团' },
    ],
    deco: [
      { x: 0, y: 0, w: 11, h: 9, type: 'foundation' },
    ],
  },
  camp_workshop: {
    id: 'camp_workshop', region: 'camp', name: '工坊区', theme: 'plaza',
    desc: '制造/维修/仓储：第二台工作台与材料库',
    risk: 'SAFE',
    gates: [
      { x: -28, y: 0, targetMap: 'camp_plaza', targetX: 28, targetY: 0, name: '西侧广场通道', icon: '🏕️', desc: '返回营地广场' },
      { x: 30, y: 0, targetMap: 'town_gas', targetX: -30, targetY: 0, name: '东岭省道哨卡', icon: '🛣️', desc: '出征废土城镇 · 加油站' },
    ],
    interactables: [
      I('ws_workbench', '工坊区制造台', 'workbench', -4, 2, '[E/F 打开制造]'),
      I('ws_crate', '工坊材料箱', 'box', 8, -6, '[E/F 领取开工料]', [
        { itemId: 'scrap', name: '开工废铁', count: 10 },
        { itemId: 'wood', name: '开工原木', count: 8 },
      ], 1.2),
    ],
    monsters: [],
    buildings: [
      // 教学 U 形：北边 7 段 + 东西各 2 段，南边开敞（故意不封，教玩家补南墙）
      { id: 'ws_demo_n_-3', type: 'stone_wall', name: '工坊示范条石墙', x: -3, y: -1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ew' },
      { id: 'ws_demo_n_-2', type: 'stone_wall', name: '工坊示范条石墙', x: -2, y: -1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ew' },
      { id: 'ws_demo_n_-1', type: 'stone_wall', name: '工坊示范条石墙', x: -1, y: -1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ew' },
      { id: 'ws_demo_n_0', type: 'stone_wall', name: '工坊示范条石墙', x: 0, y: -1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ew' },
      { id: 'ws_demo_n_1', type: 'stone_wall', name: '工坊示范条石墙', x: 1, y: -1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ew' },
      { id: 'ws_demo_n_2', type: 'stone_wall', name: '工坊示范条石墙', x: 2, y: -1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ew' },
      { id: 'ws_demo_n_3', type: 'stone_wall', name: '工坊示范条石墙', x: 3, y: -1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ew' },
      { id: 'ws_demo_w_0', type: 'stone_wall', name: '工坊示范条石墙', x: -3, y: 0, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ns' },
      { id: 'ws_demo_w_1', type: 'stone_wall', name: '工坊示范条石墙', x: -3, y: 1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ns' },
      { id: 'ws_demo_e_0', type: 'stone_wall', name: '工坊示范条石墙', x: 3, y: 0, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ns' },
      { id: 'ws_demo_e_1', type: 'stone_wall', name: '工坊示范条石墙', x: 3, y: 1, hp: 600, maxHp: 600, level: 1, ownerName: '恒界开拓团', facing: 'ns' },
      { id: 'ws_storage', type: 'storage_box', name: '工坊材料仓', x: 0, y: 1, hp: 800, maxHp: 800, level: 2, ownerName: '恒界开拓团' },
      { id: 'ws_turret', type: 'turret', name: '工坊防卫塔', x: -5, y: -3, hp: 1200, maxHp: 1200, level: 2, fireCooldown: 0, ownerName: '恒界开拓团' },
      {
        id: 'ws_parts_bin', type: 'storage_box', name: '工坊零件箱', x: 1, y: 1, hp: 400, maxHp: 400, level: 1, ownerName: '恒界开拓团',
        storedLoot: [
          { name: '特种机械轴承', count: 4, icon: '🔧' },
          { name: '精炼优质废铁', count: 12, icon: '⚙️' },
        ],
      },
    ],
    deco: [
      { x: 0, y: 1, w: 9, h: 6, type: 'foundation' },
    ],
  },
  camp_outskirts: {
    id: 'camp_outskirts', region: 'camp', name: '城墙外圩', theme: 'field',
    desc: '农圩与演习场：示范领地，学造墙/安全门',
    risk: 'SAFE',
    gates: [
      { x: 0, y: -28, targetMap: 'camp_plaza', targetX: 0, targetY: 28, name: '北门进营', icon: '🏕️', desc: '返回营地广场' },
      { x: 0, y: 30, targetMap: 'marsh_docks', targetX: 0, targetY: -30, name: '南岭渡口', icon: '🎣', desc: '前往湿地渔港' },
      { x: -30, y: 0, targetMap: 'mtn_logging', targetX: 30, targetY: 0, name: '北山隘口', icon: '🌲', desc: '前往黑松伐木场' },
    ],
    interactables: [
      I('outskirts_well', '圩田水井', 'box', -10, 12, '[E/F 打水]', [
        { itemId: 'water', name: '高纯度饮用水', count: 4 },
      ], 1.2),
    ],
    monsters: [],
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'demo_yard', cx: 18, cy: -4, w: 4, h: 2,
        wallType: 'iron_wall', wallName: '战术重合金铁墙', ownerName: '夜刃 · 狂野猎手',
        doorSide: 'S', doorType: 'safe_door', doorName: '行者【夜刃】领地防爆安全门 [5000HP 可突袭]',
        doorExtra: {
          hp: 5000, maxHp: 5000, level: 2, isOpen: false, isLocked: true,
          ownerId: 'demo_player_nightblade', ownerName: '夜刃 · 狂野猎手',
          mapId: 'camp_outskirts', material: 'iron',
          storedLoot: [
            { name: '高聚合爆破C4装药', count: 4, icon: '💣' },
            { name: '坍界高纯晶核', count: 15, icon: '💎' },
            { name: '废土高级信用点', count: 2800, icon: '💰' },
          ],
        },
      }),
      { id: 'demo_chest', type: 'storage_box', name: '夜刃的私人战备保险箱', x: 18.0, y: -4.0, hp: 600, maxHp: 600, level: 1, ownerName: '夜刃 · 狂野猎手' },
    ],
    deco: [
      { x: -12, y: -10, w: 10, h: 8, type: 'farm' },
      { x: 8, y: 12, w: 8, h: 6, type: 'farm' },
      { x: 18, y: -4, w: 6, h: 4, type: 'foundation' },
    ],
  },

  // ================= 废土城镇 =================
  town_gas: {
    id: 'town_gas', region: 'town', name: '77号加油站', theme: 'urban',
    desc: '省道加油站：便利店/油罐/弹药，城镇入口',
    risk: 'LOW',
    gates: [
      { x: -30, y: 0, targetMap: 'camp_workshop', targetX: 30, targetY: 0, name: '西侧营地检查站', icon: '🏕️', desc: '返回工坊区' },
      { x: 30, y: 0, targetMap: 'town_street', targetX: -30, targetY: 0, name: '东进商业街', icon: '🏙️', desc: '前往商业街' },
      { x: 10, y: 28, targetMap: 'town_ruins', targetX: -10, targetY: -28, name: '南下居民区', icon: '🧱', desc: '前往废墟居民区' },
    ],
    interactables: [
      I('gas_van', '77号站长运载货车', 'van', 4, -10, '[E/F 破拆搜刮站长货车]', [
        { itemId: 'fuel', name: '重载高纯度柴油罐', count: 4 },
        { itemId: 'c4_explosive', name: '高爆C4塑胶炸药', count: 2 },
        { itemId: 'scrap', name: '精炼车身钢板', count: 40 },
      ], 2.2),
      I('gas_shelves', '便利店破损货架', 'shelves', 8, -14, '[E/F 搜刮便利店货架]', [
        { itemId: 'food', name: '战术能量肉排', count: 12 },
        { itemId: 'water', name: '高纯度饮用水', count: 8 },
        { itemId: 'credits', name: '散落钞票', count: 650 },
      ], 1.5),
      I('gas_med', '加油站应急医疗箱', 'med_cabinet', 12, -12, '[E/F 搜刮医疗物资]', [
        { itemId: 'medkit', name: '纳米急救箱', count: 3 },
        { itemId: 'antidote', name: '抗酸蚀解毒剂', count: 2 },
        { itemId: 'vest', name: '军用防弹背心', count: 1 },
      ], 1.6),
      I('gas_safe', '便利店收银保险箱', 'box', 10, -16, '[E/F 解码搜刮保险箱]', [
        { itemId: 'credits', name: '废土高级信用凭证', count: 1500 },
        { itemId: 'shard', name: '高纯度紫晶石', count: 5 },
      ], 2.5),
      I('gas_tanker', '翻倒油罐车', 'car', 15, 4, '[E/F 搜刮燃油板材]', [
        { itemId: 'fuel', name: '高纯度燃油', count: 6 },
        { itemId: 'scrap', name: '厚重防爆钢板', count: 35 },
      ], 2.0),
      I('gas_ammo', '路障军用弹药箱', 'ammo_crate', -16, -4, '[E/F 破译搜刮弹药箱]', [
        { itemId: 'ammo', name: '7.62mm 步枪穿甲弹药包', count: 60 },
        { itemId: 'c4_explosive', name: '高爆C4炸药', count: 2 },
        { itemId: 'rifle', name: '战术突击步枪', count: 1 },
      ], 1.8),
    ],
    monsters: [
      M('tg1', '变异公路漫游暴徒', 6, -4, 450, 2.0, 26),
      M('tg2', '辐射畸变狂暴猎犬', -8, -6, 320, 2.7, 22),
    ],
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'gas_office', cx: -6, cy: -13, w: 4, h: 2,
        wallType: 'iron_wall', wallName: '加油站办公室残墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '办公室电控门',
      }),
      {
        id: 'gas_office_box', type: 'storage_box', name: '办公室保险储物箱', x: -6, y: -13, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '战术能量合剂', count: 6, icon: '🥩' },
          { name: '精炼优质废铁', count: 15, icon: '⚙️' },
          { name: '废土信用凭证', count: 800, icon: '💰' },
        ],
      },
    ],
    deco: [
      { x: -6, y: -13, w: 6, h: 4, type: 'foundation' },
      { x: 8, y: -13, w: 10, h: 7, type: 'foundation' },
      { x: -14, y: 6, w: 7, h: 5, type: 'crater' },
    ],
  },
  town_street: {
    id: 'town_street', region: 'town', name: '商业街', theme: 'urban',
    desc: '战前商铺一条街：食品/五金/汽修，怪多货也多',
    risk: 'LOW',
    gates: [
      { x: -30, y: 0, targetMap: 'town_gas', targetX: 30, targetY: 0, name: '西返加油站', icon: '⛽', desc: '返回77号加油站' },
      { x: 0, y: 30, targetMap: 'town_ruins', targetX: 0, targetY: -30, name: '南穿居民区', icon: '🧱', desc: '前往废墟居民区' },
    ],
    interactables: [
      I('st_hardware', '五金工具店', 'shelves', -10, -10, '[E/F 搜刮五金店]', [
        { itemId: 'part', name: '五金紧固件', count: 6 },
        { itemId: 'scrap', name: '货架角钢', count: 25 },
      ], 1.6),
      I('st_garage', '汽修铺', 'box', 6, -12, '[E/F 搜刮汽修铺]', [
        { itemId: 'part', name: '汽修配件', count: 5 },
        { itemId: 'battery', name: '待修电瓶', count: 2 },
      ], 1.8),
      I('st_diner', '街角餐馆后厨', 'shelves', 12, 6, '[E/F 搜刮餐馆]', [
        { itemId: 'food', name: '风干肉排', count: 10 },
        { itemId: 'water', name: '桶装水', count: 6 },
      ], 1.5),
      I('st_sedan', '撞毁出租车', 'car', -2, 10, '[E/F 破拆出租车]', [
        { itemId: 'scrap', name: '出租车废铁', count: 30 },
        { itemId: 'part', name: '计价器芯片', count: 2 },
      ], 1.8),
      I('st_bus', '侧翻公交车', 'van', -18, 4, '[E/F 搜刮公交车]', [
        { itemId: 'scrap', name: '公交车架钢', count: 45 },
        { itemId: 'food', name: '乘客遗落干粮', count: 8 },
        { itemId: 'pack_canvas', name: '帆布背包', count: 1 },
      ], 2.2),
      I('st_pharmacy', '药房', 'med_cabinet', 16, -6, '[E/F 搜刮药房]', [
        { itemId: 'medkit', name: '急救包', count: 2 },
        { itemId: 'bandage', name: '绷带卷', count: 4 },
      ], 1.8),
    ],
    monsters: [
      M('st1', '变异公路漫游暴徒', -6, 0, 450, 2.0, 26),
      M('st2', '蚀体·恶瘴魑精英', 10, -2, 550, 1.8, 32),
      M('st3', '辐射畸变狂暴猎犬', 0, 14, 320, 2.7, 22),
    ],
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'st_hw', cx: -10, cy: -8, w: 4, h: 2,
        wallType: 'stone_wall', wallName: '五金店残墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '五金店卷帘门',
        doorExtra: { isOpen: true, isLocked: false },
      }),
      { id: 'st_hw_box', type: 'storage_box', name: '五金店里间零件箱', x: -10, y: -8, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹' },
      ...buildCompoundWalls({
        idPrefix: 'st_dn', cx: 12, cy: 6, w: 4, h: 2,
        wallType: 'wood_wall', wallName: '餐馆木板墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '餐馆后门',
        doorExtra: { isOpen: true, isLocked: false },
      }),
      { id: 'st_dn_box', type: 'storage_box', name: '餐馆里间食储箱', x: 12, y: 6, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹' },
    ],
    deco: [
      { x: -10, y: -8, w: 6, h: 4, type: 'foundation' },
      { x: 12, y: 6, w: 6, h: 4, type: 'foundation' },
      { x: 0, y: 18, w: 8, h: 6, type: 'rubble' },
    ],
  },
  town_ruins: {
    id: 'town_ruins', region: 'town', name: '废墟居民区', theme: 'ruins',
    desc: '掠夺者盘踞的塌楼区：高耐久安全门可突袭',
    risk: 'HIGH',
    gates: [
      { x: -10, y: -28, targetMap: 'town_gas', targetX: 10, targetY: 28, name: '北返加油站', icon: '⛽', desc: '返回77号加油站' },
      { x: 0, y: -28, targetMap: 'town_street', targetX: 0, targetY: 30, name: '北返商业街', icon: '🏙️', desc: '返回商业街' },
      { x: 30, y: 0, targetMap: 'marsh_rift', targetX: -30, targetY: 0, name: '省道断桥裂缝口', icon: '⚠️', desc: '深入裂隙前线（红区）' },
      { x: 20, y: -28, targetMap: 'mtn_deep', targetX: 8, targetY: 28, name: '翻山小道', icon: '⛰️', desc: '翻山前往黑松深林' },
    ],
    interactables: [
      I('ru_truck', '废弃重卡车头', 'car', -6, 2, '[E/F 搜寻重卡备件]', [
        { itemId: 'scrap', name: '重载合金钢梁', count: 45 },
        { itemId: 'part', name: '重型变速箱齿轮', count: 4 },
      ], 1.8),
      I('ru_dead_tree', '断裂行道树', 'tree', -12, 10, '[E/F 砍伐断木]', woodLoot(30, '干枯行道木'), 1.6),
      I('ru_wreck', '连环追尾车堆', 'car', 0, 12, '[E/F 破拆事故车]', [
        { itemId: 'scrap', name: '事故车废铁', count: 35 },
        { itemId: 'part', name: '车载电子元件', count: 3 },
      ], 1.8),
      I('ru_basement', '塌楼地下室', 'box', -14, -14, '[E/F 搜刮地下室]', [
        { itemId: 'credits', name: '发霉旧钞', count: 800 },
        { itemId: 'food', name: '封存罐头', count: 6 },
      ], 2.0),
    ],
    monsters: [
      M('ru1', '变异公路漫游暴徒', -8, 4, 450, 2.0, 26),
      M('ru2', '蚀体·恶瘴魑精英', 12, -8, 550, 1.8, 32),
      M('ru3', '变异公路漫游暴徒', 6, 14, 450, 2.0, 26),
    ],
    buildings: [
      // 塌楼断墙：故意残缺 U 形（北+东西，无南，半血讲故事，不判闭合）
      { id: 'ru_cw_1', type: 'stone_wall', name: '塌楼断墙', x: -15, y: -15, hp: 250, maxHp: 600, level: 1, ownerName: '废土遗迹', facing: 'ew' },
      { id: 'ru_cw_2', type: 'stone_wall', name: '塌楼断墙', x: -14, y: -15, hp: 250, maxHp: 600, level: 1, ownerName: '废土遗迹', facing: 'ew' },
      { id: 'ru_cw_3', type: 'stone_wall', name: '塌楼断墙', x: -13, y: -15, hp: 250, maxHp: 600, level: 1, ownerName: '废土遗迹', facing: 'ew' },
      { id: 'ru_cw_4', type: 'stone_wall', name: '塌楼断墙', x: -15, y: -14, hp: 250, maxHp: 600, level: 1, ownerName: '废土遗迹', facing: 'ns' },
      { id: 'ru_cw_5', type: 'stone_wall', name: '塌楼断墙', x: -13, y: -14, hp: 200, maxHp: 600, level: 1, ownerName: '废土遗迹', facing: 'ns' },
      {
        id: 'ru_cache_box', type: 'storage_box', name: '居民逃难物资箱', x: 0, y: 18, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '封存罐头', count: 6, icon: '🥩' },
          { name: '发霉旧钞', count: 800, icon: '💰' },
          { name: '汽车废铁', count: 12, icon: '⚙️' },
        ],
      },
      ...buildCompoundWalls({
        idPrefix: 'rebel_post', cx: 22, cy: -6, w: 4, h: 2,
        wallType: 'iron_wall', wallName: '重装合金墙', ownerName: '掠夺者前哨',
        doorSide: 'S', doorType: 'safe_door', doorName: '裂隙铁血掠夺者 · 重装防爆安全门 [4200HP 可突袭]',
        doorExtra: {
          hp: 4200, maxHp: 6000, level: 2, isOpen: false, isLocked: true,
          ownerId: 'npc_raider_boss', ownerName: '裂隙铁血掠夺者联盟', mapId: 'town_ruins', material: 'iron',
          storedLoot: [
            { name: '坍界暗物质晶核', count: 20, icon: '💎' },
            { name: '军用钛合金复合装甲板', count: 10, icon: '🛡️' },
            { name: '破界级等离子步枪蓝图', count: 1, icon: '📜' },
            { name: '废土高级信用点', count: 3200, icon: '💰' },
          ],
        },
      }),
      { id: 'rebel_chest', type: 'storage_box', name: '掠夺者军火大储物箱', x: 22, y: -6, hp: 500, maxHp: 500, level: 1, ownerName: '掠夺者前哨' },
    ],
    deco: [
      { x: -14, y: -14, w: 6, h: 5, type: 'foundation' },
      { x: 22, y: -6, w: 6, h: 4, type: 'foundation' },
      { x: 0, y: 0, w: 9, h: 7, type: 'crater' },
      { x: -4, y: 18, w: 7, h: 5, type: 'rubble' },
    ],
  },

  // ================= 黑松山地 =================
  mtn_logging: {
    id: 'mtn_logging', region: 'mountain', name: '黑松伐木场', theme: 'forest',
    desc: '伐木场：原木主产区，兼有运材车可拆',
    risk: 'LOW',
    gates: [
      { x: 30, y: 0, targetMap: 'camp_outskirts', targetX: -30, targetY: 0, name: '南下外圩', icon: '🌾', desc: '返回城墙外圩' },
      { x: 0, y: -28, targetMap: 'mtn_quarry', targetX: 0, targetY: 28, name: '北上采石场', icon: '🪨', desc: '前往采石场' },
      { x: 28, y: 8, targetMap: 'mtn_deep', targetX: -28, targetY: -8, name: '林间小道', icon: '🌲', desc: '深入黑松深林' },
    ],
    interactables: [
      I('log_tree_1', '高耸红松古木', 'tree', -6, -8, '[E/F 砍伐红松]', woodLoot(30, '优质红松木'), 1.6),
      I('log_tree_2', '伐木场云杉', 'tree', -2, 14, '[E/F 砍伐云杉]', woodLoot(30, '优质云杉木'), 1.6),
      I('log_tree_3', '林间枯立木', 'tree', 16, 2, '[E/F 砍伐枯木]', woodLoot(30, '干燥枯木'), 1.6),
      I('log_truck', '侧翻运材卡车', 'car', 0, -16, '[E/F 破拆运材车]', [
        { itemId: 'scrap', name: '车架废钢', count: 30 },
        { itemId: 'wood', name: '散落原木', count: 20 },
        { itemId: 'part', name: '传动轴齿轮', count: 3 },
      ], 2.0),
      I('log_toolshed', '伐木工具棚', 'box', -14, 4, '[E/F 搜刮工具棚]', [
        { itemId: 'part', name: '油锯链条', count: 4 },
        { itemId: 'scrap', name: '棚架角铁', count: 20 },
      ], 1.6),
    ],
    monsters: [
      M('lg1', '密林暗影潜行兽', 6, -14, 350, 2.4, 24),
      M('lg2', '蚀化幼体', 14, 12, 260, 2.3, 16),
    ],
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'lg_cabin', cx: -15, cy: -3, w: 4, h: 2,
        wallType: 'wood_wall', wallName: '伐木工棚木墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '工棚木门',
        doorExtra: { isOpen: true, isLocked: false },
      }),
      {
        id: 'lg_cabin_box', type: 'storage_box', name: '伐木工储物箱', x: -15, y: -3, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '优质云杉木', count: 12, icon: '🪵' },
          { name: '油锯链条', count: 3, icon: '🔧' },
        ],
      },
    ],
    deco: [
      { x: -15, y: -3, w: 6, h: 4, type: 'foundation' },
    ],
  },
  mtn_quarry: {
    id: 'mtn_quarry', region: 'mountain', name: '北岭采石场', theme: 'quarry',
    desc: '露天矿场：石料/铁矿主产区，大型机械可拆',
    risk: 'LOW',
    gates: [
      { x: 0, y: 28, targetMap: 'mtn_logging', targetX: 0, targetY: -28, name: '南下伐木场', icon: '🌲', desc: '返回黑松伐木场' },
      { x: 28, y: 0, targetMap: 'mtn_deep', targetX: -28, targetY: 0, name: '东进深林', icon: '🌲', desc: '深入黑松深林' },
    ],
    interactables: [
      I('q_stone_1', '大型露天花岗岩矿床', 'boulder', 12, -10, '[E/F 镐击开采花岗岩]', [
        { itemId: 'stone', name: '重装花岗石块', count: 40 },
        { itemId: 'iron_ore', name: '伴生铁矿', count: 6 },
      ], 1.8),
      I('q_stone_2', '次生采石场岩壁', 'boulder', 4, 16, '[E/F 开采石料]', stoneLoot(40), 1.8),
      I('q_dozer', '重型采石推土机残骸', 'car', 8, 6, '[E/F 破拆工程机械]', [
        { itemId: 'scrap', name: '耐磨特种锰钢板', count: 50 },
        { itemId: 'part', name: '液压千斤顶活塞', count: 5 },
      ], 2.2),
      I('q_powder', '采石炸药库', 'ammo_crate', -12, 8, '[E/F 搜刮炸药库]', [
        { itemId: 'c4_explosive', name: '采石乳化炸药', count: 3 },
        { itemId: 'ammo', name: '信号枪弹', count: 20 },
      ], 1.8),
    ],
    monsters: [
      M('q1', '密林蚀化狂暴巨熊', -10, -4, 680, 1.9, 36),
      M('q2', '蚀化幼体', 0, -16, 260, 2.3, 16),
    ],
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'q_office', cx: -8, cy: -1, w: 4, h: 2,
        wallType: 'stone_wall', wallName: '矿场值班室残墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '值班室铁门',
        doorExtra: { isOpen: false, isLocked: false },
      }),
      {
        id: 'q_office_box', type: 'storage_box', name: '矿场工具柜', x: -8, y: -1, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '液压千斤顶活塞', count: 3, icon: '🔧' },
          { name: '耐磨特种锰钢板', count: 20, icon: '⚙️' },
        ],
      },
    ],
    deco: [
      { x: -8, y: -1, w: 6, h: 4, type: 'foundation' },
      { x: 12, y: -10, w: 8, h: 6, type: 'rockery' },
    ],
  },
  mtn_deep: {
    id: 'mtn_deep', region: 'mountain', name: '黑松深林', theme: 'forest',
    desc: '佣兵前哨盘踞：密封安全门可突袭，巨熊出没',
    risk: 'HIGH',
    gates: [
      { x: -28, y: 0, targetMap: 'mtn_quarry', targetX: 28, targetY: 0, name: '西返采石场', icon: '🪨', desc: '返回北岭采石场' },
      { x: -28, y: -8, targetMap: 'mtn_logging', targetX: 28, targetY: 8, name: '林间小道', icon: '🌲', desc: '返回黑松伐木场' },
      { x: 8, y: 28, targetMap: 'town_ruins', targetX: 20, targetY: -28, name: '翻山小道', icon: '🧱', desc: '翻山前往废墟居民区' },
    ],
    interactables: [
      I('deep_tree', '千年铁杉王', 'tree', 6, -14, '[E/F 砍伐铁杉]', woodLoot(40, '铁杉硬木'), 1.8),
      I('deep_ammo', '深林佣兵战术军火箱', 'ammo_crate', -14, -12, '[E/F 搜刮高爆物资]', [
        { itemId: 'c4_explosive', name: '高爆C4炸药', count: 3 },
        { itemId: 'thermite_charge', name: '微型铝热熔切弹', count: 4 },
        { itemId: 'vest', name: '军用防弹背心', count: 1 },
      ], 1.8),
      I('deep_herb', '佣兵草药包', 'box', 14, 10, '[E/F 搜刮草药]', [
        { itemId: 'bandage', name: '草药绷带', count: 4 },
        { itemId: 'food', name: '山菌肉干', count: 6 },
      ], 1.6),
    ],
    monsters: [
      M('dp1', '密林蚀化狂暴巨熊', -10, -4, 680, 1.9, 36),
      M('dp2', '密林暗影潜行兽', 6, -14, 350, 2.4, 24),
      M('dp3', '蚀化幼体', 14, 12, 260, 2.3, 16),
    ],
    buildings: [
      {
        id: 'deep_cache_box', type: 'storage_box', name: '佣兵前哨补给箱', x: -16, y: 8, hp: 500, maxHp: 500, level: 1, ownerName: '深林佣兵兵团',
        storedLoot: [
          { name: '步枪弹药', count: 4, icon: '🎯' },
          { name: '军用战术急救针剂', count: 3, icon: '💉' },
        ],
      },
      ...buildCompoundWalls({
        idPrefix: 'forest_post', cx: -16, cy: 8, w: 4, h: 2,
        wallType: 'stone_wall', wallName: '重条石防线', ownerName: '佣兵哨卡',
        doorSide: 'S', doorType: 'safe_door', doorName: '深林佣兵前哨密封安全门 [5500HP 可突袭]',
        doorExtra: {
          hp: 5500, maxHp: 5500, level: 2, isOpen: false, isLocked: true,
          ownerId: 'npc_forest_syndicate', ownerName: '深林佣兵兵团', mapId: 'mtn_deep', material: 'iron',
          storedLoot: [
            { name: '军用战术急救针剂', count: 12, icon: '💉' },
            { name: '坍界高纯晶石', count: 16, icon: '💎' },
            { name: '高聚合爆破炸药', count: 5, icon: '🧨' },
          ],
        },
      }),
    ],
    deco: [
      { x: -16, y: 8, w: 6, h: 4, type: 'foundation' },
    ],
  },

  // ================= 湿地裂隙 =================
  marsh_docks: {
    id: 'marsh_docks', region: 'marsh', name: '翠湖渔港', theme: 'lake',
    desc: '钓场与补给：食物主产区',
    risk: 'LOW',
    gates: [
      { x: 0, y: -30, targetMap: 'camp_outskirts', targetX: 0, targetY: 30, name: '北岭渡口归营', icon: '🏕️', desc: '返回城墙外圩' },
      { x: 28, y: 0, targetMap: 'marsh_bog', targetX: -28, targetY: 0, name: '东侧沼泽小径', icon: '🌊', desc: '前往沼泽' },
    ],
    interactables: [
      I('dock_1', '一号深水钓台', 'pond', 0, 6, '[E/F 抛竿垂钓]', [
        { itemId: 'fish', name: '变异黄颡鱼', count: 2 },
        { itemId: 'fish2', name: '裂隙荧光金鳟', count: 1 },
      ]),
      I('dock_2', '二号浅滩钓台', 'pond', -6, 12, '[E/F 抛竿垂钓]', [
        { itemId: 'fish', name: '异变青鱼', count: 2 },
        { itemId: 'box', name: '水下锈蚀铁盒', count: 1 },
      ]),
      I('dock_chest', '渔港栈道补给木箱', 'box', 4, 2, '[E/F 搜索补给箱]', [
        { itemId: 'medkit', name: '防水医疗包', count: 2 },
        { itemId: 'ammo', name: '防水步枪弹药', count: 40 },
      ], 1.4),
      I('dock_boat', '搁浅快艇残骸', 'car', -12, 16, '[E/F 破拆快艇残骸]', [
        { itemId: 'scrap', name: '轻量船用铝板', count: 35 },
        { itemId: 'battery', name: '高耐腐蚀电池', count: 2 },
      ], 2.0),
      I('dock_poplar', '湖畔白杨', 'tree', 10, -6, '[E/F 砍伐白杨]', woodLoot(30, '白杨木'), 1.6),
      I('dock_rock', '滩涂岩', 'boulder', -4, -14, '[E/F 敲取滩涂岩]', stoneLoot(25, '滩涂碎石'), 1.8),
    ],
    monsters: [
      M('dk1', '水泽蚀化妖', -4, 8, 380, 2.0, 20),
      M('dk2', '蚀体·泥沼潜伏者', 8, 14, 440, 1.6, 24),
    ],
    buildings: [
      // 渔民小屋：木墙 + 鱼获储物箱
      { id: 'dock_hut_w1', type: 'wood_wall', name: '渔民小屋木墙', x: 12, y: -8, hp: 350, maxHp: 350, level: 1, ownerName: '废土遗迹', facing: 'ns' },
      { id: 'dock_hut_w2', type: 'wood_wall', name: '渔民小屋木墙', x: 12, y: -4, hp: 350, maxHp: 350, level: 1, ownerName: '废土遗迹', facing: 'ns' },
      {
        id: 'dock_hut_box', type: 'storage_box', name: '渔民鱼获箱', x: 14, y: -6, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '异变青鱼', count: 4, icon: '🐟' },
          { name: '防水医疗包', count: 1, icon: '💉' },
        ],
      },
    ],
  },
  marsh_bog: {
    id: 'marsh_bog', region: 'marsh', name: '泥沼泽', theme: 'marsh',
    desc: '芦苇沼泽：药草/潜伏者，小心脚下',
    risk: 'HIGH',
    gates: [
      { x: -28, y: 0, targetMap: 'marsh_docks', targetX: 28, targetY: 0, name: '西返渔港', icon: '🎣', desc: '返回翠湖渔港' },
      { x: 0, y: 28, targetMap: 'marsh_rift', targetX: 0, targetY: -28, name: '南下裂隙前线', icon: '⚠️', desc: '深入裂隙前线（红区）' },
    ],
    interactables: [
      I('bog_reed', '芦苇荡', 'box', -8, 6, '[E/F 采集芦苇]', [
        { itemId: 'wood', name: '芦苇纤维', count: 12 },
        { itemId: 'food', name: '沼泽莲藕', count: 6 },
      ], 1.4),
      I('bog_wreck', '陷落沼泽卡车', 'car', 10, -8, '[E/F 打捞卡车]', [
        { itemId: 'scrap', name: '锈蚀车架', count: 40 },
        { itemId: 'part', name: '防水电机', count: 4 },
      ], 2.0),
      I('bog_cache', '猎人干粮窖', 'box', 4, 14, '[E/F 搜刮干粮窖]', [
        { itemId: 'food', name: '熏鱼干', count: 8 },
        { itemId: 'bandage', name: '防水绷带', count: 3 },
      ], 1.6),
    ],
    monsters: [
      M('bg1', '蚀体·泥沼潜伏者', -4, 0, 440, 1.6, 24),
      M('bg2', '蚀体·泥沼潜伏者', 8, 10, 440, 1.6, 24),
      M('bg3', '水泽蚀化妖', 0, -12, 380, 2.0, 20),
    ],
    buildings: [
      // 高脚屋残柱 + 猎人储物
      { id: 'bog_post', type: 'wood_wall', name: '高脚屋残柱', x: -8, y: 2, hp: 350, maxHp: 350, level: 1, ownerName: '废土遗迹' },
      {
        id: 'bog_hunter_box', type: 'storage_box', name: '猎人防水箱', x: -8, y: 4, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '防水绷带', count: 3, icon: '🩹' },
          { name: '熏鱼干', count: 6, icon: '🥩' },
        ],
      },
    ],
  },
  marsh_rift: {
    id: 'marsh_rift', region: 'marsh', name: '裂隙前线', theme: 'rift',
    desc: '红区：晶石/首领/遗落宝箱，富贵险中求',
    risk: 'EXTREME',
    gates: [
      { x: 0, y: -28, targetMap: 'marsh_bog', targetX: 0, targetY: 28, name: '北撤沼泽', icon: '🌊', desc: '撤回泥沼泽' },
      { x: -30, y: 0, targetMap: 'town_ruins', targetX: 30, targetY: 0, name: '省道断桥', icon: '🧱', desc: '撤往废墟居民区' },
      { x: -20, y: 20, targetMap: 'camp_plaza', targetX: 0, targetY: 0, name: '空间锚定跃迁', icon: '🏕️', desc: '紧急跃迁回营地广场' },
    ],
    interactables: [
      I('rift_core', '坍界裂隙异象核心', 'crystal', 0, 0, '[E/F 提取异象原晶]', [
        { itemId: 'shard', name: '高纯度坍界紫晶', count: 6 },
        { itemId: 'plasma', name: '虚空高能等离子聚合体', count: 4 },
      ], 2.5),
      I('rift_spire', '虚空晶簇矿脉', 'crystal', -12, -10, '[E/F 采掘紫晶簇]', [
        { itemId: 'shard', name: '紫晶原矿', count: 4 },
      ], 1.8),
      I('rift_cache', '遗落先锋钛合金密封宝箱', 'box', 12, 12, '[E/F 解锁高阶宝箱]', [
        { itemId: 'blueprint', name: '破界级等离子步枪蓝图', count: 1 },
        { itemId: 'dark_core', name: '坍界暗物质晶核', count: 12 },
        { itemId: 'credits', name: '高级信用凭证', count: 2500 },
        { itemId: 'rifle', name: '战术突击步枪', count: 1 },
        { itemId: 'vest', name: '军用防弹背心', count: 1 },
      ], 2.2),
    ],
    monsters: [
      M('rf1', '深渊霸主·恶瘴巨兽 (领主BOSS)', 0, -6, 1600, 2.3, 45),
      M('rf2', '多足蚀化潜行兽', -14, 8, 480, 2.5, 28),
      M('rf3', '多足蚀化潜行兽', 14, -8, 480, 2.5, 28),
      M('rf4', '虚空撕裂幼体', -8, -16, 320, 2.6, 20),
    ],
    buildings: [
      // 先锋队最后的掩体（半血）
      { id: 'rift_cover', type: 'iron_wall', name: '先锋队掩体残墙', x: 6, y: 6, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋' },
    ],
  },
};

export const MAP_IDS = Object.keys(SUBMAPS) as MapZoneId[];

export const regionOf = (id: MapZoneId): RegionId => SUBMAPS[id]?.region ?? 'camp';

// ---------- 三角洲式稀有度（1白2绿3蓝4紫5金） ----------
export const RARITY: Record<string, number> = {
  wood: 1, stone: 1, scrap: 1, box: 1,
  food: 2, fish: 2, fish2: 2, water: 2, bandage: 2, credits: 2,
  ammo: 3, antidote: 3, part: 3, battery: 3, iron_ore: 3, fuel: 3, pack_canvas: 3,
  c4_explosive: 4, thermite_charge: 4, medkit: 4, shard: 4, pack_tactical: 4,
  rifle: 5, vest: 5, blueprint: 5, dark_core: 5, plasma: 5,
};

export const RARITY_COLOR: Record<number, string> = {
  1: '#94a3b8', 2: '#4ade80', 3: '#38bdf8', 4: '#c084fc', 5: '#fbbf24',
};

export const ITEM_ICON: Record<string, string> = {
  wood: '🪵', stone: '🪨', scrap: '⚙️', part: '🔧', battery: '🔋', iron_ore: '⛏️',
  ammo: '🎯', c4_explosive: '💣', thermite_charge: '🔥',
  medkit: '💉', bandage: '🩹', antidote: '💊',
  food: '🥩', fish: '🐟', fish2: '🐟', water: '💧', fuel: '🛢️',
  credits: '💰', shard: '💎', plasma: '🟣', blueprint: '📜', dark_core: '🕳️',
  rifle: '🔫', vest: '🦺', box: '📦', pack_canvas: '🎒', pack_tactical: '🧳',
};

export type LootResource = 'wood' | 'stone' | 'scrap' | 'parts' | 'food' | 'ammo' | 'c4' | 'medical' | 'weapon' | 'armor' | 'credits' | 'shard' | 'blueprint' | 'pack';

// 掉落物归类（引擎与App共用，保持一致）
export function lootResourceOf(itemId: string): LootResource {
  if (itemId === 'wood') return 'wood';
  if (itemId === 'stone') return 'stone';
  if (itemId === 'part' || itemId === 'battery' || itemId === 'iron_ore') return 'parts';
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

// 采集技能：累计经验 → 等级（星露谷式）
export function skillLevel(xp: number): number {
  let lvl = 0;
  while (xp >= 15 * (lvl + 1) * (lvl + 2)) lvl++;
  return lvl;
}
export function skillNext(xp: number): { lvl: number; cur: number; need: number } {
  const lvl = skillLevel(xp);
  const base = lvl === 0 ? 0 : 15 * lvl * (lvl + 1);
  const need = 15 * (lvl + 1) * (lvl + 2);
  return { lvl, cur: xp - base, need: need - base };
}
export const skillYieldMult = (lvl: number) => 1 + lvl * 0.08;

export const mapsOfRegion = (r: RegionId): SubMapDef[] =>
  MAP_IDS.map((id) => SUBMAPS[id]).filter((m) => m.region === r);

export const displayName = (id: MapZoneId): string => {
  const m = SUBMAPS[id];
  if (!m) return id;
  const r = REGIONS.find((x) => x.id === m.region);
  return `${r?.name ?? ''} · ${m.name}`;
};
