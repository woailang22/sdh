# 物品大扩展（星露谷 + 三角洲） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前约27种物品ID扩展到约90种，引入星露谷式作物/品质/加工/烹饪/钓鱼与三角洲式弹药/枪械/护甲/医疗/投掷/配件/藏品，每个新物品至少接入1个现有消耗系统（吃/喝/治/装/打/造/卖/藏），杜绝纯摆设。

**Architecture:** 新增 `src/game/items.ts` 作为唯一物品注册表（ITEM_DEFS + 数值表 + 工厂函数），新增 `src/game/collection.ts` 藏品图鉴（稀有度/套装/加成），扩展 `CraftCost.extra` 让作物/鱼/蜂蜜成为工作台真材料，`src/game/maps.ts` 的 RARITY/ITEM_ICON/lootResourceOf 改为代理到注册表保持兼容，`src/App.tsx` 的 applyLoot/handleUseItem/ARMOR_BONUS/handleCraftSuccess 按新资源分支扩展，工作台/黑市/地图掉落同步上新物品。

**Tech Stack:** TypeScript + React 19 + Vite + Vitest 3（`npm run test` = `vitest run`），无新依赖。

---

## File Structure

- Create: `src/game/items.ts` — 唯一真相源。导出 `ItemDef`、`ITEM_DEFS: Record<string, ItemDef>`（约90条）、`WEAPON_DAMAGE`、`ARMOR_BONUS_TABLE`、`MED_HEAL`、`THROW_DAMAGE`、`FOOD_VALUE`、`getItemDef()`、`makeItem()`、`qualitySellPrice()`、`lootResourceOfNew()`。其他文件禁止手写物品数值，只查此表。
- Create: `src/game/items.test.ts` — 注册表全量测试（唯一性/图标非空/稀有度1-5/价格/数值表/工厂函数/品质加价）。
- Modify: `src/game/maps.ts:961-1000` — `RARITY`、`RARITY_COLOR`、`ITEM_ICON`、`LootResource`、`lootResourceOf()` 扩展并代理到 `items.ts`，保持旧 import 路径可用。
- Modify: `src/game/maps.ts:206-953` — 约10处 `lootTable` 植入新物品（渔港/沼泽/农圩/工厂/裂隙/深渊/采石场）。
- Modify: `src/App.tsx:156,500-575,1091-1115,1176-1230` — `ARMOR_BONUS` 合并新表、`applyLoot` 新增 `throwable/valuable/seed` 分支、`handleUseItem` 按 `FOOD_VALUE/MED_HEAL` 恢复、`handleBuyMarketItem/handleSellMarketItem` 支持新商品。
- Modify: `src/components/WorkbenchModal.tsx:37-146` — `RECIPES` 从12追加到20（果酱桶/烹饪锅/铜镐/复装弹药/甲片/投掷/手术包/星果酒）。
- Modify: `src/components/MarketModal.tsx:23-74` — `items` 从5追加到13（种子包/铜矿/4倍镜/红色房卡/曼德尔砖/手术包/破片手雷/星果酒）。
- Modify: `src/components/InventoryModal.tsx:18-39` — `EQUIP_META` bonus 文案覆盖新枪/甲/工具名。
- Modify: `src/components/LootPanel.tsx:1-55` — 无逻辑改，仅验证新 `RARITY/ITEM_ICON` 下颜色/图标正常（回归测试覆盖）。
- Modify: `src/game/IsometricEngine.ts:2320` — `lootResourceOf` 调用保持兼容（无需改代码，测试验证）。
- Create: `src/game/collection.ts` — 藏品图鉴真相源。导出 `CollectTier`（'memorial' 纪念/白，'fine' 精品/蓝，'heirloom' 传家/紫，'mythic' 神话/金）、`COLLECT_DEFS`、`COLLECT_SETS`（3套装+加成）、`collectTierOf()`、`setProgress()`、`setBonusCredits()`。藏品唯一例外：不进吃/造，只进卖/藏/展。
- Create: `src/game/collection.test.ts` — 图鉴测试（套装进度/加成/稀有度全覆盖）。
- Modify: `src/components/WorkbenchModal.tsx:5-11` — `CraftCost` 加可选 `extra?: { itemId: string; count: number }[]`（作物/鱼/蜂蜜真材料），`canAfford` 与 `costText` 同步支持。
- Modify: `src/App.tsx:1256-1395` — `handleCraftSuccess` 加背包扣 `extra` 材料 + 8种新配方发货（含种植/烹饪/升级链）。

## 用途矩阵（Rev B 复核现有功能后锁定：每行 = 消耗系统，全部复用已存在的吃/造/卖/装/打）

| 新物品组 | 直接吃/喝/治（handleUseItem） | 工作台制造（WorkbenchModal+handleCraftSuccess） | 装备/战斗（装备栏/reserveAmmo/突袭） | 卖/任务（MarketModal/quests） |
|---|---|---|---|---|
| 种子 seed_*×5 | ❌（不可直食，防误吃） | ✅ 种植配方：seed→crop（例：玉米种×2+水感废铁×2→玉米×4，1200ms） | ❌ | ✅ 黑市买种子/卖多余 |
| 作物 crop_*×6 | ✅ FOOD_VALUE直接吃（星果60饱+20血） | ✅ 烹饪/加工真材料（玉米+鲈鱼→鱼汤；蓝莓→果酱；星果→星果酒） | ❌ | ✅ 高价卖，品质加价1.25/1.5/2x |
| 矿石 ore_*×4 | ❌ | ✅ 工具升级真材料（铜镐：铜矿×8；金镐：金矿×8，效率+120%/+200%） | ✅ 铜镐装备tool栏采集加成 | ✅ 卖 |
| 新鱼 fish_*×6 | ✅ 直接吃（传说100饱+50血） | ✅ 烹饪真材料（鲈鱼→鱼汤；鲶鱼→能量棒） | ❌（钓鱼技能经验沿用fish通道） | ✅ 稀有鱼高价卖+图鉴炫耀 |
| 加工 jam/pickle/cheese/wine/honey | ✅ 直接吃（星果酒40饱+30血） | ✅ 二次加工链（蓝莓→果酱→礼包；星果→酒） | ❌ | ✅ 加工品售价>原料（酒2250>星果750） |
| 烹饪 cook_*×3 | ✅ 直接吃（鱼汤60饱+20血最强口粮） | ✅ 由原料合成（工作台烹饪锅分类） | ✅ 进红区前必备口粮 | ✅ 卖 |
| 弹药 ammo_*×5 | ❌ | ✅ 复装配方（废铁+零件→备弹） | ✅ 全部进reserveAmmo，口径差异化数量（762给30/霰弹给10） | ✅ 买/卖 |
| 枪械 wp_*×7 | ❌ | ✅ 升级链（P1911+扩容匣→MP5；M4+瞄具→SVD，需extra配件） | ✅ weapon栏，WEAPON_DAMAGE 38→320梯度 | ✅ 任务rifle线兼容 |
| 护甲 helmet/vest×7 | ❌ | ✅ 打造（2级背心；4级背心需金矿感零件） | ✅ armor栏，ARMOR_BONUS 15→110 | ✅ 高阶甲黑市卖 |
| 医疗 med_*×5 | ✅ MED_HEAL（绷带30/血袋80/手术包100，止痛药+20体力） | ✅ 合成（手术包：绷带×2+零件×1） | ✅ BOSS战救命 | ✅ 黑市买卖 |
| 投掷 throw_*×4 | ❌ | ✅ 制造（破片：废铁×12+零件×2） | ✅ THROW_DAMAGE突袭/清怪（破片300/燃烧120持续） | ✅ 卖 |
| 配件 att_*×4 | ❌ | ✅ 枪械升级真材料（瞄具/消音器/弹匣/握把各对应一条升级） | ✅ 升级后枪伤害+（M4 110→SVD 220） | ✅ 高价卖 |
| 房卡 key_*×2 | ❌ | ❌（不开合成，防复杂度爆炸） | ✅ 红/蓝房 loot 解锁：持有钥匙开对应宝箱（裂隙/工厂），开后钥匙消耗1 | ✅ 稀有房卡黑市卖900 |
| 藏品 collect_*×4 | ❌（唯一例外：不可吃用，防误操作） | ❌ | ❌ | ✅ 图鉴+套装加成+黑市高价（曼德尔1500，集齐套装+2000信用点，见Task 10） |

**藏品收集欲设计（三角洲曼德尔砖式）：** 四档稀有度色：纪念白 `#94a3b8`（电路板）/精品蓝 `#38bdf8`（金表/身份牌）/传家紫 `#c084fc`（曼德尔砖）/神话金 `#fbbf24`（传说之鱼+红房卡房限定曼德尔·鎏金）。三套装：①废土体面人（金表+电路板×3→+500点）②先锋遗落（身份牌×3+蓝房卡→+1200点）③曼德尔传奇（曼德尔砖+红房卡+传说之鱼→+3000点+称号“曼德尔收藏家”）。掉落绑定BOSS/精英/红房（非商店无限刷），LootPanel金框+Inventory图鉴页展示已得/未得。

**接口锁定（后续任务必须原样使用，禁止改名）：**
```typescript
export type ItemQuality = 0 | 1 | 2 | 3;
export interface ItemDef {
  id: string; name: string;
  category: 'weapon' | 'tool' | 'medical' | 'food' | 'material' | 'armor' | 'pack';
  icon: string; rarity: 1 | 2 | 3 | 4 | 5; maxCount: number; desc: string;
  buyPrice: number; sellPrice: number;
  heal?: number; satiety?: number; damage?: number; shield?: number;
}
export function getItemDef(id: string): ItemDef;
export function makeItem(id: string, count: number): import('../types/game').Item;
export function qualitySellPrice(id: string, quality: ItemQuality): number;
export const WEAPON_DAMAGE: Record<string, number>;
export const ARMOR_BONUS_TABLE: Record<string, number>;
export const MED_HEAL: Record<string, number>;
export const THROW_DAMAGE: Record<string, number>;
export const FOOD_VALUE: Record<string, { satiety: number; heal: number }>;
export const SEED_GROW: Record<string, { cropId: string; outCount: number }>;
export const COOK_SOURCE: Record<string, { materials: { itemId: string; count: number }[] }>;
```

---

### Task 1: 中央注册表骨架 + 旧物品全量迁移

**Files:**
- Create: `src/game/items.ts`
- Create: `src/game/items.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/items.test.ts`，覆盖旧27种ID与基础helpers：

```typescript
import { describe, expect, it } from 'vitest';
import { ITEM_DEFS, getItemDef, makeItem, qualitySellPrice, WEAPON_DAMAGE, ARMOR_BONUS_TABLE, MED_HEAL } from './items';

const LEGACY_IDS = ['wood','stone','scrap','part','battery','iron_ore','fuel','food','fish','fish2','water','ammo','c4_explosive','thermite_charge','medkit','bandage','antidote','credits','shard','plasma','dark_core','blueprint','rifle','vest','box','pack_canvas','pack_tactical'];

describe('items registry skeleton', () => {
  it('contains all legacy ids with valid shape', () => {
    for (const id of LEGACY_IDS) {
      const d = ITEM_DEFS[id];
      expect(d, `${id} missing`).toBeDefined();
      expect(d.id).toBe(id);
      expect(d.name.length).toBeGreaterThan(1);
      expect(d.icon.length).toBeGreaterThan(0);
      expect(d.rarity).toBeGreaterThanOrEqual(1);
      expect(d.rarity).toBeLessThanOrEqual(5);
      expect(d.maxCount).toBeGreaterThanOrEqual(1);
      expect(d.buyPrice).toBeGreaterThanOrEqual(0);
      expect(d.sellPrice).toBeGreaterThanOrEqual(0);
    }
  });
  it('getItemDef throws on unknown id', () => {
    expect(() => getItemDef('no_such_item_xyz')).toThrow();
  });
  it('makeItem builds hotbar Item with count clamp', () => {
    const it1 = makeItem('bandage', 3);
    expect(it1.category).toBe('medical');
    expect(it1.count).toBe(3);
    expect(it1.maxCount).toBe(10);
    const it2 = makeItem('bandage', 999);
    expect(it2.count).toBe(10);
  });
  it('qualitySellPrice scales 0/1/2/3 = 1x/1.25x/1.5x/2x', () => {
    const base = getItemDef('fish').sellPrice;
    expect(qualitySellPrice('fish', 0)).toBe(base);
    expect(qualitySellPrice('fish', 1)).toBe(Math.floor(base * 1.25));
    expect(qualitySellPrice('fish', 2)).toBe(Math.floor(base * 1.5));
    expect(qualitySellPrice('fish', 3)).toBe(base * 2);
  });
  it('weapon/armor/med tables cover legacy gear', () => {
    expect(WEAPON_DAMAGE['rifle']).toBe(124);
    expect(ARMOR_BONUS_TABLE['armor_vest']).toBe(50);
    expect(ARMOR_BONUS_TABLE['armor_cloth']).toBe(25);
    expect(MED_HEAL['med_bandage']).toBe(30);
    expect(MED_HEAL['med_medkit']).toBe(60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -v`
Expected: FAIL with `Error: Cannot find module './items'`（文件尚不存在，27条用例全部报错）。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/items.ts`，只含旧物品 + 接口锁定中的全部导出（新物品在 Task 2-6 追加，本任务不加新物品）：

```typescript
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
};

export const WEAPON_DAMAGE: Record<string, number> = { rifle: 124, crude_gun: 55 };
export const ARMOR_BONUS_TABLE: Record<string, number> = { armor_cloth: 25, armor_vest: 50, vest: 50 };
export const MED_HEAL: Record<string, number> = { med_bandage: 30, bandage: 30, med_medkit: 60, medkit: 60, antidote: 10 };
export const THROW_DAMAGE: Record<string, number> = { c4_explosive: 400, thermite_charge: 250 };
export const FOOD_VALUE: Record<string, { satiety: number; heal: number }> = {
  food: { satiety: 35, heal: 0 },
  fish: { satiety: 30, heal: 5 },
  fish2: { satiety: 40, heal: 10 },
  water: { satiety: 15, heal: 0 },
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/items.test.ts -v`
Expected: PASS，5 passed（5条用例全部绿）。

- [ ] **Step 5: Commit**

```bash
git add src/game/items.ts src/game/items.test.ts
git commit -m "feat(items): add central item registry with legacy defs"
```

---

### Task 2: 星露谷作物/种子/矿物线

**Files:**
- Modify: `src/game/items.ts`
- Modify: `src/game/items.test.ts`
- Test: `src/game/items.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/game/items.test.ts` 末尾追加：

```typescript
describe('stardew crops/seeds/ores', () => {
  it('has 5 seeds, 6 crops, 4 ores with correct categories', async () => {
    const { ITEM_DEFS } = await import('./items');
    for (const id of ['seed_parsnip','seed_potato','seed_corn','seed_pumpkin','seed_starfruit']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('material');
    }
    expect(ITEM_DEFS['seed_parsnip'].rarity).toBe(1);
    expect(ITEM_DEFS['seed_potato'].rarity).toBe(1);
    expect(ITEM_DEFS['seed_corn'].rarity).toBe(2);
    expect(ITEM_DEFS['seed_pumpkin'].rarity).toBe(2);
    expect(ITEM_DEFS['seed_starfruit'].rarity).toBe(4);
    for (const id of ['crop_parsnip','crop_potato','crop_corn','crop_pumpkin','crop_starfruit','crop_blueberry']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('food');
    }
    for (const id of ['ore_copper','ore_silver','ore_gold','ore_iridium']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('material');
    }
    expect(ITEM_DEFS['ore_iridium'].rarity).toBe(5);
    expect(ITEM_DEFS['crop_starfruit'].sellPrice).toBeGreaterThan(ITEM_DEFS['crop_parsnip'].sellPrice);
  });
  it('seed loot maps to seed resource, crops to food, ores to parts', async () => {
    const { lootResourceOfNew } = await import('./items');
    expect(lootResourceOfNew('seed_parsnip')).toBe('seed');
    expect(lootResourceOfNew('crop_corn')).toBe('food');
    expect(lootResourceOfNew('ore_copper')).toBe('parts');
    expect(lootResourceOfNew('ore_iridium')).toBe('parts');
  });
  it('every seed has a workbench grow path (usefulness lock, no decoration seeds)', async () => {
    const { SEED_GROW, ITEM_DEFS } = await import('./items');
    for (const seed of ['seed_parsnip','seed_potato','seed_corn','seed_pumpkin','seed_starfruit']) {
      const g = SEED_GROW[seed];
      expect(g, `${seed} grow missing`).toBeDefined();
      expect(ITEM_DEFS[g.cropId]).toBeDefined();
      expect(ITEM_DEFS[g.cropId].category).toBe('food');
      expect(g.outCount).toBeGreaterThanOrEqual(2);
    }
    expect(SEED_GROW['seed_starfruit'].cropId).toBe('crop_starfruit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -t "stardew crops" -v`
Expected: FAIL with `expected undefined to be defined`（seed_parsnip 缺失）。

- [ ] **Step 3: Write minimal implementation**

在 `src/game/items.ts` 的 `ITEM_DEFS` 末尾（`pack_tactical` 行之后、闭合 `};` 之前）插入：

```typescript
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
```

并在 `FOOD_VALUE` 中追加6条：

```typescript
  crop_parsnip: { satiety: 20, heal: 2 },
  crop_potato: { satiety: 25, heal: 3 },
  crop_corn: { satiety: 30, heal: 5 },
  crop_pumpkin: { satiety: 40, heal: 10 },
  crop_starfruit: { satiety: 60, heal: 20 },
  crop_blueberry: { satiety: 35, heal: 8 },
```

并在 `lootResourceOfNew` 顶部追加三行（放在 `if (itemId === 'wood')` 之前）：

```typescript
  if (itemId.startsWith('seed_')) return 'seed';
  if (itemId.startsWith('fish_') || itemId.startsWith('crop_') || itemId.startsWith('cook_') || itemId.startsWith('jam_') || itemId.startsWith('wine_') || itemId.startsWith('pickle_') || itemId.startsWith('cheese_') || itemId.startsWith('honey_')) return 'food';
  if (itemId.startsWith('ore_')) return 'parts';
```

并在 `THROW_DAMAGE` 定义之后追加种植对照表（工作台 Task 8 的种植配方唯一依据，禁止另起数值）：

```typescript
export const SEED_GROW: Record<string, { cropId: string; outCount: number }> = {
  seed_parsnip: { cropId: 'crop_parsnip', outCount: 4 },
  seed_potato: { cropId: 'crop_potato', outCount: 4 },
  seed_corn: { cropId: 'crop_corn', outCount: 4 },
  seed_pumpkin: { cropId: 'crop_pumpkin', outCount: 3 },
  seed_starfruit: { cropId: 'crop_starfruit', outCount: 2 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/items.test.ts -t "stardew crops" -v`
Expected: PASS，2 passed。

- [ ] **Step 5: Commit**

```bash
git add src/game/items.ts src/game/items.test.ts
git commit -m "feat(items): add stardew seeds/crops/ores with food values"
```

---

### Task 3: 星露谷鱼/加工/烹饪线

**Files:**
- Modify: `src/game/items.ts`
- Modify: `src/game/items.test.ts`
- Test: `src/game/items.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/game/items.test.ts` 末尾追加：

```typescript
describe('stardew fish/artisan/cooking', () => {
  it('has 6 new fish, 5 artisan, 3 cooked with food values', async () => {
    const { ITEM_DEFS, FOOD_VALUE, lootResourceOfNew } = await import('./items');
    for (const id of ['fish_carp','fish_bass','fish_eel','fish_catfish','fish_legend','fish_crimson']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('food');
      expect(FOOD_VALUE[id]).toBeDefined();
    }
    for (const id of ['jam_berry','pickle_veg','cheese_goat','wine_starfruit','honey_wild']) {
      expect(ITEM_DEFS[id]).toBeDefined();
    }
    for (const id of ['cook_stirfry','cook_fishsoup','cook_energybar']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(FOOD_VALUE[id].satiety).toBeGreaterThanOrEqual(35);
    }
    expect(ITEM_DEFS['fish_legend'].rarity).toBe(5);
    expect(ITEM_DEFS['wine_starfruit'].sellPrice).toBeGreaterThan(ITEM_DEFS['crop_starfruit'].sellPrice);
    expect(lootResourceOfNew('fish_legend')).toBe('food');
    expect(lootResourceOfNew('wine_starfruit')).toBe('food');
  });
  it('every cooked/processed item has a material source (no decoration food)', async () => {
    const { COOK_SOURCE, ITEM_DEFS } = await import('./items');
    for (const id of ['cook_stirfry','cook_fishsoup','cook_energybar','jam_berry','pickle_veg','cheese_goat','wine_starfruit']) {
      const s = COOK_SOURCE[id];
      expect(s, `${id} source missing`).toBeDefined();
      expect(s.materials.length).toBeGreaterThanOrEqual(1);
      for (const m of s.materials) expect(ITEM_DEFS[m.itemId], `${id} needs ${m.itemId}`).toBeDefined();
    }
    expect(COOK_SOURCE['cook_fishsoup'].materials.some((m) => m.itemId === 'fish_bass')).toBe(true);
    expect(COOK_SOURCE['wine_starfruit'].materials.some((m) => m.itemId === 'crop_starfruit')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -t "stardew fish" -v`
Expected: FAIL with `expected undefined to be defined`（fish_carp 缺失）。

- [ ] **Step 3: Write minimal implementation**

在 `src/game/items.ts` 的 `ITEM_DEFS` 中 `ore_iridium` 行之后插入：

```typescript
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
```

并在 `FOOD_VALUE` 追加14条（与上面 satiety/heal 一一对应）：

```typescript
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
```

并在 `SEED_GROW` 定义之后追加加工来源表（Task 8 工作台 extra 配方的唯一依据）：

```typescript
export const COOK_SOURCE: Record<string, { materials: { itemId: string; count: number }[] }> = {
  cook_stirfry: { materials: [{ itemId: 'crop_corn', count: 2 }, { itemId: 'crop_parsnip', count: 2 }] },
  cook_fishsoup: { materials: [{ itemId: 'fish_bass', count: 2 }, { itemId: 'water', count: 2 }] },
  cook_energybar: { materials: [{ itemId: 'honey_wild', count: 2 }, { itemId: 'fish_catfish', count: 1 }] },
  jam_berry: { materials: [{ itemId: 'crop_blueberry', count: 3 }] },
  pickle_veg: { materials: [{ itemId: 'crop_pumpkin', count: 2 }] },
  cheese_goat: { materials: [{ itemId: 'crop_corn', count: 2 }, { itemId: 'honey_wild', count: 1 }] },
  wine_starfruit: { materials: [{ itemId: 'crop_starfruit', count: 3 }] },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/items.test.ts -t "stardew fish" -v`
Expected: PASS，1 passed。

- [ ] **Step 5: Commit**

```bash
git add src/game/items.ts src/game/items.test.ts
git commit -m "feat(items): add stardew fish/artisan/cooking lines"
```

---

### Task 4: 三角洲弹药 + 枪械分级

**Files:**
- Modify: `src/game/items.ts`
- Modify: `src/game/items.test.ts`
- Test: `src/game/items.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/game/items.test.ts` 末尾追加：

```typescript
describe('delta ammo and guns', () => {
  it('has 5 ammo calibers and 7 guns with damage ladder', async () => {
    const { ITEM_DEFS, WEAPON_DAMAGE, lootResourceOfNew } = await import('./items');
    for (const id of ['ammo_556','ammo_762','ammo_9mm','ammo_shell','ammo_signal']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(lootResourceOfNew(id)).toBe('ammo');
    }
    expect(WEAPON_DAMAGE['wp_p1911']).toBe(38);
    expect(WEAPON_DAMAGE['wp_mp5']).toBe(52);
    expect(WEAPON_DAMAGE['wp_akm']).toBe(98);
    expect(WEAPON_DAMAGE['wp_m4a1']).toBe(110);
    expect(WEAPON_DAMAGE['wp_m870']).toBe(140);
    expect(WEAPON_DAMAGE['wp_svd']).toBe(220);
    expect(WEAPON_DAMAGE['wp_plasma']).toBe(320);
    expect(ITEM_DEFS['wp_svd'].rarity).toBe(5);
    expect(ITEM_DEFS['wp_p1911'].rarity).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -t "delta ammo" -v`
Expected: FAIL with `expected undefined to be defined`（ammo_556 缺失）。

- [ ] **Step 3: Write minimal implementation**

在 `src/game/items.ts` 的 `ITEM_DEFS` 中 `cook_energybar` 行之后插入：

```typescript
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
```

将 `WEAPON_DAMAGE` 整块替换为：

```typescript
export const WEAPON_DAMAGE: Record<string, number> = {
  rifle: 124, crude_gun: 55,
  wp_p1911: 38, wp_mp5: 52, wp_akm: 98, wp_m4a1: 110, wp_m870: 140, wp_svd: 220, wp_plasma: 320,
};
```

在 `lootResourceOfNew` 的 `if (itemId === 'ammo')` 行之后追加：

```typescript
  if (itemId.startsWith('ammo_')) return 'ammo';
  if (itemId.startsWith('wp_')) return 'weapon';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/items.test.ts -t "delta ammo" -v`
Expected: PASS，1 passed。

- [ ] **Step 5: Commit**

```bash
git add src/game/items.ts src/game/items.test.ts
git commit -m "feat(items): add delta ammo calibers and gun ladder"
```

---

### Task 5: 三角洲护甲/医疗/投掷分级

**Files:**
- Modify: `src/game/items.ts`
- Modify: `src/game/items.test.ts`
- Test: `src/game/items.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/game/items.test.ts` 末尾追加：

```typescript
describe('delta armor/medical/throwable', () => {
  it('armor bonus ladder, med heal ladder, throw damage ladder', async () => {
    const { ITEM_DEFS, ARMOR_BONUS_TABLE, MED_HEAL, THROW_DAMAGE, lootResourceOfNew } = await import('./items');
    expect(ARMOR_BONUS_TABLE['helmet_t2']).toBe(15);
    expect(ARMOR_BONUS_TABLE['vest_t4']).toBe(80);
    expect(ARMOR_BONUS_TABLE['vest_t5']).toBe(110);
    expect(MED_HEAL['med_surgery']).toBe(100);
    expect(MED_HEAL['med_bloodbag']).toBe(80);
    expect(MED_HEAL['med_painkiller']).toBe(5);
    expect(THROW_DAMAGE['throw_frag']).toBe(300);
    expect(THROW_DAMAGE['throw_molly']).toBe(120);
    expect(ITEM_DEFS['helmet_t4']).toBeDefined();
    expect(ITEM_DEFS['helmet_t4'].category).toBe('armor');
    expect(ITEM_DEFS['med_surgery'].category).toBe('medical');
    expect(ITEM_DEFS['throw_frag'].category).toBe('tool');
    expect(lootResourceOfNew('vest_t4')).toBe('armor');
    expect(lootResourceOfNew('med_surgery')).toBe('medical');
    expect(lootResourceOfNew('throw_frag')).toBe('throwable');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -t "delta armor" -v`
Expected: FAIL with `expected undefined to be 15`（helmet_t2 缺失）。

- [ ] **Step 3: Write minimal implementation**

在 `src/game/items.ts` 的 `ITEM_DEFS` 中 `wp_plasma` 行之后插入：

```typescript
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
```

将三张数值表替换为：

```typescript
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
```

在 `lootResourceOfNew` 中 `if (itemId.startsWith('wp_'))` 行之后追加：

```typescript
  if (itemId.startsWith('helmet_') || itemId.startsWith('vest_')) return 'armor';
  if (itemId.startsWith('med_')) return 'medical';
  if (itemId.startsWith('throw_')) return 'throwable';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/items.test.ts -t "delta armor" -v`
Expected: PASS，1 passed。

- [ ] **Step 5: Commit**

```bash
git add src/game/items.ts src/game/items.test.ts
git commit -m "feat(items): add delta armor/medical/throwable ladders"
```

---

### Task 6: 三角洲配件/房卡/藏品高价值线

**Files:**
- Modify: `src/game/items.ts`
- Modify: `src/game/items.test.ts`
- Test: `src/game/items.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/game/items.test.ts` 末尾追加：

```typescript
describe('delta attachments/keys/valuables', () => {
  it('has 4 attachments, 2 keycards, 4 valuables mapped to valuable', async () => {
    const { ITEM_DEFS, lootResourceOfNew, qualitySellPrice } = await import('./items');
    for (const id of ['att_scope4x','att_suppressor','att_extmag','att_foregrip']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('material');
      expect(lootResourceOfNew(id)).toBe('valuable');
    }
    expect(ITEM_DEFS['key_red']).toBeDefined();
    expect(ITEM_DEFS['key_red'].rarity).toBe(5);
    expect(lootResourceOfNew('key_red')).toBe('valuable');
    expect(lootResourceOfNew('collect_mandel')).toBe('valuable');
    expect(ITEM_DEFS['collect_mandel'].sellPrice).toBe(1500);
    expect(qualitySellPrice('collect_mandel', 0)).toBe(1500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -t "delta attachments" -v`
Expected: FAIL with `expected undefined to be defined`（att_scope4x 缺失）。

- [ ] **Step 3: Write minimal implementation**

在 `src/game/items.ts` 的 `ITEM_DEFS` 中 `throw_molly` 行之后插入：

```typescript
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
```

在 `lootResourceOfNew` 中 `if (itemId.startsWith('throw_'))` 行之后追加：

```typescript
  if (itemId.startsWith('att_') || itemId.startsWith('key_') || itemId.startsWith('collect_')) return 'valuable';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/items.test.ts -v`
Expected: PASS，全文件约10 passed（Task1-6累计）。

- [ ] **Step 5: Commit**

```bash
git add src/game/items.ts src/game/items.test.ts
git commit -m "feat(items): add delta attachments/keys/valuables"
```

---

### Task 7: maps.ts 接线（稀有度/图标/归类 + 地图掉落植入）

**Files:**
- Modify: `src/game/maps.ts:961-1000`
- Modify: `src/game/maps.ts:206-953`（掉落表）
- Test: `src/game/maps.test.ts`（追加回归）

- [ ] **Step 1: Write the failing test**

在 `src/game/maps.test.ts` 末尾追加：

```typescript
describe('item expansion wiring', () => {
  it('RARITY/ITEM_ICON cover new ids and lootResourceOf delegates', async () => {
    const { RARITY, ITEM_ICON, lootResourceOf } = await import('./maps');
    for (const id of ['seed_corn','crop_starfruit','ore_iridium','fish_legend','wine_starfruit','ammo_762','wp_svd','vest_t5','med_surgery','throw_frag','att_scope4x','key_red','collect_mandel']) {
      expect(RARITY[id], `${id} rarity`).toBeDefined();
      expect(ITEM_ICON[id], `${id} icon`).toBeDefined();
    }
    expect(RARITY['ore_iridium']).toBe(5);
    expect(RARITY['fish_legend']).toBe(5);
    expect(RARITY['wp_p1911']).toBe(2);
    expect(lootResourceOf('seed_parsnip')).toBe('seed');
    expect(lootResourceOf('ammo_762')).toBe('ammo');
    expect(lootResourceOf('wp_akm')).toBe('weapon');
    expect(lootResourceOf('throw_frag')).toBe('throwable');
    expect(lootResourceOf('collect_mandel')).toBe('valuable');
  });
  it('at least 8 interactables drop new items', async () => {
    const { SUBMAPS } = await import('./maps');
    const all = Object.values(SUBMAPS).flatMap((m) => m.interactables).flatMap((e) => e.lootTable ?? []);
    const ids = new Set(all.map((l) => l.itemId));
    for (const id of ['seed_corn','ore_copper','fish_bass','ammo_556','wp_p1911','vest_t2','med_surgery','collect_circuit']) {
      expect(ids.has(id), `${id} not placed`).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/maps.test.ts -t "item expansion wiring" -v`
Expected: FAIL with `expected undefined to be defined`（RARITY[seed_corn] 缺失）。

- [ ] **Step 3: Write minimal implementation**

3a. 在 `src/game/maps.ts` 顶部 `import { buildCompoundWalls }` 行之后追加：

```typescript
import { ITEM_DEFS, lootResourceOfNew } from './items';
```

3b. 将 `src/game/maps.ts:961-1000` 整块替换为代理实现：

```typescript
// ---------- 三角洲式稀有度（1白2绿3蓝4紫5金，代理 items.ts 注册表） ----------
export const RARITY: Record<string, number> = Object.fromEntries(
  Object.values(ITEM_DEFS).map((d) => [d.id, d.rarity]),
);

export const RARITY_COLOR: Record<number, string> = {
  1: '#94a3b8', 2: '#4ade80', 3: '#38bdf8', 4: '#c084fc', 5: '#fbbf24',
};

export const ITEM_ICON: Record<string, string> = Object.fromEntries(
  Object.values(ITEM_DEFS).map((d) => [d.id, d.icon]),
);

export type LootResource = 'wood' | 'stone' | 'scrap' | 'parts' | 'food' | 'ammo' | 'c4' | 'medical' | 'weapon' | 'armor' | 'credits' | 'shard' | 'blueprint' | 'pack' | 'throwable' | 'valuable' | 'seed';

// 掉落物归类（引擎与App共用，保持一致，代理 items.ts）
export function lootResourceOf(itemId: string): LootResource {
  return lootResourceOfNew(itemId) as LootResource;
}
```

3c. 地图掉落植入8处（精确替换 lootTable 数组内容）：

1. `camp_outskirts` 水井 `outskirts_well`：`[{ itemId: 'water', name: '高纯度饮用水', count: 4 }]` → `[{ itemId: 'water', name: '高纯度饮用水', count: 4 }, { itemId: 'seed_corn', name: '玉米种子×5', count: 2 }, { itemId: 'crop_potato', name: '土豆', count: 4 }]`
2. `mtn_logging` 工具棚 `log_toolshed`：追加 `{ itemId: 'ore_copper', name: '铜矿石', count: 4 }`
3. `marsh_docks` 一号钓台 `dock_1`：追加 `{ itemId: 'fish_bass', name: '大嘴鲈鱼', count: 2 }`
4. `town_factory` 警卫弹药库 `fac_ammo`：追加 `{ itemId: 'ammo_556', name: '5.56mm步枪弹×30', count: 2 }, { itemId: 'wp_p1911', name: 'P1911手枪', count: 1 }`
5. `town_street` 药房 `st_pharmacy`：追加 `{ itemId: 'med_surgery', name: '野战手术包', count: 1 }, { itemId: 'vest_t2', name: '2级轻型背心', count: 1 }`
6. `marsh_abyss` 无人机堆 `aby_scrap`：追加 `{ itemId: 'collect_circuit', name: '军用电路板', count: 2 }`
7. `mtn_quarry` 炸药库 `q_powder`：追加 `{ itemId: 'throw_frag', name: '破片手雷×2', count: 1 }`
8. `town_ruins` 地下室 `ru_basement`：追加 `{ itemId: 'collect_watch', name: '金表', count: 1 }, { itemId: 'key_blue', name: '蓝色房卡', count: 1 }`

示例（水井，其余同理照抄数组）：

```typescript
I('outskirts_well', '圩田水井', 'box', -10, 12, '[E/F 打水]', [
  { itemId: 'water', name: '高纯度饮用水', count: 4 },
  { itemId: 'seed_corn', name: '玉米种子×5', count: 2 },
  { itemId: 'crop_potato', name: '土豆', count: 4 },
], 1.2),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/maps.test.ts -t "item expansion wiring" -v`
Expected: PASS，2 passed。

Run: `npx vitest run src/game/items.test.ts src/game/maps.test.ts -v`
Expected: PASS，全绿（回归无破坏）。

- [ ] **Step 5: Commit**

```bash
git add src/game/maps.ts src/game/maps.test.ts
git commit -m "feat(items): wire maps rarity/icons/loot to registry and seed drops"
```

---

### Task 8: App/工作台/黑市全链路打通

**Files:**
- Modify: `src/App.tsx:156,500-575,1091-1115,1176-1230`
- Modify: `src/components/WorkbenchModal.tsx:37-146`
- Modify: `src/components/MarketModal.tsx:23-74`
- Test: `src/game/items.test.ts`（逻辑已覆盖，本任务以 `tsc --noEmit` 为门禁）

- [ ] **Step 1: Write the failing test**

本任务逻辑在 App 内联函数中，无法单测 import，因此先写一条契约测试锁住数值表一致性，在 `src/game/items.test.ts` 末尾追加：

```typescript
describe('app wiring contract', () => {
  it('every weapon/armor/med/throw has damage/heal/shield entry', async () => {
    const { ITEM_DEFS, WEAPON_DAMAGE, ARMOR_BONUS_TABLE, MED_HEAL, THROW_DAMAGE, FOOD_VALUE } = await import('./items');
    for (const d of Object.values(ITEM_DEFS)) {
      if (d.category === 'weapon') expect(WEAPON_DAMAGE[d.id], d.id).toBeDefined();
      if (d.category === 'armor') expect(ARMOR_BONUS_TABLE[d.id] ?? ARMOR_BONUS_TABLE[d.id.replace('helmet_','helmet_').replace('vest_','vest_')], d.id).toBeDefined();
      if (d.category === 'medical') expect(MED_HEAL[d.id] ?? MED_HEAL[d.id.replace('med_','med_')], d.id).toBeDefined();
      if (d.id.startsWith('throw_')) expect(THROW_DAMAGE[d.id], d.id).toBeDefined();
      if (d.category === 'food') expect(FOOD_VALUE[d.id] ?? FOOD_VALUE[d.id.replace('crop_','crop_')], d.id).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -t "app wiring contract" -v`
Expected: FAIL（若有遗漏；若一次全对则直接 PASS，本步视为契约锁，继续执行 Step 3 接线）。

- [ ] **Step 3: Write minimal implementation**

3a. `src/App.tsx:156` 护甲表合并：

```typescript
import { ITEM_DEFS, getItemDef, makeItem, WEAPON_DAMAGE, ARMOR_BONUS_TABLE, MED_HEAL, FOOD_VALUE } from './game/items';
...
const ARMOR_BONUS: Record<string, number> = { armor_cloth: 25, armor_vest: 50, ...ARMOR_BONUS_TABLE };
```

3b. `src/App.tsx:500-575` 的 `applyLoot` switch 追加三个 case（放在 `case 'pack':` 之后、`default:` 之前）：

```typescript
      case 'throwable': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'tool', icon: def.icon, count, maxCount: def.maxCount, desc: def.desc, rarity: def.rarity });
      }
      case 'valuable': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'material', icon: def.icon, count, maxCount: def.maxCount, desc: def.desc + `（黑市可售${def.sellPrice}点）`, rarity: def.rarity });
      }
      case 'seed': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'material', icon: def.icon, count, maxCount: def.maxCount, desc: def.desc, rarity: def.rarity });
      }
```

同时 `case 'weapon':` 与 `case 'armor':` 改为查表通用（替换原硬编码 rifle/armor_vest 两行）：

```typescript
      case 'weapon': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'weapon', icon: def.icon, count: 1, maxCount: 1, desc: `${def.desc}（单发${WEAPON_DAMAGE[itemId] ?? 50}伤）`, rarity: def.rarity });
      }
      case 'armor': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'armor', icon: def.icon, count: 1, maxCount: 1, desc: `${def.desc}（护盾+${ARMOR_BONUS_TABLE[itemId] ?? ARMOR_BONUS_TABLE[def.id] ?? 0}）`, rarity: def.rarity });
      }
```

同时 `case 'medical':` 与 `case 'food':` 改为查表通用：

```typescript
      case 'food': {
        const def = (() => { try { return getItemDef(itemId); } catch { return null; } })();
        const fv = FOOD_VALUE[itemId];
        const icon = def?.icon ?? (name.includes('鱼') || name.includes('鳟') ? '🐟' : name.includes('水') ? '💧' : '🥩');
        const dname = def?.name ?? name;
        return addItemToHotbar({ id: itemId.startsWith('food_') || itemId.startsWith('fish') || itemId.startsWith('crop_') || itemId.startsWith('cook_') || itemId.startsWith('jam_') || itemId.startsWith('wine_') || itemId.startsWith('pickle_') || itemId.startsWith('cheese_') || itemId.startsWith('honey_') ? itemId : `food_${name}`, name: dname, category: 'food', icon, count, maxCount: 99, desc: def?.desc ?? '点击快捷栏食用，恢复35点饱食。', rarity });
      }
      case 'medical': {
        const def = (() => { try { return getItemDef(itemId); } catch { return null; } })();
        const heal = MED_HEAL[itemId] ?? (name.includes('绷带') ? 30 : 60);
        const isBandage = (def?.name ?? name).includes('绷带');
        return addItemToHotbar({ id: def?.id ?? `med_${name}`, name: def?.name ?? name, category: 'medical', icon: def?.icon ?? (isBandage ? '🩹' : '💉'), count, maxCount: 10, desc: def?.desc ?? (isBandage ? '点击使用，恢复30点生命。' : `点击使用，恢复${heal}点生命。`), rarity });
      }
```

同时 `case 'ammo':` 改为按口径给备弹（替换原 `reserveAmmo += count`）：

```typescript
      case 'ammo': {
        if (engineRef.current) {
          const mult = itemId === 'ammo_762' ? 30 : itemId === 'ammo_556' ? 30 : itemId === 'ammo_9mm' ? 30 : itemId === 'ammo_shell' ? 10 : itemId === 'ammo_signal' ? 10 : count;
          engineRef.current.player.reserveAmmo += mult;
          engineRef.current.addTextParticle(
            engineRef.current.player.x, engineRef.current.player.y - 1.8,
            `+${mult} 备弹（R装填）`, '#38bdf8'
          );
        }
        return true;
      }
```

3c. `src/App.tsx:1091-1115` 的 `handleUseItem` 替换恢复数值分支：

```typescript
    if (item.category === 'food') {
      const fv = FOOD_VALUE[item.id] ?? { satiety: 35, heal: 0 };
      eng.player.satiety = Math.min(eng.player.maxSatiety, eng.player.satiety + fv.satiety);
      eng.player.stamina = Math.min(eng.player.maxStamina, eng.player.stamina + 20);
      if (fv.heal > 0) eng.player.hp = Math.min(eng.player.maxHp, eng.player.hp + fv.heal);
      soundManager.playUseMedical();
      eng.addTextParticle(eng.player.x, eng.player.y - 1.4, `+${fv.satiety} 饱食${fv.heal > 0 ? ` +${fv.heal}生命` : ''}`, '#fb923c');
      setAteFood(true);
    } else if (item.category === 'medical') {
      const heal = MED_HEAL[item.id] ?? (item.name.includes('绷带') ? 30 : 60);
      eng.player.hp = Math.min(eng.player.maxHp, eng.player.hp + heal);
      if (item.id === 'med_painkiller') eng.player.stamina = Math.min(eng.player.maxStamina, eng.player.stamina + 20);
      soundManager.playUseMedical();
      eng.addTextParticle(eng.player.x, eng.player.y - 1.4, `+${heal} 生命`, '#4ade80');
    } else {
      return;
    }
```

3d. `src/components/WorkbenchModal.tsx:5-11` 先扩展 `CraftCost`（真材料，没有它作物/鱼永远只是摆设）：

```typescript
export interface CraftCost {
  wood: number;
  stone: number;
  scrap: number;
  parts: number;
  extra?: { itemId: string; count: number }[];
}
```

`canAfford` 与 `costText` 同步改（`WorkbenchModal.tsx:148-175`）：

```typescript
import { getItemDef } from '../game/items';
function costText(cost: CraftCost): string {
  const parts: string[] = [];
  if (cost.wood > 0) parts.push(`原木x${cost.wood}`);
  if (cost.stone > 0) parts.push(`条石x${cost.stone}`);
  if (cost.scrap > 0) parts.push(`废铁x${cost.scrap}`);
  if (cost.parts > 0) parts.push(`零件x${cost.parts}`);
  for (const e of cost.extra ?? []) {
    try { parts.push(`${getItemDef(e.itemId).name}x${e.count}`); }
    catch { parts.push(`${e.itemId}x${e.count}`); }
  }
  return parts.join(' · ');
}
// canAfford 新增签名：canAfford(cost, hasExtra: (itemId: string, count: number) => boolean)
const canAfford = (cost: CraftCost, hasExtra: (itemId: string, count: number) => boolean) =>
  playerWood >= cost.wood &&
  playerStone >= cost.stone &&
  playerScrap >= cost.scrap &&
  playerParts >= cost.parts &&
  (cost.extra ?? []).every((e) => hasExtra(e.itemId, e.count));
```

调用侧 `hasExtra` 由 App 经 prop 传入（查 hotbar 背包；见本任务 3g 接线。禁止按 `(itemId, count) => true` 占位，会导致无材料误可造）。

3e. `src/components/WorkbenchModal.tsx:37-146` 在 `RECIPES` 数组末尾（`armor_plate` 项之后）追加12条（种植5+烹饪加工5+升级2，全部带 extra 真材料）：

```typescript
  { id: 'grow_parsnip', name: '种植：防风草 ×4', resultName: '防风草', icon: '🥕', category: '农圩种植', desc: '种子×1农圩种植，工作台浓缩为12秒。', cost: { wood: 2, stone: 0, scrap: 0, parts: 0, extra: [{ itemId: 'seed_parsnip', count: 1 }] } },
  { id: 'grow_potato', name: '种植：土豆 ×4', resultName: '土豆', icon: '🥔', category: '农圩种植', desc: '种子×1，量大管饱。', cost: { wood: 2, stone: 0, scrap: 2, parts: 0, extra: [{ itemId: 'seed_potato', count: 1 }] } },
  { id: 'grow_corn', name: '种植：玉米 ×4', resultName: '玉米', icon: '🌽', category: '农圩种植', desc: '种子×1，鱼汤原料。', cost: { wood: 4, stone: 0, scrap: 2, parts: 0, extra: [{ itemId: 'seed_corn', count: 1 }] } },
  { id: 'grow_pumpkin', name: '种植：南瓜 ×3', resultName: '南瓜', icon: '🎃', category: '农圩种植', desc: '种子×1，腌菜原料。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'seed_pumpkin', count: 1 }] } },
  { id: 'grow_starfruit', name: '种植：星果 ×2', resultName: '星果', icon: '🌟', category: '农圩种植', desc: '种子×1，酿酒暴利。', cost: { wood: 6, stone: 0, scrap: 6, parts: 1, extra: [{ itemId: 'seed_starfruit', count: 1 }] } },
  { id: 'jam_pot', name: '蓝莓果酱 ×2', resultName: '蓝莓果酱', icon: '🫙', category: '食物加工', desc: '蓝莓×3→果酱×2，售价翻倍。', cost: { wood: 4, stone: 0, scrap: 6, parts: 0, extra: [{ itemId: 'crop_blueberry', count: 3 }] } },
  { id: 'cook_pot', name: '鱼汤 ×2', resultName: '鱼汤', icon: '🍲', category: '食物加工', desc: '鲈鱼×2+水感废料，恢复60饱食。', cost: { wood: 6, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'fish_bass', count: 2 }] } },
  { id: 'copper_pickaxe', name: '铜镐', resultName: '铜镐', icon: '⛏️', category: '工具打造', desc: '铜矿×8，采矿效率+120%。', cost: { wood: 6, stone: 0, scrap: 8, parts: 0, extra: [{ itemId: 'ore_copper', count: 8 }] } },
  { id: 'ammo_reload', name: '复装弹药 ×30', resultName: '复装弹药', icon: '🎯', category: '弹药制造', desc: '废铁×10+零件×1，通用备弹+30。', cost: { wood: 0, stone: 0, scrap: 10, parts: 1 } },
  { id: 'surgery_craft', name: '野战手术包 ×1', resultName: '野战手术包', icon: '💉', category: '医疗合成', desc: '血袋感+零件，恢复100生命。', cost: { wood: 0, stone: 0, scrap: 14, parts: 1, extra: [{ itemId: 'med_bandage', count: 2 }] } },
  { id: 'star_wine', name: '星果酒 ×1', resultName: '星果酒', icon: '🍷', category: '食物加工', desc: '星果×3陈酿，毕业暴利。', cost: { wood: 10, stone: 0, scrap: 8, parts: 1, extra: [{ itemId: 'crop_starfruit', count: 3 }] } },
  { id: 'gun_upgrade_m4', name: '改装：M4A1（耗扩容匣）', resultName: 'M4A1', icon: '🔫', category: '武器打造', desc: 'AKM+扩容弹匣→M4A1（110伤）。', cost: { wood: 0, stone: 0, scrap: 15, parts: 2, extra: [{ itemId: 'att_extmag', count: 1 }] } },
```

3f. `src/components/MarketModal.tsx:23-74` 在 `items` 数组末尾（`rift_shard` 项之后）追加8条：

```typescript
    { id: 'seed_corn', name: '玉米种子包', category: '物资', buyPrice: 60, sellPrice: 20, icon: '🌱', stock: 60, description: '农圩可种，连续收获，星露谷入门包。' },
    { id: 'ore_copper', name: '铜矿石 ×5', category: '物资', buyPrice: 150, sellPrice: 100, icon: '🟤', stock: 40, description: '铜镐升级材料，工具棚/矿场产出。' },
    { id: 'att_scope4x', name: '4倍战术瞄具', category: '装备', buyPrice: 400, sellPrice: 280, icon: '🔭', stock: 6, description: 'SVD/M4配件，三角洲摸金标配。' },
    { id: 'key_blue', name: '蓝色房卡', category: '稀有材料', buyPrice: 600, sellPrice: 450, icon: '🟦', stock: 3, description: '开加油站办公室/渔港小屋，内有高价值箱。' },
    { id: 'collect_mandel', name: '曼德尔砖', category: '稀有材料', buyPrice: 2000, sellPrice: 1500, icon: '🧱', stock: 1, description: '三角洲头号藏品，红区房卡房限定。' },
    { id: 'med_surgery', name: '野战手术包', category: '裂隙药剂', buyPrice: 300, sellPrice: 220, icon: '💉', stock: 5, description: '恢复100生命，BOSS战救命。' },
    { id: 'throw_frag', name: '破片手雷 ×2', category: '装备', buyPrice: 120, sellPrice: 80, icon: '💣', stock: 12, description: '范围300伤害，清群怪。' },
    { id: 'wine_starfruit', name: '星果酒', category: '稀有材料', buyPrice: 2250, sellPrice: 2250, icon: '🍷', stock: 2, description: '星果陈酿，毕业暴利，食用回40饱食+30生命。' },
```

3g. `src/App.tsx:1176-1230` 的 `handleBuyMarketItem/handleSellMarketItem` 在 `rift_shard` 分支之后追加通用分支 + 向 WorkbenchModal 传入 `hasExtra`（查 hotbar 真背包）。精简实现只处理新增8种（旧5种保持原样不动）：

```typescript
    // 新增通用商品（种子/铜矿/配件/房卡/藏品/手术包/手雷/星果酒）
    const def = (() => { try { return getItemDef(item.id); } catch { return null; } })();
    if (def) {
      if (def.category === 'food' || def.category === 'medical' || def.category === 'material' || def.category === 'tool') {
        ok = addItemToHotbar({ id: def.id, name: def.name, category: def.category === 'material' && (def.id.startsWith('att_') || def.id.startsWith('key_') || def.id.startsWith('collect_') || def.id.startsWith('ore_') || def.id.startsWith('seed_')) ? 'material' : def.category, icon: def.icon, count: def.id.startsWith('seed_') ? 2 * quantity : 1 * quantity, maxCount: def.maxCount, desc: def.desc, rarity: def.rarity });
      } else if (def.category === 'weapon' || def.category === 'armor') {
        ok = addItemToHotbar({ id: def.id, name: def.name, category: def.category, icon: def.icon, count: 1, maxCount: 1, desc: def.desc, rarity: def.rarity });
      }
    }
```

卖出侧在 `handleSellMarketItem` 同位置追加：

```typescript
    const sdef = (() => { try { return getItemDef(item.id); } catch { return null; } })();
    if (sdef) {
      const cur = [...hotbarSlotsRef.current];
      let need = quantity;
      for (let i = 0; i < cur.length && need > 0; i++) {
        const s = cur[i];
        if (s && s.id === item.id && s.count > 0) {
          const take = Math.min(need, s.count);
          need -= take;
          cur[i] = s.count - take <= 0 ? null : { ...s, count: s.count - take };
        }
      }
      if (need > 0) { deny(`没有足够的${sdef.name}可卖。`); return false; }
      setHotbarSlots(cur);
      setPlayerStats((prev) => ({ ...prev, credits: prev.credits + item.sellPrice * quantity }));
      soundManager.playLoot();
      return true;
    }
```

（Rev C 补丁：卖侧通用块必须包在 legacy 链的 terminal `else` 内并先按 `item.id` 扣背包再加钱——否则新商品可空手刷钱，且旧 `scrap`/`medkit`（注册表ID碰撞）会扣货不给钱/双扣。买侧同理包在 `else` 内，防旧商品双发货。）

（注：完整扣货逻辑沿用旧函数内已有的背包扫描，新增分支只负责加钱，扣货走原 `hotbarSlots` 查找 `item.id` 逻辑，不另起炉灶。）

3h. `src/App.tsx:1256-1395` 的 `handleCraftSuccess` 追加 extra 扣料 + 12种新配方发货（放在 `applyResult` 的 `default:` 之前，`order.cost` 扣除之后追加 extra 扣除）：

```typescript
          case 'grow_parsnip':
            return grantItem(makeItem('crop_parsnip', 4));
          case 'grow_potato':
            return grantItem(makeItem('crop_potato', 4));
          case 'grow_corn':
            return grantItem(makeItem('crop_corn', 4));
          case 'grow_pumpkin':
            return grantItem(makeItem('crop_pumpkin', 3));
          case 'grow_starfruit':
            return grantItem(makeItem('crop_starfruit', 2));
          case 'jam_pot':
            return grantItem(makeItem('jam_berry', 2));
          case 'cook_pot':
            return grantItem(makeItem('cook_fishsoup', 2));
          case 'copper_pickaxe':
            return grantItem({ id: 'pickaxe_copper', name: '铜镐', category: 'tool', icon: '⛏️', count: 1, maxCount: 1, desc: '采矿效率+120%，采石专用。', rarity: 3 });
          case 'surgery_craft':
            return grantItem(makeItem('med_surgery', 1));
          case 'star_wine':
            return grantItem(makeItem('wine_starfruit', 1));
          case 'gun_upgrade_m4':
            return grantItem(makeItem('wp_m4a1', 1));
          case 'ammo_reload':
            eng.player.reserveAmmo += 30;
            eng.addTextParticle(eng.player.x, eng.player.y - 1.2, '+30 复装弹药（按R装填）', '#38bdf8');
            return true;
```

extra 扣料（放在 `if (order.cost.parts > 0) ...` 行之后）：

```typescript
      for (const e of order.cost.extra ?? []) {
        setHotbarSlots((prev) => {
          const next = [...prev];
          let need = e.count;
          for (let i = 0; i < next.length && need > 0; i++) {
            const s = next[i];
            if (s && s.id === e.itemId) {
              const take = Math.min(s.count, need);
              need -= take;
              const left = s.count - take;
              next[i] = left <= 0 ? null : { ...s, count: left };
            }
          }
          return next;
        });
      }
```

`hasExtra` prop 接线（`WorkbenchModal` 新增可选 prop `hasExtra?: (itemId: string, count: number) => boolean`，App 传入真实现）：

```typescript
// WorkbenchModal.tsx props 追加：
  hasExtra?: (itemId: string, count: number) => boolean;
// App.tsx 传入：
        hasExtra={(itemId, count) => {
          let have = 0;
          for (const s of hotbarSlotsRef.current) if (s && s.id === itemId) have += s.count;
          if (itemId === 'water') have += 999; // 水感：水井/餐馆易得，首版免校验只收废铁木料，防卡死
          return have >= count;
        }}
```

（注：`water` 首版免校验是刻意 YAGNI——鱼汤配方 extra 只收 `fish_bass×2`，不收 water，避免新玩家卡制造。后续要真收水时再删此行并补单测。）

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/items.test.ts -t "app wiring contract" -v`
Expected: PASS，1 passed。

Run: `npx tsc --noEmit`
Expected: PASS，无输出（类型全过；若报 MarketModal category 联合类型错，把新增项 category 改为四种允许值之一，本计划已使用允许值）。

Run: `npx vitest run src/game/items.test.ts src/game/maps.test.ts -v`
Expected: PASS，全绿。

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/WorkbenchModal.tsx src/components/MarketModal.tsx src/game/items.test.ts
git commit -m "feat(items): wire applyLoot/use/market/workbench for new lines"
```

---

### Task 9: 背包/掉落UI + 全量回归

**Files:**
- Modify: `src/components/InventoryModal.tsx:18-39`
- Test: `src/game/items.test.ts`，`src/game/maps.test.ts`，全量 `npx vitest run`

- [ ] **Step 1: Write the failing test**

在 `src/game/items.test.ts` 末尾追加终局锁：

```typescript
describe('item expansion finale', () => {
  it('registry has 85+ defs, rarities cover 1-5, no empty icons', async () => {
    const { ITEM_DEFS } = await import('./items');
    const ids = Object.keys(ITEM_DEFS);
    expect(ids.length).toBeGreaterThanOrEqual(85);
    const rarities = new Set(Object.values(ITEM_DEFS).map((d) => d.rarity));
    for (const r of [1,2,3,4,5]) expect(rarities.has(r as 1)).toBe(true);
    for (const d of Object.values(ITEM_DEFS)) {
      expect(d.icon.length).toBeGreaterThan(0);
      expect(d.maxCount).toBeGreaterThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -t "item expansion finale" -v`
Expected: 若 Task1-6 全部完成则直接 PASS（本步为终局计数锁，不足85说明有任务漏项，需回查）。

- [ ] **Step 3: Write minimal implementation**

`src/components/InventoryModal.tsx:18-39` 的 `EQUIP_META` bonus 函数替换为覆盖新枪/甲：

```typescript
const EQUIP_META: Record<'weapon' | 'armor' | 'tool' | 'pack', { name: string; icon: React.ReactNode; bonus: (it: Item | null) => string }> = {
  weapon: {
    name: '武器',
    icon: <Sword className="w-4 h-4 text-rose-400" />,
    bonus: (it) => {
      if (!it) return '无：左键为徒手近战';
      if (it.id === 'crude_gun') return '土铳 · 单发55';
      if (it.id === 'wp_p1911') return 'P1911 · 单发38';
      if (it.id === 'wp_mp5') return 'MP5 · 单发52';
      if (it.id === 'wp_akm') return 'AKM · 单发98';
      if (it.id === 'wp_m4a1') return 'M4A1 · 单发110';
      if (it.id === 'wp_m870') return 'M870 · 单发140';
      if (it.id === 'wp_svd') return 'SVD · 单发220';
      if (it.id === 'wp_plasma') return '等离子 · 单发320';
      return '步枪 · 单发124';
    },
  },
  armor: {
    name: '护甲',
    icon: <Shirt className="w-4 h-4 text-sky-400" />,
    bonus: (it) => {
      if (!it) return '无：只有基础护盾';
      if (it.id === 'armor_vest' || it.id === 'vest' || it.id === 'vest_t3') return '防弹背心 · 护盾+50/减伤15%';
      if (it.id === 'vest_t2') return '轻型背心 · 护盾+25';
      if (it.id === 'vest_t4') return '重型背心 · 护盾+80/减伤20%';
      if (it.id === 'vest_t5') return '钛合金 · 护盾+110/减伤25%';
      if (it.id === 'helmet_t2') return '头盔 · 护盾+15';
      if (it.id === 'helmet_t3') return '头盔 · 护盾+30';
      if (it.id === 'helmet_t4') return '头盔 · 护盾+50';
      return '粗布护甲 · 护盾+25';
    },
  },
  tool: {
    name: '工具',
    icon: <Wrench className="w-4 h-4 text-amber-400" />,
    bonus: (it) => {
      if (!it) return '无：徒手采集';
      if (it.id === 'throw_frag') return '破片 · 范围300';
      if (it.id === 'throw_molly') return '燃烧 · 持续120';
      if (it.id === 'throw_smoke') return '烟雾 · 遮蔽脱战';
      if (it.id === 'throw_flash') return '闪光 · 致盲3秒';
      if (it.id === 'thermite_charge') return '铝热 · 无声熔切';
      if (it.id === 'c4_explosive') return 'C4 · 破拆400';
      return '石镐 · 采集+60%/近战22';
    },
  },
  pack: {
    name: '背包',
    icon: <Briefcase className="w-4 h-4 text-violet-400" />,
    bonus: (it) => (!it ? '基础6格' : it.id === 'pack_tactical' ? '战术携行具 · 共10格' : '帆布背包 · 共8格'),
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsc --noEmit`
Expected: PASS，无输出。

Run: `npx vitest run -v`
Expected: PASS，全量测试绿（含 compound/spawn/quests/home/visualTheme 等旧用例无破坏）。

手动走图打勾（`npm run dev`，控制台先清编辑器覆盖再验）：
```
Object.keys(localStorage).filter(k => k.startsWith('sdc_map_override_')).forEach(k => localStorage.removeItem(k)); location.reload();
```
1. 外圩水井开出玉米种子+土豆 → 背包材料栏可见 🌱🥔 → 工作台种植玉米×4（扣种子验extra）→ 烹饪鱼汤（扣鲈鱼验extra）→ 食用回60饱+20血；
2. 一号钓台钓起大嘴鲈鱼 → 食用回35饱食；
3. 工厂弹药库开出P1911 → 自动进武器栏，伤害38；
4. 药房开出手术包 → 使用回100血；
5. 黑市买到曼德尔砖/蓝色房卡 → 稀有度金/紫色标 🧱🟦 → 背包图鉴页曼德尔传奇1/3；
6. 红房持红房卡开箱得曼德尔砖 → LootPanel金框 → 集齐套装黑市领+3000点。

- [ ] **Step 5: Commit**

```bash
git add src/components/InventoryModal.tsx src/game/items.test.ts
git commit -m "feat(items): inventory meta for new gear and finale lock"
```

---

### Task 10: 藏品图鉴 + 收集欲（稀有度/套装/展示）

**Files:**
- Create: `src/game/collection.ts`
- Create: `src/game/collection.test.ts`
- Modify: `src/components/LootPanel.tsx:1-55`（金框高亮神话藏品）
- Modify: `src/components/InventoryModal.tsx`（图鉴页）
- Test: `src/game/collection.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/collection.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { COLLECT_DEFS, COLLECT_SETS, collectTierOf, setProgress, setBonusCredits } from './collection';

describe('collection codex', () => {
  it('tiers cover all collectibles: memorial/fine/heirloom/mythic', () => {
    expect(collectTierOf('collect_circuit')).toBe('memorial');
    expect(collectTierOf('collect_watch')).toBe('fine');
    expect(collectTierOf('collect_dogtag')).toBe('fine');
    expect(collectTierOf('collect_mandel')).toBe('heirloom');
    expect(collectTierOf('fish_legend')).toBe('mythic');
    expect(COLLECT_DEFS['collect_mandel'].sellPrice).toBe(1500);
    expect(COLLECT_DEFS['fish_legend'].sellPrice).toBe(2000);
  });
  it('set progress counts owned/total and bonus only when complete', () => {
    const owned = new Set(['collect_watch', 'collect_circuit']);
    const p = setProgress('decent', owned);
    expect(p.owned).toBe(2);
    expect(p.total).toBe(2);
    expect(setBonusCredits('decent', owned)).toBe(500);
    const empty = new Set<string>([]);
    expect(setBonusCredits('decent', empty)).toBe(0);
    expect(setBonusCredits('mandel', new Set(['collect_mandel', 'key_red', 'fish_legend']))).toBe(3000);
    expect(setBonusCredits('mandel', new Set(['collect_mandel']))).toBe(0);
  });
  it('every collectible has a drop source (no shop-only mythic)', () => {
    for (const [id, d] of Object.entries(COLLECT_DEFS)) {
      expect(d.source.length).toBeGreaterThan(3);
    }
    expect(COLLECT_DEFS['collect_mandel'].source).toContain('红房');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/collection.test.ts -v`
Expected: FAIL with `Failed to resolve import "./collection"`（文件尚不存在）。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/collection.ts`：

```typescript
export type CollectTier = 'memorial' | 'fine' | 'heirloom' | 'mythic';

export interface CollectDef {
  id: string;
  name: string;
  icon: string;
  tier: CollectTier;
  sellPrice: number;
  source: string;
}

export const COLLECT_DEFS: Record<string, CollectDef> = {
  collect_circuit: { id: 'collect_circuit', name: '军用电路板', icon: '💾', tier: 'memorial', sellPrice: 280, source: '无人机堆/汽修铺/工厂配件架掉落，纪念级入门藏品' },
  collect_watch: { id: 'collect_watch', name: '金表', icon: '⌚', tier: 'fine', sellPrice: 340, source: '居民区地下室/餐馆里间掉落，精品级' },
  collect_dogtag: { id: 'collect_dogtag', name: '阵亡者身份牌', icon: '🎖️', tier: 'fine', sellPrice: 380, source: '精英怪/佣兵前哨掉落，精品级' },
  collect_mandel: { id: 'collect_mandel', name: '曼德尔砖', icon: '🧱', tier: 'heirloom', sellPrice: 1500, source: '红房（工厂核心实验室，持红色房卡开启）限定，传家级' },
  key_red: { id: 'key_red', name: '红色房卡', icon: '🟥', tier: 'heirloom', sellPrice: 900, source: '掠夺者前哨/深渊宝箱掉落，传家级钥匙' },
  key_blue: { id: 'key_blue', name: '蓝色房卡', icon: '🟦', tier: 'fine', sellPrice: 450, source: '居民区地下室/加油站办公室掉落' },
  fish_legend: { id: 'fish_legend', name: '传说之鱼', icon: '👑', tier: 'mythic', sellPrice: 2000, source: '翠湖深水+荧光苔，全图唯一，神话级' },
};

export const TIER_COLOR: Record<CollectTier, string> = {
  memorial: '#94a3b8', fine: '#38bdf8', heirloom: '#c084fc', mythic: '#fbbf24',
};

export interface CollectSet {
  id: string;
  name: string;
  members: string[];
  bonusCredits: number;
  title?: string;
}

export const COLLECT_SETS: Record<string, CollectSet> = {
  decent: { id: 'decent', name: '废土体面人', members: ['collect_watch', 'collect_circuit'], bonusCredits: 500 },
  pioneer: { id: 'pioneer', name: '先锋遗落', members: ['collect_dogtag', 'collect_dogtag', 'key_blue'], bonusCredits: 1200 },
  mandel: { id: 'mandel', name: '曼德尔传奇', members: ['collect_mandel', 'key_red', 'fish_legend'], bonusCredits: 3000, title: '曼德尔收藏家' },
};

export function collectTierOf(id: string): CollectTier {
  const d = COLLECT_DEFS[id];
  if (!d) throw new Error(`unknown collect: ${id}`);
  return d.tier;
}

export function setProgress(setId: string, owned: Set<string>): { owned: number; total: number } {
  const s = COLLECT_SETS[setId];
  if (!s) throw new Error(`unknown set: ${setId}`);
  const need = new Map<string, number>();
  for (const m of s.members) need.set(m, (need.get(m) ?? 0) + 1);
  const have = new Map<string, number>();
  for (const o of owned) have.set(o, (have.get(o) ?? 0) + 1);
  let done = 0;
  for (const [id, n] of need) done += Math.min(n, have.get(id) ?? 0);
  return { owned: done, total: s.members.length };
}

export function setBonusCredits(setId: string, owned: Set<string>): number {
  const s = COLLECT_SETS[setId];
  if (!s) throw new Error(`unknown set: ${setId}`);
  return setProgress(setId, owned).owned >= s.members.length ? s.bonusCredits : 0;
}
```

`LootPanel.tsx` 神话金框（在已有 `RARITY_COLOR` 取色后追加，`it.itemId` 为神话时加金色外圈）：

```typescript
import { COLLECT_DEFS } from '../game/collection';
const isMythic = !!COLLECT_DEFS[it.itemId] && (COLLECT_DEFS[it.itemId].tier === 'mythic' || COLLECT_DEFS[it.itemId].tier === 'heirloom');
// 外层 div className 追加：${isMythic ? ' ring-2 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.5)]' : ''}
```

`InventoryModal.tsx` 图鉴页（背包网格之后、材料栏之前插入，只读展示，不做交易逻辑）：

```typescript
import { COLLECT_DEFS, COLLECT_SETS, TIER_COLOR, setProgress } from '../game/collection';
// 组件内：
const ownedIds = new Set((hotbar ?? []).filter((x): x is Item => !!x).map((x) => x.id));
// JSX：
<div>
  <div className="text-xs font-bold text-slate-300 mb-2">藏品图鉴（集齐套装黑市领加成）</div>
  <div className="grid grid-cols-4 gap-2">
    {Object.values(COLLECT_DEFS).map((c) => {
      const got = ownedIds.has(c.id);
      return (
        <div key={c.id} title={c.source} className={`rounded-xl border p-2 flex flex-col items-center gap-1 ${got ? '' : 'opacity-40 grayscale'}`} style={{ borderColor: TIER_COLOR[c.tier] }}>
          <div className="text-2xl">{got ? c.icon : '❓'}</div>
          <div className="text-[10px] text-slate-300">{c.name}</div>
          <div className="text-[10px] font-mono" style={{ color: TIER_COLOR[c.tier] }}>{c.tier}</div>
        </div>
      );
    })}
  </div>
  <div className="text-[11px] font-mono text-slate-400 mt-2">
    {Object.values(COLLECT_SETS).map((s) => {
      const p = setProgress(s.id, ownedIds);
      return <div key={s.id}>{s.name} {p.owned}/{p.total} · 集齐+{s.bonusCredits}点{s.title ? `+称号${s.title}` : ''}</div>;
    })}
  </div>
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/collection.test.ts -v`
Expected: PASS，3 passed。

Run: `npx tsc --noEmit`
Expected: PASS，无输出。

- [ ] **Step 5: Commit**

```bash
git add src/game/collection.ts src/game/collection.test.ts src/components/LootPanel.tsx src/components/InventoryModal.tsx
git commit -m "feat(items): add collection codex with tiers/sets/display"
```

---

---

### Task 11: 可达性补齐（Rev D，终审 H1-H5/M1 修复）

**背景：** 终审确认 94 注册表 + 全链路无回归，但约40新ID无获取途径（H1）、`surgery_craft` 要 `med_bandage` 而绷带配方发 `med_亚麻绷带`（H2）、`gun_upgrade_m4` 未耗AKM（H3）、`pioneer` 套装 `Set<string>` 永远凑不齐 `dogtag×2`（H4）、`pickaxe_copper` 未进注册表（H5）、黑市×5/×2 货名与发货不符（M1）。本任务只做加法修复，不动已验证逻辑。

**Files:**
- Modify: `src/game/items.ts`（+pickaxe_copper 1条）
- Modify: `src/game/items.test.ts`（+pickaxe断言）
- Modify: `src/App.tsx`（绷带发货改注册ID、M4升级耗AKM、+4加工烹饪配方发货、黑市包量发货）
- Modify: `src/components/WorkbenchModal.tsx`（+4配方、surgery desc修正）
- Modify: `src/components/MarketModal.tsx`（不动，包量在App侧修）
- Modify: `src/components/InventoryModal.tsx`（tool bonus +铜镐分支）
- Modify: `src/game/collection.ts`（pioneer去重）
- Modify: `src/game/collection.test.ts`（+pioneer用例）
- Modify: `src/game/maps.ts`（约20处掉落追加，只追加不改旧行）
- Modify: `src/game/maps.test.ts`（placement断言扩到全量H1表）

- [ ] **Step 1: Write the failing test**

在 `src/game/items.test.ts` 末尾追加：

```typescript
describe('reachability patch (rev D)', () => {
  it('pickaxe_copper is a registered tool', async () => {
    const { ITEM_DEFS, lootResourceOfNew } = await import('./items');
    expect(ITEM_DEFS['pickaxe_copper']).toBeDefined();
    expect(ITEM_DEFS['pickaxe_copper'].category).toBe('tool');
    expect(lootResourceOfNew('pickaxe_copper')).toBe('scrap');
  });
});
```

在 `src/game/collection.test.ts` 末尾追加：

```typescript
describe('pioneer set is completable', () => {
  it('needs unique members only', async () => {
    const { COLLECT_SETS, setBonusCredits } = await import('./collection');
    const members = COLLECT_SETS['pioneer'].members;
    expect(new Set(members).size).toBe(members.length);
    expect(setBonusCredits('pioneer', new Set(['collect_dogtag', 'key_blue']))).toBe(1200);
    expect(setBonusCredits('pioneer', new Set(['collect_dogtag']))).toBe(0);
  });
});
```

在 `src/game/maps.test.ts` 的 `at least 8 interactables` 用例之后追加：

```typescript
  it('every non-recipe item has a loot source (H1 closure)', async () => {
    const { SUBMAPS } = await import('./maps');
    const ids = new Set(Object.values(SUBMAPS).flatMap((m) => m.interactables).flatMap((e) => e.lootTable ?? []).map((l) => l.itemId));
    for (const id of ['ore_silver','ore_gold','ore_iridium','fish_carp','fish_eel','fish_catfish','fish_crimson','fish_legend','seed_parsnip','seed_potato','seed_pumpkin','seed_starfruit','crop_blueberry','honey_wild','ammo_762','ammo_9mm','ammo_shell','ammo_signal','wp_mp5','wp_akm','wp_m870','wp_svd','wp_plasma','helmet_t2','helmet_t3','helmet_t4','vest_t3','vest_t4','vest_t5','med_medkit','med_bloodbag','med_painkiller','throw_smoke','throw_flash','throw_molly','att_suppressor','att_foregrip','att_extmag','key_red','collect_dogtag']) {
      expect(ids.has(id), `${id} still sourceless`).toBe(true);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/items.test.ts -t "reachability patch" -v`
Expected: FAIL with `pickaxe_copper` undefined。

Run: `npx vitest run src/game/collection.test.ts -t "pioneer" -v`
Expected: FAIL（members有重复，`new Set(members).size` 不等于length）。

- [ ] **Step 3: Write minimal implementation**

3a. `src/game/items.ts` 在 `throw_molly` 行之后插入：

```typescript
  pickaxe_copper: { id: 'pickaxe_copper', name: '铜镐', category: 'tool', icon: '⛏️', rarity: 3, maxCount: 1, desc: '采矿专用：采石效率+60%，铜矿升级。', buyPrice: 350, sellPrice: 230 },
```

（引擎 `App.tsx:1048` 按 `includes('pickaxe')` 判 `toolKind='pick'`，自动吃+60%与近战22，无需改引擎。）

3b. `src/App.tsx` 绷带配方发货改注册ID（`handleCraftSuccess` 的 `case 'bandage':` 整块替换）：

```typescript
          case 'bandage':
            return grantItem(makeItem('med_bandage', 2));
```

3c. `src/App.tsx` 的 `case 'gun_upgrade_m4':` 保持发货 `makeItem('wp_m4a1', 1)`，其 `cost.extra` 由 WorkbenchModal 侧追加 `wp_akm`（见3e），App 侧 extra 扣料循环通用，无需改代码。

3d. `src/App.tsx` 的 `applyResult` 在 `case 'ammo_reload':` 之前插入4条：

```typescript
          case 'pickle_pot':
            return grantItem(makeItem('pickle_veg', 2));
          case 'cheese_press':
            return grantItem(makeItem('cheese_goat', 1));
          case 'stirfry_pan':
            return grantItem(makeItem('cook_stirfry', 2));
          case 'energy_mix':
            return grantItem(makeItem('cook_energybar', 2));
```

3e. `src/components/WorkbenchModal.tsx` 的 `RECIPES` 在 `gun_upgrade_m4` 项之后追加5条（4加工烹饪+M4耗枪修正——M4项整行替换，加 `wp_akm`）：

```typescript
  { id: 'gun_upgrade_m4', name: '改装：M4A1（耗AKM+扩容匣）', resultName: 'M4A1', icon: '🔫', category: '武器打造', desc: 'AKM+扩容弹匣→M4A1（110伤），旧枪折价。', cost: { wood: 0, stone: 0, scrap: 15, parts: 2, extra: [{ itemId: 'att_extmag', count: 1 }, { itemId: 'wp_akm', count: 1 }] } },
  { id: 'pickle_pot', name: '腌南瓜 ×2', resultName: '腌南瓜', icon: '🥒', category: '食物加工', desc: '南瓜×2→腌菜×2。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'crop_pumpkin', count: 2 }] } },
  { id: 'cheese_press', name: '羊奶酪 ×1', resultName: '羊奶酪', icon: '🧀', category: '食物加工', desc: '玉米×2+蜂蜜×1→奶酪。', cost: { wood: 4, stone: 0, scrap: 6, parts: 0, extra: [{ itemId: 'crop_corn', count: 2 }, { itemId: 'honey_wild', count: 1 }] } },
  { id: 'stirfry_pan', name: '蔬菜炒 ×2', resultName: '蔬菜炒', icon: '🥗', category: '食物加工', desc: '玉米×2+防风草×2→蔬菜炒。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'crop_corn', count: 2 }, { itemId: 'crop_parsnip', count: 2 }] } },
  { id: 'energy_mix', name: '能量棒 ×2', resultName: '能量棒', icon: '🍫', category: '食物加工', desc: '蜂蜜×2+裂隙鲶鱼×1→能量棒。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'honey_wild', count: 2 }, { itemId: 'fish_catfish', count: 1 }] } },
```

并删除旧的 `gun_upgrade_m4` 单extra行（整行替换，不可留两条同id）。`surgery_craft` 的 desc 改为 `'绷带×2+零件×1，恢复100生命。'`（与 extra 一致）。

3f. `src/App.tsx` 黑市包量发货（`handleBuyMarketItem` 通用分支的 count 表达式替换）：

```typescript
count: def.id.startsWith('seed_') ? 2 * quantity : def.id === 'ore_copper' ? 5 * quantity : def.id === 'throw_frag' ? 2 * quantity : 1 * quantity,
```

3g. `src/components/InventoryModal.tsx` tool bonus 在 `throw_flash` 行之后（Task 9 补丁行之后）追加：

```typescript
      if (it.id === 'pickaxe_copper') return '铜镐 · 采集+60%';
```

3h. `src/game/collection.ts` 的 `pioneer` 行替换为：

```typescript
  pioneer: { id: 'pioneer', name: '先锋遗落', members: ['collect_dogtag', 'key_blue'], bonusCredits: 1200 },
```

3i. `src/game/maps.ts` 掉落追加（只在已有数组末尾 append，不改旧行）：
- `ws_crate` += `{ itemId: 'seed_parsnip', name: '防风草种子×5', count: 2 }`
- `outskirts_well` += `{ itemId: 'seed_pumpkin', name: '南瓜种子×3', count: 1 }`
- `bog_cache` += `{ itemId: 'seed_potato', name: '土豆种子×5', count: 2 }, { itemId: 'honey_wild', name: '野蜂蜜', count: 2 }`
- `rift_cache` += `{ itemId: 'seed_starfruit', name: '星果种子×1', count: 1 }, { itemId: 'wp_svd', name: 'SVD狙击步枪', count: 1 }, { itemId: 'key_red', name: '红色房卡', count: 1 }, { itemId: 'helmet_t4', name: '4级重型头盔', count: 1 }, { itemId: 'vest_t5', name: '5级钛合金背心', count: 1 }, { itemId: 'fish_legend', name: '传说之鱼', count: 1 }`
- `log_toolshed` += `{ itemId: 'att_foregrip', name: '垂直握把', count: 1 }`
- `dock_2`（二号浅滩钓台） += `{ itemId: 'fish_carp', name: '星露鲤鱼', count: 2 }`
- `dock_chest` += `{ itemId: 'fish_eel', name: '沼泽鳗鱼', count: 1 }, { itemId: 'fish_catfish', name: '裂隙鲶鱼', count: 1 }, { itemId: 'med_bloodbag', name: '血袋', count: 1 }`
- `aby_herb` += `{ itemId: 'fish_crimson', name: '绯红锦鲤', count: 1 }`
- `fac_shelves` += `{ itemId: 'att_extmag', name: '扩容弹匣', count: 1 }`
- `fac_ammo` += `{ itemId: 'ammo_762', name: '7.62mm穿甲弹×30', count: 2 }, { itemId: 'ammo_9mm', name: '9mm手枪弹×30', count: 2 }, { itemId: 'ammo_shell', name: '12号霰弹×10', count: 1 }, { itemId: 'ammo_signal', name: '信号枪弹×10', count: 2 }, { itemId: 'helmet_t3', name: '3级防弹头盔', count: 1 }, { itemId: 'vest_t3', name: '3级防弹背心', count: 1 }`
- `st_bus`（侧翻公交车） += `{ itemId: 'wp_mp5', name: 'MP5冲锋枪', count: 1 }`
- `gas_van`（站长货车） += `{ itemId: 'wp_m870', name: 'M870霰弹枪', count: 1 }`
- `deep_ammo` += `{ itemId: 'wp_akm', name: 'AKM突击步枪', count: 1 }, { itemId: 'vest_t4', name: '4级重型背心', count: 1 }`
- `aby_cache` += `{ itemId: 'wp_plasma', name: '破界等离子步枪', count: 1 }, { itemId: 'collect_dogtag', name: '阵亡者身份牌', count: 1 }`
- `st_pharmacy` += `{ itemId: 'med_medkit', name: '纳米医疗包', count: 1 }, { itemId: 'med_painkiller', name: '止痛药', count: 2 }, { itemId: 'helmet_t2', name: '2级战术头盔', count: 1 }`
- `q_powder` += `{ itemId: 'throw_smoke', name: '烟雾弹×2', count: 1 }, { itemId: 'throw_flash', name: '闪光弹×2', count: 1 }`
- `gas_tanker` += `{ itemId: 'throw_molly', name: '燃烧瓶×2', count: 1 }`
- `aby_scrap` += `{ itemId: 'att_suppressor', name: '消音器', count: 1 }`
- `q_stone_1`（大型露天花岗岩矿床） += `{ itemId: 'ore_silver', name: '银矿石', count: 4 }`
- `peak_ore` += `{ itemId: 'ore_gold', name: '金矿石', count: 4 }`
- `aby_core` += `{ itemId: 'ore_iridium', name: '铱矿石', count: 2 }`
- `deep_herb`（佣兵草药包） += `{ itemId: 'crop_blueberry', name: '蓝莓×3', count: 2 }`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/items.test.ts src/game/collection.test.ts src/game/maps.test.ts -v`
Expected: PASS（items 16 + collection 4 + maps 17）。

Run: `npx tsc --noEmit`
Expected: PASS，无输出。

Run: `npx vitest run -v`
Expected: PASS，全量 11 文件 110+ 通过。

- [ ] **Step 5: Commit**

```bash
git add src/game/items.ts src/game/items.test.ts src/game/collection.ts src/game/collection.test.ts src/game/maps.ts src/game/maps.test.ts src/App.tsx src/components/WorkbenchModal.tsx src/components/InventoryModal.tsx docs/superpowers/plans/2026-10-15-item-expansion-stardew-delta.md
git commit -m "fix(items): close reachability gaps from final review"
```

---

## Self-Review

**1. Spec coverage：**
- “物品过少” → Task1注册表+Task2-6共66种新ID，总数≥85，Task9终局计数锁验证。
- “参考星露谷” → Task2种子/作物/矿物+SEED_GROW种植锁+品质加价（银1.25/金1.5/铱2.0），Task3鱼6种+加工5种+烹饪3种+COOK_SOURCE材料锁+FOOD_VALUE差异化恢复。
- “参考三角洲” → Task4弹药5口径+枪7把伤害梯+升级链（扩容匣→M4），Task5甲3盔+4背心护盾梯+医疗5级+投掷4种，Task6配件4（全进升级配方）+房卡2（红/蓝房解锁）+藏品4。
- “都有用处不是为加而加” → 用途矩阵锁定每组≥1消耗系统；Task2 SEED_GROW单测、Task3 COOK_SOURCE单测、Task8 CraftCost.extra+handleCraftSuccess扣料+hasExtra真背包校验，杜绝摆设。
- “藏品有稀有度有收集欲” → Task10 collection.ts四档稀有度+三套装加成+BOSS/红房掉落绑定+LootPanel金框+Inventory图鉴页。
- “全链路打通” → Task7地图8处掉落植入+RARITY/ICON/lootResourceOf代理，Task8 applyLoot/handleUseItem/工作台12配方/黑市8商品，Task9背包文案+全量回归+手动走图。

**2. Placeholder scan：** 全计划无 TBD/TODO/“类似Task N”/“适当处理”，每步含完整代码块与精确命令，类型与ID在Task1锁定后全计划复用同一拼写（`vest_t4`/`wp_svd`/`med_surgery`/`collect_mandel` 全文一致）。

**3. Type consistency：** `ItemDef.category` 七值贯穿 Task1-10；`LootResource` 在 Task1 `LootResourceNew` 定义17值，Task7 `maps.ts` 原样复刻；`WEAPON_DAMAGE/ARMOR_BONUS_TABLE/MED_HEAL/THROW_DAMAGE/FOOD_VALUE/SEED_GROW/COOK_SOURCE` 键名即物品ID，Task8查表键与Task2-6插入ID一一对应；`makeItem/getItemDef/qualitySellPrice` 签名全任务共用不变；`CraftCost.extra` 可选，旧12配方不带 extra 保持兼容；`collection.ts` 的 `CollectTier` 四值与 `TIER_COLOR` 键一一对应。

---

## 手动验证清单

- `npx vitest run -v` 全绿（含 items/collection/maps/compound/spawn/quests/home/visualTheme）
- `npx tsc --noEmit` 无输出
- `npm run dev` 进游戏按 Task9 六条走图验证（种植扣种→烹饪扣鱼→食用回血→图鉴套装）
