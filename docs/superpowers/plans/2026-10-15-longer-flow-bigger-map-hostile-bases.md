# 更长流程 × 更大地图 × 敌对独立基地 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把“8步新手即毕业、12张小图挤一圈、所有人共用营地基地”改成“三幕18步长流程、16张大图（含个人营地模板）、人人从零自建独立营地+可被突袭”。

**Architecture:** 新增 `src/game/diplomacy.ts`（敌对判定唯一真相，含个人营地实例规则）、`src/game/spawn.ts`（分散出生+野外地块）、`src/game/home.ts`（个人营地实例ID+归属+建造/突袭权限纯函数）四个纯函数模块先立单测；`server.ts` 做出生隔离+个人营地建筑隔离+pvp_hit透传+突袭门禁；`IsometricEngine.ts` 做敌对渲染+门禁+个人营地模板叠加；`maps.ts` 加3张野外新图+1张个人营地模板并把门距从±28外扩到±44；`App.tsx` 把questSteps从8扩展到18并把第二幕改成“回自家营地从零建造”。

**Tech Stack:** TypeScript + React 19 + Canvas2D IsometricEngine + Express + ws + Vitest 3 + `tsc --noEmit` + `vite build`。

---

## File Structure

| 文件 | 职责 | 改动性质 |
|---|---|---|
| `src/game/diplomacy.ts`（新建，约60行） | 唯一真相：`isHostile/canOperateDoor/canDamageBuilding/canLootBox`，camp系永远中立，野外异ID即敌对 | Create |
| `src/game/diplomacy.test.ts`（新建） | 锁敌对规则：同ID不敌对、异玩家野外敌对、营地不敌对、NPC对所有人敌对 | Create |
| `src/game/spawn.ts`（新建，约70行） | 分散出生点+基地地块表：`SPAWN_POINTS/BASE_PLOTS/spawnForIndex/basePlotForIndex/isCampMap` | Create |
| `src/game/spawn.test.ts`（新建） | 锁8个出生点互不重叠、基地地块分图分位、营地判定 | Create |
| `src/game/quests.ts`（新建，约120行） | 三幕18任务定义：`ACT1/ACT2/ACT3/ALL_QUESTS/questDoneCount/nextQuest`，Act2已改为个人营地线 | Create |
| `src/game/home.ts`（新建，约80行） | 个人营地唯一真相：`homeMapIdFor/isHomeMap/parseHomeOwner/canBuildInHome/canRaidInHome`，从零自建+空间隔离+可突袭 | Create |
| `src/game/home.test.ts`（新建） | 锁实例ID格式、归属解析、主人可建/访客不可建、主人免突袭/访客须突袭 | Create |
| `src/game/quests.test.ts`（新建） | 锁18任务ID唯一、三幕数量8/6/4、进度计数 | Create |
| `src/types/game.ts:347-373` | 加 `NetMessageType` 的 `'pvp_hit'`，加 `OnlinePlayer.spawnIndex?: number` | Modify |
| `server.ts:1-15,226-260` | 加import、出生分散、pvp_hit透传、building_placed归属补全、raid自家门拒绝 | Modify |
| `src/game/NetworkManager.ts:140-177` | 加 `sendPvpHit/pvp回调onPvpHit` | Modify |
| `src/game/IsometricEngine.ts` | 加敌对描边+门禁+远程玩家伤害应用（`applyPvpHit`），不动碰撞/寻路 | Modify |
| `src/game/maps.ts:43-789` | 门距外扩±28→±44 + 加3野外新图 `town_factory/mtn_peak/marsh_abyss` + 加1个人营地模板 `home_base` + 改4处gate rewiring | Modify |
| `src/game/maps.test.ts` | 追加密封性/门连通性回归（新图3个院必闭合、全图互达） | Modify |
| `src/App.tsx:1471-1580,1581-1650` | questSteps 8→18 + 新增5个state + 接线onBuildingPlaced/onRaidResult/onMonsterKilled | Modify |
| `src/components/WorldMapModal.tsx:134-228` | 新图自动出现（读SUBMAPS即可）+ 敌对角标（ownerName含`·`即玩家领地显示🚩） | Modify |

设计决策（锁定）：

- 公共营地3图（`camp_plaza/camp_workshop/camp_outskirts`）永远SAFE中立：不允许PvP，不允许拆他人建筑，`camp_plaza`中央锚点/公共箱保持system共有。公共营地退化为中立枢纽+新手集结，不再是任何人的家。
- 人人从零自建独立营地：每人拥有独立实例 `home_<playerId>`（模板见 `SUBMAPS['home_base']`，出生即空：只有1座1级锚点残核，无工作台无墙无门）。归属人进入自己空间只看到自己的建筑（模板+自己所建）；敌对玩家可通过“突袭TA营地”传送进该实例，看到该实例全量建筑并可突袭，但不可直接开门/开箱/建造。
- 个人营地敌对规则：实例内主人对自家建筑永远不敌对；访客对主人建筑永远敌对（即使访客站在自己家里打别人家逻辑同理）；PvP在个人营地实例内允许（主人可防守，访客可杀主人，主人也可杀访客）；公共营地内永远不允许PvP。`废土遗迹`残墙/野箱视为无主可搜不敌对，避免新手寸步难行。
- 野外9→12图默认敌对：不同 `ownerId` 即敌对，NPC（`npc_*`）对所有玩家敌对。野外地块（`BASE_PLOTS`）保留为“前哨”玩法，不强制，Act2主线只认个人营地。
- 不做公会/结盟/停战协议，不做基地无敌盾，不做离线保护。YAGNI：敌对=布尔值，无阵营表；个人营地不做密码锁/白名单，只靠突袭强度守。
- 地图变大不靠改引擎Tile大小，只靠：门距外扩 + 实体散布半径翻倍 + 新增3野外图+1营地模板。每图仍是单屏+传送门结构，不做无缝大世界，避免重写相机/碰撞。
- 流程变长不加新货币/新装备：只加任务线+2个新怪+1个新BOSS变体（复用现有数值函数 `killReward`），避免经济重调。

---

### Task 1: 敌对判定唯一真相 `diplomacy.ts`

**Files:**
- Create: `src/game/diplomacy.ts`
- Create: `src/game/diplomacy.test.ts`
- Test: `src/game/diplomacy.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/diplomacy.test.ts`，完整内容如下（直接复制可用）：

```ts
import { describe, expect, it } from 'vitest';
import { isHostile, canOperateDoor, canDamageBuilding, isCampMap } from './diplomacy';

describe('diplomacy hostile core', () => {
  it('same player is never hostile', () => {
    expect(isHostile('player_a', 'player_a', 'town_ruins')).toBe(false);
  });
  it('different players are hostile in wild, neutral in camp', () => {
    expect(isHostile('player_a', 'player_b', 'town_ruins')).toBe(true);
    expect(isHostile('player_a', 'player_b', 'camp_plaza')).toBe(false);
    expect(isHostile('player_a', 'player_b', 'camp_workshop')).toBe(false);
    expect(isHostile('player_a', 'player_b', 'camp_outskirts')).toBe(false);
  });
  it('system and ruins are never hostile (neutral props)', () => {
    expect(isHostile('player_a', 'system', 'town_ruins')).toBe(false);
    expect(isHostile('player_a', '废土遗迹', 'town_ruins')).toBe(false);
    expect(isHostile('player_a', undefined, 'town_ruins')).toBe(false);
  });
  it('npc factions are hostile to everyone in wild', () => {
    expect(isHostile('player_a', 'npc_raider_boss', 'town_ruins')).toBe(true);
    expect(isHostile('player_a', 'npc_forest_syndicate', 'mtn_deep')).toBe(true);
  });
  it('door operate: owner or neutral only', () => {
    expect(canOperateDoor('player_a', { ownerId: 'player_a', type: 'safe_door' })).toBe(true);
    expect(canOperateDoor('player_a', { ownerId: 'player_b', type: 'safe_door' })).toBe(false);
    expect(canOperateDoor('player_a', { ownerId: 'system', type: 'door' })).toBe(false);
  });
  it('damage: camp never, wild enemy yes, self no', () => {
    expect(canDamageBuilding('player_a', 'player_b', 'town_ruins')).toBe(true);
    expect(canDamageBuilding('player_a', 'player_b', 'camp_plaza')).toBe(false);
    expect(canDamageBuilding('player_a', 'player_a', 'town_ruins')).toBe(false);
    expect(canDamageBuilding('player_a', 'system', 'town_ruins')).toBe(false);
  });
  it('camp map set is exactly 3 maps', () => {
    expect(isCampMap('camp_plaza')).toBe(true);
    expect(isCampMap('camp_workshop')).toBe(true);
    expect(isCampMap('camp_outskirts')).toBe(true);
    expect(isCampMap('town_ruins')).toBe(false);
    expect(isCampMap('marsh_rift')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/diplomacy.test.ts --reporter=verbose`
Expected: FAIL with `Error: Failed to resolve import "./diplomacy"`（文件还不存在，先红是对的）。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/diplomacy.ts`，完整内容如下（直接复制可用）：

```ts
import type { MapZoneId } from '../types/game';

/** 营地中立3图：永远不敌对、不允许PvP、不允许拆他人建筑 */
const CAMP_MAPS: ReadonlySet<MapZoneId> = new Set(['camp_plaza', 'camp_workshop', 'camp_outskirts']);

export function isCampMap(mapId: MapZoneId): boolean {
  return CAMP_MAPS.has(mapId);
}

/** 无主/系统/遗迹视为中立布景，不敌对 */
function isNeutralOwner(ownerId?: string): boolean {
  if (!ownerId) return true;
  if (ownerId === 'system') return true;
  if (ownerId === '废土遗迹') return true;
  if (ownerId === '恒界开拓团') return true;
  if (ownerId === '遗落先锋') return true;
  return false;
}

/** 野外异ID即敌对；营地永远不敌对；同ID不敌对；中立布景不敌对 */
export function isHostile(viewerId: string, ownerId: string | undefined, mapId: MapZoneId): boolean {
  if (!ownerId) return false;
  if (viewerId === ownerId) return false;
  if (isNeutralOwner(ownerId)) return false;
  if (isCampMap(mapId)) return false;
  return true;
}

/** 门操作：只有 owner 本人能直接开关；其余一律走突袭 */
export function canOperateDoor(viewerId: string, b: { ownerId?: string; type: string }): boolean {
  if (b.type !== 'door' && b.type !== 'safe_door') return false;
  return !!b.ownerId && b.ownerId === viewerId;
}

/** 建筑伤害：营地一律不允许；野外只允许打敌对；自己/中立不允许 */
export function canDamageBuilding(viewerId: string, ownerId: string | undefined, mapId: MapZoneId): boolean {
  if (isCampMap(mapId)) return false;
  if (!ownerId) return false;
  if (viewerId === ownerId) return false;
  if (isNeutralOwner(ownerId)) return false;
  return true;
}

/** 野箱可搜：无主/遗迹/系统可搜；玩家箱只允许主人搜（敌方箱靠破门后解锁搜） */
export function canLootBox(viewerId: string, ownerId?: string): boolean {
  if (!ownerId) return true;
  if (isNeutralOwner(ownerId)) return true;
  return viewerId === ownerId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/diplomacy.test.ts --reporter=verbose`
Expected: PASS，`Tests 7 passed (7)`。

Run: `npm run lint`
Expected: exit 0 无输出。

- [ ] **Step 5: Commit**

```bash
git add src/game/diplomacy.ts src/game/diplomacy.test.ts
git commit -m "feat(diplomacy): hostile rules with camp-neutral guarantee"
```

---

### Task 2: 分散出生 + 基地地块 `spawn.ts`

**Files:**
- Create: `src/game/spawn.ts`
- Create: `src/game/spawn.test.ts`
- Test: `src/game/spawn.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/spawn.test.ts`，完整内容如下：

```ts
import { describe, expect, it } from 'vitest';
import { SPAWN_POINTS, BASE_PLOTS, spawnForIndex, basePlotForIndex } from './spawn';

describe('spawn dispersal', () => {
  it('has 8 spawn points, all in camp_plaza, pairwise 2+ apart', () => {
    expect(SPAWN_POINTS).toHaveLength(8);
    for (const s of SPAWN_POINTS) expect(s.mapId).toBe('camp_plaza');
    for (let i = 0; i < SPAWN_POINTS.length; i++) {
      for (let j = i + 1; j < SPAWN_POINTS.length; j++) {
        const d = Math.hypot(SPAWN_POINTS[i].x - SPAWN_POINTS[j].x, SPAWN_POINTS[i].y - SPAWN_POINTS[j].y);
        expect(d).toBeGreaterThanOrEqual(2);
      }
    }
  });
  it('spawnForIndex wraps around', () => {
    expect(spawnForIndex(0)).toEqual(SPAWN_POINTS[0]);
    expect(spawnForIndex(8)).toEqual(SPAWN_POINTS[0]);
    expect(spawnForIndex(9)).toEqual(SPAWN_POINTS[1]);
  });
  it('has 8 base plots spread across 4 wild maps, each plot 8+ apart within same map', () => {
    expect(BASE_PLOTS).toHaveLength(8);
    const byMap = new Map<string, typeof BASE_PLOTS>();
    for (const p of BASE_PLOTS) {
      const arr = byMap.get(p.mapId) ?? [];
      arr.push(p);
      byMap.set(p.mapId, arr);
    }
    expect(byMap.size).toBeGreaterThanOrEqual(4);
    for (const [, arr] of byMap) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const d = Math.hypot(arr[i].x - arr[j].x, arr[i].y - arr[j].y);
          expect(d).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });
  it('basePlotForIndex wraps and keeps mapId', () => {
    const a = basePlotForIndex(0);
    const b = basePlotForIndex(8);
    expect(a).toEqual(b);
    expect(a.mapId).toBe(BASE_PLOTS[0].mapId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/spawn.test.ts --reporter=verbose`
Expected: FAIL with `Failed to resolve import "./spawn"`。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/spawn.ts`，完整内容如下：

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/spawn.test.ts src/game/diplomacy.test.ts --reporter=verbose`
Expected: PASS，`Tests 11 passed`（7+4）。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/spawn.ts src/game/spawn.test.ts
git commit -m "feat(spawn): dispersed spawns and 8 wild base plots"
```

---

### Task 3: 三幕任务定义 `quests.ts`（先把长流程钉死）

**Files:**
- Create: `src/game/quests.ts`
- Create: `src/game/quests.test.ts`
- Test: `src/game/quests.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/quests.test.ts`，完整内容如下：

```ts
import { describe, expect, it } from 'vitest';
import { ACT1_QUESTS, ACT2_QUESTS, ACT3_QUESTS, ALL_QUESTS, questDoneCount, nextQuestId } from './quests';

describe('quests three acts', () => {
  it('act sizes are 8/6/4 and total 18 with unique ids', () => {
    expect(ACT1_QUESTS).toHaveLength(8);
    expect(ACT2_QUESTS).toHaveLength(6);
    expect(ACT3_QUESTS).toHaveLength(4);
    expect(ALL_QUESTS).toHaveLength(18);
    const ids = ALL_QUESTS.map((q) => q.id);
    expect(new Set(ids).size).toBe(18);
  });
  it('act1 keeps legacy 8 ids for App compat', () => {
    expect(ACT1_QUESTS.map((q) => q.id)).toEqual(['move', 'wood', 'stone', 'scrap', 'workbench', 'pickaxe', 'eat', 'kill']);
  });
  it('act2 is territory arc, act3 is boss arc', () => {
    expect(ACT2_QUESTS.map((q) => q.id)).toEqual(['claim', 'safedoor', 'rifle', 'raid_npc', 'elite', 'turret']);
    expect(ACT3_QUESTS.map((q) => q.id)).toEqual(['boss1', 'darkcore', 'level10', 'fortress']);
  });
  it('questDoneCount and nextQuestId work', () => {
    expect(questDoneCount(new Set(['move', 'wood']))).toBe(2);
    expect(nextQuestId(new Set(['move']))).toBe('wood');
    expect(nextQuestId(new Set(ALL_QUESTS.map((q) => q.id)))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/quests.test.ts --reporter=verbose`
Expected: FAIL with `Failed to resolve import "./quests"`。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/quests.ts`，完整内容如下：

```ts
export interface QuestDef {
  id: string;
  act: 1 | 2 | 3;
  title: string;
  desc: string;
  hint: string;
}

/** 第一幕：沿用 App 现有8步，一字不改（保证存量兼容） */
export const ACT1_QUESTS: QuestDef[] = [
  { id: 'move', act: 1, title: '走出第一步', desc: 'WASD/方向键或右键点地移动，离开出生点。', hint: '离开出生点2.5格' },
  { id: 'wood', act: 1, title: '野外伐木 ×10', desc: '去黑松伐木场/商业街枯树/渔港白杨按 E 砍伐。', hint: '累计10木' },
  { id: 'stone', act: 1, title: '野外采石 ×10', desc: '去北岭采石场/渔港滩涂岩按 E 开采。', hint: '累计10石' },
  { id: 'scrap', act: 1, title: '搜刮废铁 ×10', desc: '去加油站/商业街拆事故车/翻货架。', hint: '累计10废铁' },
  { id: 'workbench', act: 1, title: '建造工作台', desc: '[B]进入建造→设施→工作台，放下去。', hint: '放下工作台' },
  { id: 'pickaxe', act: 1, title: '制造开山镐', desc: '靠近工作台按 F：8木+6石。', hint: '做出开山镐' },
  { id: 'eat', act: 1, title: '吃一顿好的', desc: '钓鱼/烤肉干，点击快捷栏进食。', hint: '进食1次' },
  { id: 'kill', act: 1, title: '首杀蚀体', desc: '做把土铳+弹药，猎杀1只。', hint: '击杀1' },
];

/** 第二幕：领地（解决“共用基地”：必须去野外自建自守） */
export const ACT2_QUESTS: QuestDef[] = [
  { id: 'claim', act: 2, title: '圈一块野外地', desc: '去任务指引的8大地块任选一块，打开建造模式站上去。', hint: '到达任意BASE_PLOTS 3格内' },
  { id: 'safedoor', act: 2, title: '立起防爆安全门', desc: '建造→防爆安全门（10石+20废铁+4零件），你的基地从此可被突袭也可防守。', hint: '放置safe_door 1扇' },
  { id: 'rifle', act: 2, title: '造出战术步枪', desc: '工作台制造土铳→搜刮/交易攒出步枪，野外才有话语权。', hint: '获得rifle' },
  { id: 'raid_npc', act: 2, title: '首次突袭NPC据点', desc: '带C4去废墟居民区/黑松深林，对NPC安全门造成任意伤害。', hint: 'raid_attempt 1次' },
  { id: 'elite', act: 2, title: '猎杀精英蚀体', desc: '击杀1只 maxHp≥550 的精英（恶瘴魑/巨熊）。', hint: '精英击杀1' },
  { id: 'turret', act: 2, title: '架起防御塔', desc: '建造→电击塔（15废铁+2零件），基地首次拥有自动火力。', hint: '放置turret 1座' },
];

/** 第三幕：裂隙领主（长流程收束，Boss链） */
export const ACT3_QUESTS: QuestDef[] = [
  { id: 'boss1', act: 3, title: '直面深渊霸主', desc: '去裂隙前线击杀深渊霸主·恶瘴巨兽（1600HP）。', hint: '击杀领主BOSS' },
  { id: 'darkcore', act: 3, title: '带回暗物质晶核', desc: '开启遗落先锋宝箱或破门缴获，获得12暗物质晶核。', hint: 'dark_core×12' },
  { id: 'level10', act: 3, title: '成长为Lv.10行者', desc: '野外练级+交任务，升到10级（+90生命/+45护盾）。', hint: 'Lv≥10' },
  { id: 'fortress', act: 3, title: '要塞守住一夜', desc: '基地拥有安全门+4墙+1塔且HP全满，即毕业。', hint: '基地完整度100%' },
];

export const ALL_QUESTS: QuestDef[] = [...ACT1_QUESTS, ...ACT2_QUESTS, ...ACT3_QUESTS];

export function questDoneCount(done: Set<string>): number {
  let n = 0;
  for (const q of ALL_QUESTS) if (done.has(q.id)) n++;
  return n;
}

export function nextQuestId(done: Set<string>): string | null {
  for (const q of ALL_QUESTS) if (!done.has(q.id)) return q.id;
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/quests.test.ts --reporter=verbose`
Expected: PASS，`Tests 4 passed (4)`。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/quests.ts src/game/quests.test.ts
git commit -m "feat(quests): three-act 18-quest definitions"
```

---

### Task 4: 服务端——分散出生 + PvP透传 + 建筑归属门禁

**Files:**
- Modify: `src/types/game.ts:282-302,347-373`
- Modify: `server.ts:35-60,226-260,305-340,390-430`
- Modify: `src/game/NetworkManager.ts:29-60,140-177,178-234`
- Test: `src/game/diplomacy.test.ts`（复用）+ 手动 `node --check`

- [ ] **Step 1: Write the failing test**

本任务无新增纯函数，用 Task 1 单测做门禁锁 + 新增一次全量回归确认红线：

Run: `npx vitest run src/game/diplomacy.test.ts src/game/spawn.test.ts src/game/quests.test.ts --reporter=verbose`
Expected: PASS（15 passed）。若有红，先修前序 Task，不在本任务打补丁。

- [ ] **Step 2: Run test to verify baseline green**

Run: `npm run lint`
Expected: exit 0（基线干净再动手改 server）。

- [ ] **Step 3: Write minimal implementation**

3a. `src/types/game.ts`：在 `OnlinePlayer` 加 `spawnIndex`，在 `NetMessageType` 加 `'pvp_hit'`。找到 `export interface OnlinePlayer {` 块，在 `currentAction?: string;` 下一行插入：

```ts
  spawnIndex?: number;
```

找到 `export type NetMessageType =` 块，在 `'pong';` 上一行插入：

```ts
  | 'pvp_hit'
```

完整改后两处为：

```ts
export interface OnlinePlayer {
  id: string;
  name: string;
  level: number;
  title: string;
  avatarSeed: string;
  x: number;
  y: number;
  angle: number;
  mapId: MapZoneId;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  isFiring: boolean;
  isDashing: boolean;
  color: string;
  ping: number;
  lastSeen: number;
  currentAction?: string;
  spawnIndex?: number;
}
```

```ts
export type NetMessageType =
  | 'init'
  | 'player_sync'
  | 'player_joined'
  | 'player_left'
  | 'player_action'
  | 'building_placed'
  | 'building_damaged'
  | 'building_destroyed'
  | 'raid_attempt'
  | 'raid_result'
  | 'chat'
  | 'weather_update'
  | 'weather_set'
  | 'gm_auth'
  | 'gm_auth_result'
  | 'monster_sync'
  | 'monster_killed'
  | 'ping'
  | 'pong'
  | 'pvp_hit';
```

3b. `server.ts`：分散出生。找到 `wss.on('connection', (ws: WebSocket, req) => {` 下的 `const playerId = ...` 三行，在 `const newPlayer: OnlinePlayer = {` 之前插入：

```ts
  const spawnIndex = clients.size % 8;
  const SPAWN_XY: [number, number][] = [[-6, -6], [6, -6], [-6, 6], [6, 6], [0, -9], [0, 9], [-9, 0], [9, 0]];
  const [sx, sy] = SPAWN_XY[spawnIndex % SPAWN_XY.length];
```

并把 `newPlayer` 的 `x: (Math.random() - 0.5) * 3,` 改为 `x: sx,`，`y: (Math.random() - 0.5) * 3,` 改为 `y: sy,`，在 `currentAction: '徒手求生',` 下一行加：

```ts
    spawnIndex,
```

3c. `server.ts`：`building_placed` 强制归属。找到 `case 'building_placed': {` 块内的 `ownerId: playerId,` 那一行，保持不变（已经是发送者ID），在其上一行确认 `mapId: bData.mapId || client.player.mapId,` 存在即可；新增营地保护：在 `worldBuildings.push(newBuilding);` 上一行插入：

```ts
          const CAMP = ['camp_plaza', 'camp_workshop', 'camp_outskirts'];
          if (CAMP.includes(String(newBuilding.mapId)) && newBuilding.type === 'safe_door') {
            newBuilding.name = (bData.name || '防御建筑') + '（中立·不可突袭）';
          }
```

3d. `server.ts`：`raid_attempt` 拒绝自家门+拒绝营地门。在 `const target = worldBuildings.find((b) => b.id === targetId);` 之后、`if (!target)` 之前不动；在 `if (!target) {` 块结束后的下一行插入：

```ts
          const CAMP_MAPS = ['camp_plaza', 'camp_workshop', 'camp_outskirts'];
          if (target.ownerId === playerId) {
            ws.send(JSON.stringify({ type: 'raid_result', payload: { error: '不能突袭自己的门，用 F 直接开关' } }));
            return;
          }
          if (CAMP_MAPS.includes(String(target.mapId))) {
            ws.send(JSON.stringify({ type: 'raid_result', payload: { error: '营地为中立区，不可突袭' } }));
            return;
          }
```

3e. `server.ts`：新增 `pvp_hit` 透传。在 `case 'ping': {` 上一行插入整个 case：

```ts
        case 'pvp_hit': {
          const { targetId, damage } = msg.payload || {};
          const target = clients.get(targetId);
          if (!target) break;
          if (target.player.mapId !== client.player.mapId) break;
          const CAMP_PVP = ['camp_plaza', 'camp_workshop', 'camp_outskirts'];
          if (CAMP_PVP.includes(String(client.player.mapId))) break;
          if (target.ws.readyState === WebSocket.OPEN) {
            target.ws.send(JSON.stringify({
              type: 'pvp_hit',
              payload: { attackerId: playerId, attackerName: client.player.name, damage: Math.max(1, Math.floor(damage || 10)) },
              timestamp: Date.now(),
            }));
          }
          break;
        }
```

3f. `src/game/NetworkManager.ts`：加发送+回调。`NetworkCallbacks` 接口末尾 `onGMStatus` 下一行加：

```ts
  onPvpHit?: (hit: { attackerId: string; attackerName: string; damage: number }) => void;
```

在 `public requestWeather` 方法后插入：

```ts
  public sendPvpHit(targetId: string, damage: number) {
    this.send({ type: 'pvp_hit', payload: { targetId, damage } });
  }
```

在 `handleMessage` 的 `case 'pong':` 块后、`}` 关闭switch前插入：

```ts
      case 'pvp_hit': {
        this.callbacks.onPvpHit?.(msg.payload);
        break;
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/diplomacy.test.ts src/game/spawn.test.ts src/game/quests.test.ts --reporter=verbose`
Expected: PASS，15 passed（实现未改纯函数，只改server/网络，不应变红）。

Run: `npm run lint`
Expected: exit 0。

Run: `npx tsc --noEmit`
Expected: exit 0（`pvp_hit` 类型已加入联合类型，无报错）。

- [ ] **Step 5: Commit**

```bash
git add src/types/game.ts server.ts src/game/NetworkManager.ts
git commit -m "feat(server): dispersed spawns, camp raid-block, pvp_hit relay"
```

---

### Task 5: 客户端战斗门禁——敌对描边 + 门/箱/PvP伤害

**Files:**
- Modify: `src/game/IsometricEngine.ts:1-17,1201-1246,1290-1420`
- Modify: `src/App.tsx:652-760`
- Test: `npx vitest run` 全量回归

- [ ] **Step 1: Write the failing test**

渲染无新增单测，用全量回归做红线：

Run: `npx vitest run --reporter=verbose`
Expected: PASS（diplomacy 7 + spawn 4 + quests 4 + compound 5 + maps 10 + combat 20+ 全绿）。有红先修，不进 Step 3。

- [ ] **Step 2: Run lint baseline**

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 3: Write minimal implementation**

3a. `src/game/IsometricEngine.ts` 文件头加 import。找到 `import { groupBuildingsIntoHouses, houseCorners, HOUSE_WALL_H } from './house';` 下一行插入：

```ts
import { isHostile, canOperateDoor } from './diplomacy';
```

3b. 新增 `applyPvpHit` 方法。在 `public reloadWeapon() {` 上一行插入（2空格缩进，直接复制）：

```ts
  public applyPvpHit(damage: number, attackerName: string) {
    const now = this.gameTime;
    if (now < this.invulnUntil) return;
    const reduced = Math.max(1, Math.floor(damage * (1 - this.armorReduction)));
    if (this.player.shield > 0) {
      const soaked = Math.min(this.player.shield, reduced);
      this.player.shield -= soaked;
      this.player.hp -= (reduced - soaked);
    } else {
      this.player.hp -= reduced;
    }
    this.hurtFlash = 0.6;
    this.shake = Math.min(8, this.shake + 4);
    this.shieldRegenAt = now + 5;
    this.addTextParticle(this.player.x, this.player.y - 1.6, `-${reduced}! 来自 ${attackerName}`, '#f87171');
    if (this.player.hp <= 0) {
      this.player.hp = this.player.maxHp;
      this.player.shield = this.player.maxShield;
      this.warpToMap('camp_plaza', 0, 9, '被击倒·营地苏醒');
      this.addTextParticle(0, 8, '你被敌对玩家击倒，已在营地苏醒（物品保留）', '#facc15');
    }
  }
```

3c. 门禁：敌方门走突袭。找到 `triggerInteraction()` 内的 `if (this.nearestBuilding.type === 'safe_door') {` 块，把其中的 `const isOwner = this.nearestBuilding.ownerId === this.localPlayerId;` 那一行替换为：

```ts
        const isOwner = canOperateDoor(this.localPlayerId, { ownerId: this.nearestBuilding.ownerId, type: 'safe_door' });
```

`door` 普通门同样处理：找到 `if (this.nearestBuilding.type === 'door') {` 块首行，在其下一行插入守卫：

```ts
        if (this.nearestBuilding.ownerId && this.nearestBuilding.ownerId !== this.localPlayerId && !isHostile(this.localPlayerId, this.nearestBuilding.ownerId, this.currentMapId)) {
          this.addTextParticle(this.nearestBuilding.x, this.nearestBuilding.y - 1.0, '中立建筑，无需破拆', '#94a3b8');
          return;
        }
        if (this.nearestBuilding.ownerId && this.nearestBuilding.ownerId !== this.localPlayerId && isHostile(this.localPlayerId, this.nearestBuilding.ownerId, this.currentMapId)) {
          soundManager.playClick();
          this.callbacks.onOpenRaidModal?.(this.nearestBuilding);
          return;
        }
```

3d. 敌对描边：在 `drawBuilding` 的血条绘制处加红边。找到 `this.drawBuildingHp(` 调用行，在其上一行插入：

```ts
    if (isHostile(this.localPlayerId, b.ownerId, this.currentMapId) && (b.type === 'safe_door' || b.type.includes('wall') || b.type === 'turret')) {
      const s = this.toScreen(b.x, b.y);
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(239,68,68,0.9)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(s.x - 18, s.y - 52, 36, 40);
      this.ctx.restore();
    }
```

注意：`b` 为当前绘制建筑变量名，若 drawBuilding 参数名不是 `b` 而是 `building`，则把上面 `b.` 全换成对应参数名。只加描边，不改原有绘制顺序。

3e. `src/App.tsx` 接 `onPvpHit`。找到 `netManagerRef.current = netManager;` 上一行的 `onGMStatus: ... ,` 块尾，在 `},` 之前追加（注意逗号）：

```ts
      onPvpHit: (hit) => {
        engineRef.current?.applyPvpHit(hit.damage, hit.attackerName);
      },
```

完整上下文为：

```ts
      onGMStatus: (ok, error) => {
        if (ok) {
          setIsGM(true);
          pushSystemMsg('GM 身份已激活，顶栏出现「编辑」入口。');
        } else {
          setIsGM(false);
          try { sessionStorage.removeItem('sdc_gm_token'); } catch { /* ignore */ }
          pushSystemMsg(`GM 登录失败${error ? `：${error}` : '：口令错误'}。`);
        }
      },
      onPvpHit: (hit) => {
        engineRef.current?.applyPvpHit(hit.damage, hit.attackerName);
      },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --reporter=verbose`
Expected: 全绿，0 failed。

Run: `npm run lint`
Expected: exit 0。

Run: `npm run build`
Expected: `vite build` 成功。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/App.tsx
git commit -m "feat(client): hostile outlines, door gating, pvp damage apply"
```

---

### Task 6: 地图做大 part A——`town_factory` 新图 + 城镇门重连 + 门距外扩

**Files:**
- Modify: `src/game/maps.ts:177-256,256-346,346-429`
- Modify: `src/game/maps.test.ts:1-60`
- Test: `src/game/maps.test.ts`

- [ ] **Step 1: Write the failing test**

追加到 `src/game/maps.test.ts` 末尾（完整块，直接贴）：

```ts
describe('map expansion part A', () => {
  it('town_factory exists, HIGH risk, enclosed yard', async () => {
    const { SUBMAPS } = await import('./maps');
    const def = SUBMAPS['town_factory' as any];
    expect(def, 'town_factory missing').toBeDefined();
    expect(def.gates.length).toBeGreaterThanOrEqual(2);
  });
  it('town gates are expanded outward (>=40)', async () => {
    const { SUBMAPS } = await import('./maps');
    for (const id of ['town_gas', 'town_street', 'town_ruins']) {
      const def = SUBMAPS[id];
      const maxAbs = Math.max(...def.gates.map((g) => Math.max(Math.abs(g.x), Math.abs(g.y))));
      expect(maxAbs).toBeGreaterThanOrEqual(40);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/maps.test.ts -t "part A" --reporter=verbose`
Expected: FAIL with `town_factory missing`（新图还不存在）。

- [ ] **Step 3: Write minimal implementation**

3a. `src/game/maps.ts`：城镇三图门距外扩。做3处精确替换（一次一处）：

第1处 `town_gas` gates：把

```ts
    gates: [
      { x: -30, y: 0, targetMap: 'camp_workshop', targetX: 30, targetY: 0, name: '西侧营地检查站', icon: '🏕️', desc: '返回工坊区' },
      { x: 30, y: 0, targetMap: 'town_street', targetX: -30, targetY: 0, name: '东进商业街', icon: '🏙️', desc: '前往商业街' },
      { x: 10, y: 28, targetMap: 'town_ruins', targetX: -10, targetY: -28, name: '南下居民区', icon: '🧱', desc: '前往废墟居民区' },
    ],
```

替换为：

```ts
    gates: [
      { x: -44, y: 0, targetMap: 'camp_workshop', targetX: 44, targetY: 0, name: '西侧营地检查站', icon: '🏕️', desc: '返回工坊区' },
      { x: 44, y: 0, targetMap: 'town_street', targetX: -44, targetY: 0, name: '东进商业街', icon: '🏙️', desc: '前往商业街' },
      { x: 14, y: 42, targetMap: 'town_ruins', targetX: -14, targetY: -42, name: '南下居民区', icon: '🧱', desc: '前往废墟居民区' },
    ],
```

第2处 `town_street` gates：把

```ts
    gates: [
      { x: -30, y: 0, targetMap: 'town_gas', targetX: 30, targetY: 0, name: '西返加油站', icon: '⛽', desc: '返回77号加油站' },
      { x: 0, y: 30, targetMap: 'town_ruins', targetX: 0, targetY: -30, name: '南穿居民区', icon: '🧱', desc: '前往废墟居民区' },
    ],
```

替换为：

```ts
    gates: [
      { x: -44, y: 0, targetMap: 'town_gas', targetX: 44, targetY: 0, name: '西返加油站', icon: '⛽', desc: '返回77号加油站' },
      { x: 0, y: 42, targetMap: 'town_ruins', targetX: 0, targetY: -42, name: '南穿居民区', icon: '🧱', desc: '前往废墟居民区' },
      { x: 44, y: 0, targetMap: 'town_factory', targetX: -44, targetY: 0, name: '东进废弃工厂', icon: '🏭', desc: '前往废弃重工厂（新）' },
    ],
```

第3处 `town_ruins` gates：把

```ts
    gates: [
      { x: -10, y: -28, targetMap: 'town_gas', targetX: 10, targetY: 28, name: '北返加油站', icon: '⛽', desc: '返回77号加油站' },
      { x: 0, y: -28, targetMap: 'town_street', targetX: 0, targetY: 30, name: '北返商业街', icon: '🏙️', desc: '返回商业街' },
      { x: 30, y: 0, targetMap: 'marsh_rift', targetX: -30, targetY: 0, name: '省道断桥裂缝口', icon: '⚠️', desc: '深入裂隙前线（红区）' },
      { x: 20, y: -28, targetMap: 'mtn_deep', targetX: 8, targetY: 28, name: '翻山小道', icon: '⛰️', desc: '翻山前往黑松深林' },
    ],
```

替换为：

```ts
    gates: [
      { x: -14, y: -42, targetMap: 'town_gas', targetX: 14, targetY: 42, name: '北返加油站', icon: '⛽', desc: '返回77号加油站' },
      { x: 0, y: -42, targetMap: 'town_street', targetX: 0, targetY: 42, name: '北返商业街', icon: '🏙️', desc: '返回商业街' },
      { x: 44, y: 0, targetMap: 'marsh_rift', targetX: -44, targetY: 0, name: '省道断桥裂缝口', icon: '⚠️', desc: '深入裂隙前线（红区）' },
      { x: 28, y: -42, targetMap: 'mtn_deep', targetX: 12, targetY: 42, name: '翻山小道', icon: '⛰️', desc: '翻山前往黑松深林' },
      { x: -44, y: 0, targetMap: 'town_factory', targetX: 44, targetY: 0, name: '西进废弃工厂', icon: '🏭', desc: '前往废弃重工厂（新）' },
    ],
```

3b. 新增 `town_factory` 整图。在 `town_ruins: {` 定义上一行插入完整新图（直接复制，含闭合院 `fac_yard` + 6采集点 + 3怪）：

```ts
  town_factory: {
    id: 'town_factory' as any, region: 'town', name: '废弃重工厂', theme: 'urban',
    desc: '重工业废墟：废铁/零件/弹药富区，高危',
    risk: 'HIGH',
    gates: [
      { x: -44, y: 0, targetMap: 'town_street', targetX: 44, targetY: 0, name: '西返商业街', icon: '🏙️', desc: '返回商业街' },
      { x: 44, y: 0, targetMap: 'town_ruins', targetX: -44, targetY: 0, name: '东进居民区', icon: '🧱', desc: '前往废墟居民区' },
    ],
    interactables: [
      I('fac_press', '万吨冲压机残骸', 'car', -18, -16, '[E/F 破拆冲压机]', [
        { itemId: 'scrap', name: '重型冲压钢板', count: 50 },
        { itemId: 'part', name: '液压传动齿轮', count: 5 },
      ], 2.2),
      I('fac_shelves', '工厂配件货架', 'shelves', 16, -18, '[E/F 搜刮配件架]', [
        { itemId: 'part', name: '精密轴承', count: 6 },
        { itemId: 'scrap', name: '货架角钢', count: 25 },
      ], 1.6),
      I('fac_ammo', '工厂警卫弹药库', 'ammo_crate', 20, 14, '[E/F 破译弹药库]', [
        { itemId: 'ammo', name: '7.62mm 步枪穿甲弹药包', count: 60 },
        { itemId: 'c4_explosive', name: '高爆C4炸药', count: 2 },
      ], 1.8),
      I('fac_med', '工厂医务室', 'med_cabinet', -20, 12, '[E/F 搜刮医务室]', [
        { itemId: 'medkit', name: '纳米急救箱', count: 2 },
        { itemId: 'bandage', name: '工业绷带', count: 4 },
      ], 1.8),
      I('fac_truck', '厂区重卡', 'car', 0, 20, '[E/F 破拆厂区重卡]', [
        { itemId: 'scrap', name: '重卡废铁', count: 40 },
        { itemId: 'part', name: '发动机缸体', count: 3 },
      ], 2.0),
      I('fac_tree', '厂区枯杨', 'tree', -8, 24, '[E/F 砍伐枯杨]', woodLoot(30, '干枯厂杨木'), 1.6),
    ],
    monsters: [
      M('fac1', '变异公路漫游暴徒', -10, 0, 450, 2.0, 26),
      M('fac2', '蚀体·恶瘴魑精英', 12, -6, 620, 1.8, 34),
      M('fac3', '辐射畸变狂暴猎犬', 4, 18, 320, 2.7, 22),
    ],
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'fac_yard', cx: 0, cy: 0, w: 4, h: 2,
        wallType: 'iron_wall', wallName: '工厂铁围墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '工厂铁门',
        doorExtra: { isOpen: true, isLocked: false },
      }),
      { id: 'fac_yard_box', type: 'storage_box', name: '工厂门卫储物箱', x: 0, y: 0, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹' },
      {
        id: 'fac_yard_parts', type: 'storage_box', name: '工厂零件箱', x: -1, y: 0, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '精密轴承', count: 5, icon: '🔧' },
          { name: '重型冲压钢板', count: 15, icon: '⚙️' },
        ],
      },
    ],
    deco: [
      { x: 0, y: 0, w: 6, h: 4, type: 'foundation' },
      { x: -18, y: -16, w: 8, h: 6, type: 'rubble' },
      { x: 18, y: 16, w: 9, h: 7, type: 'crater' },
    ],
  },
```

注意：`id: 'town_factory' as any` 是因为 `MapZoneId` 联合类型还未加新ID，下个Task统一加类型，此处先as any保证编译通过。

3c. `src/types/game.ts` 加新ID。找到 `export type MapZoneId =` 块，把

```ts
  | 'marsh_docks' | 'marsh_bog' | 'marsh_rift'
```

替换为：

```ts
  | 'marsh_docks' | 'marsh_bog' | 'marsh_rift'
  | 'town_factory' | 'mtn_peak' | 'marsh_abyss'
```

并把 `town_factory` 定义的 `as any` 改回 `id: 'town_factory',`（类型已合法）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/maps.test.ts --reporter=verbose`
Expected: PASS（含新增 part A 2条）。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/maps.ts src/types/game.ts src/game/maps.test.ts
git commit -m "feat(map): town_factory plus town gate expansion to 44"
```

---

### Task 7: 地图做大 part B——`mtn_peak` + `marsh_abyss` + 山地湿地外扩

**Files:**
- Modify: `src/game/maps.ts:430-620,620-789`
- Modify: `src/game/maps.test.ts`
- Test: `src/game/maps.test.ts`

- [ ] **Step 1: Write the failing test**

追加到 `src/game/maps.test.ts` 末尾（直接贴）：

```ts
describe('map expansion part B', () => {
  it('mtn_peak and marsh_abyss exist with 2+ gates each', async () => {
    const { SUBMAPS } = await import('./maps');
    for (const id of ['mtn_peak', 'marsh_abyss'] as const) {
      const def = (SUBMAPS as any)[id];
      expect(def, `${id} missing`).toBeDefined();
      expect(def.gates.length).toBeGreaterThanOrEqual(2);
      expect(def.monsters.length).toBeGreaterThanOrEqual(3);
      expect(def.interactables.length).toBeGreaterThanOrEqual(4);
    }
  });
  it('all maps are mutually reachable via gates', async () => {
    const { SUBMAPS, MAP_IDS } = await import('./maps');
    const seen = new Set<string>(['camp_plaza']);
    const q = ['camp_plaza'];
    while (q.length) {
      const cur = q.pop()!;
      const def = (SUBMAPS as any)[cur];
      if (!def) continue;
      for (const g of def.gates) {
        if (!seen.has(g.targetMap)) { seen.add(g.targetMap); q.push(g.targetMap); }
      }
    }
    for (const id of MAP_IDS) expect(seen.has(id), `${id} unreachable`).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/maps.test.ts -t "part B" --reporter=verbose`
Expected: FAIL with `mtn_peak missing`。

- [ ] **Step 3: Write minimal implementation**

3a. 山地湿地门距外扩。做2处替换：

第1处 `mtn_logging` gates：把

```ts
    gates: [
      { x: 30, y: 0, targetMap: 'camp_outskirts', targetX: -30, targetY: 0, name: '南下外圩', icon: '🌾', desc: '返回城墙外圩' },
      { x: 0, y: -28, targetMap: 'mtn_quarry', targetX: 0, targetY: 28, name: '北上采石场', icon: '🪨', desc: '前往采石场' },
      { x: 28, y: 8, targetMap: 'mtn_deep', targetX: -28, targetY: -8, name: '林间小道', icon: '🌲', desc: '深入黑松深林' },
    ],
```

替换为：

```ts
    gates: [
      { x: 44, y: 0, targetMap: 'camp_outskirts', targetX: -44, targetY: 0, name: '南下外圩', icon: '🌾', desc: '返回城墙外圩' },
      { x: 0, y: -42, targetMap: 'mtn_quarry', targetX: 0, targetY: 42, name: '北上采石场', icon: '🪨', desc: '前往采石场' },
      { x: 42, y: 12, targetMap: 'mtn_deep', targetX: -42, targetY: -12, name: '林间小道', icon: '🌲', desc: '深入黑松深林' },
    ],
```

第2处 `marsh_docks` gates：把

```ts
    gates: [
      { x: 0, y: -30, targetMap: 'camp_outskirts', targetX: 0, targetY: 30, name: '北岭渡口归营', icon: '🏕️', desc: '返回城墙外圩' },
      { x: 28, y: 0, targetMap: 'marsh_bog', targetX: -28, targetY: 0, name: '东侧沼泽小径', icon: '🌊', desc: '前往沼泽' },
    ],
```

替换为：

```ts
    gates: [
      { x: 0, y: -42, targetMap: 'camp_outskirts', targetX: 0, targetY: 42, name: '北岭渡口归营', icon: '🏕️', desc: '返回城墙外圩' },
      { x: 42, y: 0, targetMap: 'marsh_bog', targetX: -42, targetY: 0, name: '东侧沼泽小径', icon: '🌊', desc: '前往沼泽' },
    ],
```

第3处 `mtn_quarry` 加通往peak的门：找到

```ts
    gates: [
      { x: 0, y: 28, targetMap: 'mtn_logging', targetX: 0, targetY: -28, name: '南下伐木场', icon: '🌲', desc: '返回黑松伐木场' },
      { x: 28, y: 0, targetMap: 'mtn_deep', targetX: -28, targetY: 0, name: '东进深林', icon: '🌲', desc: '深入黑松深林' },
    ],
```

替换为：

```ts
    gates: [
      { x: 0, y: 42, targetMap: 'mtn_logging', targetX: 0, targetY: -42, name: '南下伐木场', icon: '🌲', desc: '返回黑松伐木场' },
      { x: 42, y: 0, targetMap: 'mtn_deep', targetX: -42, targetY: 0, name: '东进深林', icon: '🌲', desc: '深入黑松深林' },
      { x: 0, y: -42, targetMap: 'mtn_peak', targetX: 0, targetY: 42, name: '北攀雪峰垭口', icon: '🏔️', desc: '攀登黑松雪峰（新·高危）' },
    ],
```

第4处 `marsh_rift` 加通往abyss的门：找到

```ts
    gates: [
      { x: 0, y: -28, targetMap: 'marsh_bog', targetX: 0, targetY: 28, name: '北撤沼泽', icon: '🌊', desc: '撤回泥沼泽' },
      { x: -30, y: 0, targetMap: 'town_ruins', targetX: 30, targetY: 0, name: '省道断桥', icon: '🧱', desc: '撤往废墟居民区' },
      { x: -20, y: 20, targetMap: 'camp_plaza', targetX: 0, targetY: 0, name: '空间锚定跃迁', icon: '🏕️', desc: '紧急跃迁回营地广场' },
    ],
```

替换为：

```ts
    gates: [
      { x: 0, y: -42, targetMap: 'marsh_bog', targetX: 0, targetY: 42, name: '北撤沼泽', icon: '🌊', desc: '撤回泥沼泽' },
      { x: -44, y: 0, targetMap: 'town_ruins', targetX: 44, targetY: 0, name: '省道断桥', icon: '🧱', desc: '撤往废墟居民区' },
      { x: -30, y: 30, targetMap: 'camp_plaza', targetX: 0, targetY: 0, name: '空间锚定跃迁', icon: '🏕️', desc: '紧急跃迁回营地广场' },
      { x: 30, y: 30, targetMap: 'marsh_abyss', targetX: -30, targetY: -30, name: '下潜深渊裂口', icon: '🕳️', desc: '下潜深渊裂隙（新·极危）' },
    ],
```

3b. 在 `marsh_rift: {` 定义上一行插入 `mtn_peak`，在文件末尾 `};`（SUBMAPS闭合）上一行插入 `marsh_abyss`。两图完整定义如下（直接复制）：

```ts
  mtn_peak: {
    id: 'mtn_peak', region: 'mountain', name: '黑松雪峰', theme: 'quarry',
    desc: '雪线垭口：石料/铁矿富区，巨熊与精英盘踞',
    risk: 'HIGH',
    gates: [
      { x: 0, y: 42, targetMap: 'mtn_quarry', targetX: 0, targetY: -42, name: '南下采石场', icon: '🪨', desc: '返回北岭采石场' },
      { x: 42, y: 0, targetMap: 'mtn_deep', targetX: -42, targetY: 0, name: '东进深林', icon: '🌲', desc: '深入黑松深林' },
    ],
    interactables: [
      I('peak_ore', '雪峰富铁矿脉', 'boulder', -20, -18, '[E/F 开采富铁矿]', [
        { itemId: 'stone', name: '雪峰花岗石', count: 40 },
        { itemId: 'iron_ore', name: '高品位铁矿', count: 10 },
      ], 1.8),
      I('peak_wood', '雪线枯松', 'tree', 18, -14, '[E/F 砍伐雪松]', woodLoot(35, '雪松硬木'), 1.6),
      I('peak_cache', '登山队遗留补给箱', 'box', 0, 20, '[E/F 搜刮登山箱]', [
        { itemId: 'food', name: '高能登山口粮', count: 8 },
        { itemId: 'bandage', name: '防冻绷带', count: 4 },
      ], 1.6),
      I('peak_powder', '雪峰炸药棚', 'ammo_crate', -16, 16, '[E/F 搜刮炸药棚]', [
        { itemId: 'c4_explosive', name: '雪峰开山炸药', count: 3 },
        { itemId: 'ammo', name: '信号枪弹', count: 20 },
      ], 1.8),
    ],
    monsters: [
      M('pk1', '密林蚀化狂暴巨熊', -12, -6, 720, 1.9, 38),
      M('pk2', '蚀体·恶瘴魑精英', 10, -8, 620, 1.8, 34),
      M('pk3', '蚀化幼体', 0, 14, 260, 2.3, 16),
    ],
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'peak_hut', cx: 12, cy: 10, w: 4, h: 2,
        wallType: 'stone_wall', wallName: '雪峰石屋残墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '石屋铁门',
        doorExtra: { isOpen: true, isLocked: false },
      }),
      { id: 'peak_hut_box', type: 'storage_box', name: '雪峰石屋储物箱', x: 12, y: 10, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹' },
    ],
    deco: [
      { x: 12, y: 10, w: 6, h: 4, type: 'foundation' },
      { x: -20, y: -18, w: 8, h: 6, type: 'rockery' },
    ],
  },
```

```ts
  marsh_abyss: {
    id: 'marsh_abyss', region: 'marsh', name: '深渊裂口', theme: 'rift',
    desc: '第二红区：晶石/暗核/次级领主，毕业前哨战',
    risk: 'EXTREME',
    gates: [
      { x: -30, y: -30, targetMap: 'marsh_rift', targetX: 30, targetY: 30, name: '北撤裂隙前线', icon: '⚠️', desc: '返回裂隙前线' },
      { x: 30, y: 0, targetMap: 'camp_plaza', targetX: 0, targetY: 0, name: '空间锚定跃迁', icon: '🏕️', desc: '紧急跃迁回营地' },
    ],
    interactables: [
      I('aby_core', '深渊小异象', 'crystal', 0, 0, '[E/F 提取深渊原晶]', [
        { itemId: 'shard', name: '深渊紫晶', count: 5 },
        { itemId: 'plasma', name: '虚空高能等离子聚合体', count: 3 },
      ], 2.5),
      I('aby_cache', '深渊遗落补给箱', 'box', 16, 16, '[E/F 解锁深渊箱]', [
        { itemId: 'dark_core', name: '坍界暗物质晶核', count: 8 },
        { itemId: 'credits', name: '高级信用凭证', count: 1800 },
        { itemId: 'rifle', name: '战术突击步枪', count: 1 },
      ], 2.2),
      I('aby_herb', '深渊荧光苔', 'box', -16, 12, '[E/F 采集荧光苔]', [
        { itemId: 'bandage', name: '荧光止血苔', count: 4 },
        { itemId: 'food', name: '荧光菌菇', count: 6 },
      ], 1.6),
      I('aby_scrap', '坠毁无人机堆', 'car', -12, -16, '[E/F 拆解无人机]', [
        { itemId: 'scrap', name: '航空铝废料', count: 40 },
        { itemId: 'part', name: '无人机飞控芯片', count: 4 },
      ], 2.0),
    ],
    monsters: [
      M('ab1', '深渊亚领主·蚀骸巨兽 (次级BOSS)', 0, -8, 1200, 2.2, 42),
      M('ab2', '多足蚀化潜行兽', -14, 8, 480, 2.5, 28),
      M('ab3', '虚空撕裂幼体', 12, -10, 320, 2.6, 20),
    ],
    buildings: [
      { id: 'aby_cover_1', type: 'iron_wall', name: '深渊掩体残墙', x: 6, y: 6, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋', facing: 'ew' },
      { id: 'aby_cover_2', type: 'iron_wall', name: '深渊掩体残墙', x: 7, y: 6, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋', facing: 'ew' },
      { id: 'aby_cover_3', type: 'iron_wall', name: '深渊掩体残墙', x: 6, y: 7, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋', facing: 'ns' },
    ],
    deco: [
      { x: 6, y: 6, w: 5, h: 4, type: 'foundation' },
      { x: 0, y: 0, w: 9, h: 7, type: 'crater' },
    ],
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/maps.test.ts --reporter=verbose`
Expected: PASS（含 part A 2 + part B 2 + 原有10+，总数≥14）。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/maps.ts src/game/maps.test.ts
git commit -m "feat(map): mtn_peak and marsh_abyss plus reachability guard"
```

---

### Task 8: 长流程接线——App 8步→18步 + 基地/突袭/BOSS状态

**Files:**
- Modify: `src/App.tsx:190-203,863-897,815-858,1471-1580`
- Test: `src/game/quests.test.ts` + `npx vitest run`

- [ ] **Step 1: Write the failing test**

本任务逻辑在 React state，无新增纯函数单测。用 quests 单测做红线：

Run: `npx vitest run src/game/quests.test.ts --reporter=verbose`
Expected: PASS（4 passed，基线绿再动手）。

- [ ] **Step 2: Verify App baseline builds**

Run: `npm run build`
Expected: 成功（改前基线能编过）。

- [ ] **Step 3: Write minimal implementation**

3a. 新增追踪 state。在 `const [pickaxeCrafted, setPickaxeCrafted] = useState(false);` 下一行插入：

```tsx
  const [safeDoorBuilt, setSafeDoorBuilt] = useState(false);
  const [turretBuilt, setTurretBuilt] = useState(false);
  const [rifleOwned, setRifleOwned] = useState(false);
  const [raidHit, setRaidHit] = useState(false);
  const [eliteKilled, setEliteKilled] = useState(false);
  const [bossKilled, setBossKilled] = useState(false);
  const [darkCoreGot, setDarkCoreGot] = useState(false);
  const [claimedPlot, setClaimedPlot] = useState(false);
```

3b. `onBuildingPlaced` 接安全门/塔计数。找到：

```tsx
        grantXp(20);
        if (type === 'workbench') setWorkbenchBuilt(true);
```

替换为：

```tsx
        grantXp(20);
        if (type === 'workbench') setWorkbenchBuilt(true);
        if (type === 'safe_door') setSafeDoorBuilt(true);
        if (type === 'turret') setTurretBuilt(true);
```

3c. `onMonsterKilled` 接精英/BOSS。找到：

```tsx
      onMonsterKilled: (monsterName: string, monsterMaxHp?: number) => {
        setKillCount((prev) => prev + 1);
```

在 `setKillCount` 下一行插入：

```tsx
        if ((monsterMaxHp ?? 0) >= 550) setEliteKilled(true);
        if (monsterName.includes('深渊霸主') || monsterName.includes('领主BOSS')) setBossKilled(true);
        if (monsterName.includes('蚀骸巨兽')) setBossKilled(true);
```

3d. 突袭命中接线。找到 `onRaidResult: (raidEvent: RaidEvent) => {` 块，在 `soundManager.playHit(raidEvent.isCritical);` 下一行插入：

```tsx
        if (!raidEvent.payload?.error) setRaidHit(true);
```

注意：`raidEvent` 即 payload 本体（NetworkManager 透传 `msg.payload`），若 `raid_result` 为 `{error}` 则 App 的 `raidEvent.targetId` 为 undefined，此时上面 `engine.buildings.find` 会落空但不崩；`setRaidHit` 只在有 `targetId` 时置位。更稳妥写法为：

```tsx
        if ((raidEvent as any)?.targetId) setRaidHit(true);
```

采用后者，替换上一步插入行。

3e. 步枪/暗核/圈地接线。在 `syncInterval` 的 `setRadarEntities({...})` 之后、`setSquadMembers` 之前插入：

```tsx
      const hasRifle = hotbarSlotsRef.current.some((s) => s?.id === 'rifle' || s?.id === 'crude_gun');
      if (hasRifle) setRifleOwned(true);
      if (playerStatsRef.current.shards >= 12) setDarkCoreGot(true);
      const { BASE_PLOTS } = await import('./game/spawn').catch(() => ({ BASE_PLOTS: [] as any[] }));
```

注意：`syncInterval` 回调不是 async，不能 await。改用同步方案：文件头加 import，回调内直接用：

文件头 `import { killReward, WEAPONS, ARMOR_REDUCTION } from './game/combat';` 下一行加：

```tsx
import { BASE_PLOTS } from './game/spawn';
```

回调内插入（`setRadarEntities` 后）：

```tsx
      if (hotbarSlotsRef.current.some((s) => s?.id === 'rifle')) setRifleOwned(true);
      if (playerStatsRef.current.shards >= 12) setDarkCoreGot(true);
      const px = eng.player.x, py = eng.player.y;
      if (!claimedPlot && BASE_PLOTS.some((p) => Math.hypot(px - p.x, py - p.y) < 3)) setClaimedPlot(true);
```

但 `claimedPlot` 在闭包内需 ref。简化：用函数式 set + 条件短路，React 会在 true 后不再 set（加守卫）：

```tsx
      setRifleOwned((v) => v || hotbarSlotsRef.current.some((s) => s?.id === 'rifle'));
      setDarkCoreGot((v) => v || playerStatsRef.current.shards >= 12);
      setClaimedPlot((v) => v || BASE_PLOTS.some((p) => Math.hypot(eng.player.x - p.x, eng.player.y - p.y) < 3));
```

3f. questSteps 8→18。在 `// 新手引路 8 步` 注释下现有8项数组末尾（`kill` 项的 `},` 之后、`];` 之前）追加10项：

```tsx
    {
      id: 'claim',
      title: '圈一块野外地',
      desc: '去8大地块任选一块站上去3秒（M看地图，渔港/伐木场/商业街都有地）。',
      progressText: claimedPlot ? '1/1' : '0/1',
      done: claimedPlot,
    },
    {
      id: 'safedoor',
      title: '立起防爆安全门',
      desc: '[B]建造→安全门（10石+20废铁+4零件），野外基地从此可守可被突袭。',
      progressText: safeDoorBuilt ? '1/1' : '0/1',
      done: safeDoorBuilt,
    },
    {
      id: 'rifle',
      title: '造出战术步枪',
      desc: '工作台+搜刮攒出步枪（rifle），土铳不算毕业。',
      progressText: rifleOwned ? '1/1' : '0/1',
      done: rifleOwned,
    },
    {
      id: 'raid_npc',
      title: '首次突袭NPC据点',
      desc: '带C4对废墟/深林NPC安全门造成任意伤害。',
      progressText: raidHit ? '1/1' : '0/1',
      done: raidHit,
    },
    {
      id: 'elite',
      title: '猎杀精英蚀体',
      desc: '击杀1只≥550HP精英（恶瘴魑/巨熊/工厂精英）。',
      progressText: eliteKilled ? '1/1' : '0/1',
      done: eliteKilled,
    },
    {
      id: 'turret',
      title: '架起防御塔',
      desc: '[B]建造→电击塔（15废铁+2零件）。',
      progressText: turretBuilt ? '1/1' : '0/1',
      done: turretBuilt,
    },
    {
      id: 'boss1',
      title: '直面深渊霸主',
      desc: '去裂隙前线击杀深渊霸主（1600HP），组队更稳。',
      progressText: bossKilled ? '1/1' : '0/1',
      done: bossKilled,
    },
    {
      id: 'darkcore',
      title: '带回暗物质晶核',
      desc: '开深渊箱/破门缴获，晶石≥12。',
      progressText: darkCoreGot ? '1/1' : '0/1',
      done: darkCoreGot,
    },
    {
      id: 'level10',
      title: '成长为Lv.10行者',
      desc: '野外练级+交任务升到10级。',
      progressText: `Lv.${playerStats.level}/10`,
      done: playerStats.level >= 10,
    },
    {
      id: 'fortress',
      title: '要塞守住一夜',
      desc: '同时拥有安全门+防御塔+精英击杀，即毕业。',
      progressText: safeDoorBuilt && turretBuilt && eliteKilled ? '1/1' : '0/1',
      done: safeDoorBuilt && turretBuilt && eliteKilled,
    },
```

并把注释 `// 新手引路 8 步` 改为 `// 三幕18步：Act1新手8 + Act2领地6 + Act3领主4`。

3g. 奖励表追加。在 `useEffect` 的 `rewards: Record<string, () => void>` 内 `kill: () => {...},` 之后追加：

```tsx
      claim: () => grantXp(60),
      safedoor: () => { grantXp(120); setPlayerStats((p) => ({ ...p, credits: p.credits + 200 })); },
      rifle: () => grantXp(120),
      raid_npc: () => { grantXp(150); setPlayerStats((p) => ({ ...p, shards: p.shards + 3 })); },
      elite: () => { grantXp(200); setPlayerStats((p) => ({ ...p, credits: p.credits + 300 })); },
      turret: () => grantXp(120),
      boss1: () => { grantXp(500); setPlayerStats((p) => ({ ...p, credits: p.credits + 1000, shards: p.shards + 6 })); },
      darkcore: () => grantXp(300),
      level10: () => { grantXp(300); setPlayerStats((p) => ({ ...p, title: '裂隙行者' })); },
      fortress: () => { grantXp(500); pushSystemMsg('🎓 三幕毕业！你是真正的裂隙领主，深渊裂口等你常驻。'); },
```

并把 `useEffect` 依赖数组末尾追加 `, safeDoorBuilt, turretBuilt, rifleOwned, raidHit, eliteKilled, bossKilled, darkCoreGot, claimedPlot, playerStats.level`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --reporter=verbose`
Expected: 全绿。

Run: `npm run lint`
Expected: exit 0。

Run: `npm run build`
Expected: 成功。

手动：`npm run dev` → M地图应见15图（4区域：营地3/城镇4/山地4/湿地4），QuestPanel显示 `0/18` 起步，做完8步后出现“圈一块野外地”。

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(quests): wire 18-step three-act flow to base, raid, boss states"
```

---

### Task 9: 个人营地核心 `home.ts`——实例ID+权限唯一真相

**Files:**
- Create: `src/game/home.ts`
- Create: `src/game/home.test.ts`
- Test: `src/game/home.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/home.test.ts`，完整内容如下（直接复制可用）：

```ts
import { describe, expect, it } from 'vitest';
import { homeMapIdFor, isHomeMap, parseHomeOwner, canBuildInHome, canRaidInHome } from './home';

describe('home instance core', () => {
  it('homeMapIdFor prefixes player id', () => {
    expect(homeMapIdFor('player_abc123')).toBe('home_player_abc123');
  });
  it('isHomeMap detects instance, not template confusion', () => {
    expect(isHomeMap('home_player_abc123')).toBe(true);
    expect(isHomeMap('home_base')).toBe(false);
    expect(isHomeMap('town_ruins')).toBe(false);
    expect(isHomeMap('camp_plaza')).toBe(false);
  });
  it('parseHomeOwner round-trips', () => {
    expect(parseHomeOwner('home_player_abc123')).toBe('player_abc123');
    expect(parseHomeOwner('town_ruins')).toBeNull();
    expect(parseHomeOwner('home_base')).toBeNull();
  });
  it('only owner can build in own home', () => {
    expect(canBuildInHome('player_a', 'home_player_a')).toBe(true);
    expect(canBuildInHome('player_b', 'home_player_a')).toBe(false);
    expect(canBuildInHome('player_a', 'town_ruins')).toBe(true);
  });
  it('visitor must raid, owner never raids own door', () => {
    expect(canRaidInHome('player_a', 'home_player_a', 'player_a')).toBe(false);
    expect(canRaidInHome('player_b', 'home_player_a', 'player_a')).toBe(true);
    expect(canRaidInHome('player_b', 'town_ruins', 'player_a')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/home.test.ts --reporter=verbose`
Expected: FAIL with `Failed to resolve import "./home"`（文件还不存在，先红是对的）。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/home.ts`，完整内容如下（直接复制可用）：

```ts
/** 个人营地实例：mapId = `home_<ownerPlayerId>`；模板为 `home_base`（SUBMAPS占位，不直接进入） */

export function homeMapIdFor(playerId: string): string {
  return `home_${playerId}`;
}

export function isHomeMap(mapId: string): boolean {
  if (mapId === 'home_base') return false;
  return mapId.startsWith('home_') && mapId.length > 5;
}

/** 解析实例归属，模板与野外返回 null */
export function parseHomeOwner(mapId: string): string | null {
  if (!isHomeMap(mapId)) return null;
  const owner = mapId.slice(5);
  return owner.length > 0 ? owner : null;
}

/** 建造权限：个人营地内只有主人能建；野外/营地保持原规则（返回 true，具体配额由 App/Engine 再判） */
export function canBuildInHome(viewerId: string, mapId: string): boolean {
  const owner = parseHomeOwner(mapId);
  if (!owner) return true;
  return viewerId === owner;
}

/** 突袭权限：个人营地内访客可突袭主人建筑，主人不可突袭自己；野外沿用旧规则（返回 true） */
export function canRaidInHome(viewerId: string, mapId: string, targetOwnerId: string | undefined): boolean {
  const owner = parseHomeOwner(mapId);
  if (!owner) return true;
  if (!targetOwnerId) return false;
  if (viewerId === targetOwnerId) return false;
  return targetOwnerId === owner;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/home.test.ts --reporter=verbose`
Expected: PASS，`Tests 5 passed (5)`。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/home.ts src/game/home.test.ts
git commit -m "feat(home): personal camp instance id and permission truth"
```

---

### Task 10: 个人营地模板 + 敌对规则补丁 + 类型放行

**Files:**
- Modify: `src/game/maps.ts:12-18,43-65`
- Modify: `src/game/diplomacy.ts:7-33`
- Modify: `src/types/game.ts:195-203`
- Modify: `src/game/spawn.test.ts`（追回不破坏旧断言）
- Test: `src/game/home.test.ts` + `src/game/diplomacy.test.ts`

- [ ] **Step 1: Write the failing test**

追加到 `src/game/diplomacy.test.ts` 末尾（完整块，直接贴）：

```ts
describe('diplomacy home instance patch', () => {
  it('visitor is hostile to owner buildings inside owner home', async () => {
    const { isHostile } = await import('./diplomacy');
    expect(isHostile('player_b', 'player_a', 'home_player_a' as any)).toBe(true);
    expect(isHostile('player_a', 'player_a', 'home_player_a' as any)).toBe(false);
    expect(isHostile('player_a', 'player_b', 'home_player_a' as any)).toBe(false);
  });
  it('camp neutral still holds for 3 public maps', async () => {
    const { isCampMap } = await import('./diplomacy');
    expect(isCampMap('camp_plaza' as any)).toBe(true);
    expect(isCampMap('home_player_a' as any)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/diplomacy.test.ts -t "home instance" --reporter=verbose`
Expected: FAIL，第一条 `expected false to be true`（旧 `isHostile` 不认识 `home_` 前缀，把它当野外异ID？实际旧逻辑会对 `home_player_a` 返回 true 给第一项，但第三项 `isHostile('player_a','player_b','home_player_a')` 旧逻辑返回 true，与期望 false 不符，先红是对的）。

- [ ] **Step 3: Write minimal implementation**

3a. `src/types/game.ts` 放行实例ID。找到 `export type MapZoneId =` 块，把

```ts
  | 'town_factory' | 'mtn_peak' | 'marsh_abyss'
```

替换为：

```ts
  | 'town_factory' | 'mtn_peak' | 'marsh_abyss'
  | 'home_base' | `home_${string}`
```

`RegionId` 保持不变（个人营地复用 `camp` 地域展示）。

3b. `src/game/diplomacy.ts` 补个人营地规则。在文件末尾追加（直接复制）：

```ts
/** 个人营地实例归属：`home_<ownerId>` 解析，模板与非实例返回 null */
export function parseHomeOwnerId(mapId: string): string | null {
  if (mapId === 'home_base') return null;
  if (!mapId.startsWith('home_')) return null;
  const owner = mapId.slice(5);
  return owner.length > 0 ? owner : null;
}
```

并把 `isHostile` 函数体替换为（完整替换，直接复制覆盖原函数）：

```ts
/** 野外异ID即敌对；营地永远不敌对；个人营地内只对实例主人敌对；同ID不敌对；中立布景不敌对 */
export function isHostile(viewerId: string, ownerId: string | undefined, mapId: MapZoneId): boolean {
  if (!ownerId) return false;
  if (viewerId === ownerId) return false;
  if (isNeutralOwner(ownerId)) return false;
  if (isCampMap(mapId)) return false;
  const homeOwner = parseHomeOwnerId(String(mapId));
  if (homeOwner) {
    return ownerId === homeOwner;
  }
  return true;
}
```

把 `canDamageBuilding` 函数体替换为（完整替换）：

```ts
/** 建筑伤害：公共营地一律不允许；个人营地内只允许打实例主人建筑；野外只允许打敌对；自己/中立不允许 */
export function canDamageBuilding(viewerId: string, ownerId: string | undefined, mapId: MapZoneId): boolean {
  if (isCampMap(mapId)) return false;
  if (!ownerId) return false;
  if (viewerId === ownerId) return false;
  if (isNeutralOwner(ownerId)) return false;
  const homeOwner = parseHomeOwnerId(String(mapId));
  if (homeOwner) {
    return ownerId === homeOwner;
  }
  return true;
}
```

3c. `src/game/maps.ts` 加 `home_base` 模板。在 `camp_plaza: {` 定义上一行插入（直接复制，从零开始：只有1座1级锚点残核，无工作台无墙）：

```ts
  home_base: {
    id: 'home_base', region: 'camp', name: '个人营地（模板）', theme: 'field',
    desc: '模板：实际进入的是 home_<你的ID> 独立实例，从零自建，可被突袭',
    risk: 'SAFE',
    gates: [
      { x: 0, y: -42, targetMap: 'camp_plaza', targetX: 0, targetY: 9, name: '回中立营地广场', icon: '🏕️', desc: '返回公共营地' },
    ],
    interactables: [
      I('home_rubble', '营地荒地碎石堆', 'boulder', 10, 8, '[E/F 敲取开荒石料]', stoneLoot(25, '开荒碎石'), 1.8),
      I('home_deadwood', '营地枯木', 'tree', -10, 8, '[E/F 砍伐开荒枯木]', woodLoot(25, '开荒枯木'), 1.6),
    ],
    monsters: [],
    buildings: [
      { id: 'home_anchor_tpl', type: 'anchor_core', name: '残破锚点残核（Lv.1·需重建）', x: 0.0, y: -6.0, hp: 1200, maxHp: 1200, level: 1, ownerName: '待认领' },
    ],
    deco: [
      { x: 0, y: 0, w: 14, h: 12, type: 'foundation' },
    ],
  },
```

注意：模板 `ownerName: '待认领'` + `ownerId` 缺省，运行时 engine/server 用实例主人覆盖，不入库。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/diplomacy.test.ts src/game/home.test.ts --reporter=verbose`
Expected: PASS，diplomacy 9 + home 5，共14 passed。

Run: `npm run lint`
Expected: exit 0。

Run: `npx tsc --noEmit`
Expected: exit 0（`home_${string}` 模板字面量已放行）。

- [ ] **Step 5: Commit**

```bash
git add src/game/diplomacy.ts src/game/maps.ts src/types/game.ts src/game/diplomacy.test.ts
git commit -m "feat(home): home_base template plus hostile patch for instances"
```

---

### Task 11: 个人营地联通——服务端隔离 + 引擎叠加 + 突袭入口 + 任务改线

**Files:**
- Modify: `server.ts:49-65,340-390,391-430`
- Modify: `src/game/IsometricEngine.ts:211-260,266-322`
- Modify: `src/game/NetworkManager.ts:140-177`
- Modify: `src/App.tsx:190-203,1125-1132,1471-1580`
- Modify: `src/components/OnlinePlayersModal.tsx` + `src/components/WorldMapModal.tsx`
- Test: 全量 `vitest` + `lint` + `build`

- [ ] **Step 1: Write the failing test**

本任务无新增纯函数，用已有单测做红线：

Run: `npx vitest run src/game/home.test.ts src/game/diplomacy.test.ts src/game/spawn.test.ts src/game/quests.test.ts --reporter=verbose`
Expected: PASS（5+9+4+4=22 passed，基线绿再动手）。

- [ ] **Step 2: Run baseline build**

Run: `npm run build`
Expected: 成功（改前基线能编过）。

- [ ] **Step 3: Write minimal implementation**

3a. `server.ts`：个人营地建筑隔离（实例ID即隔离键，无需额外表）。找到 `case 'building_placed': {` 块，在 `worldBuildings.push(newBuilding);` 上一行已有的营地保护下追加：

```ts
          const isHomeInst = String(newBuilding.mapId).startsWith('home_') && String(newBuilding.mapId) !== 'home_base';
          if (isHomeInst) {
            const instOwner = String(newBuilding.mapId).slice(5);
            if (instOwner !== playerId) {
              ws.send(JSON.stringify({ type: 'raid_result', payload: { error: '只能在自己营地建造，去突袭页进入对方营地只能破拆' } }));
              return;
            }
          }
          if (String(newBuilding.mapId) === 'home_base') {
            ws.send(JSON.stringify({ type: 'raid_result', payload: { error: '模板不可建造，请回自己的 home_ 实例' } }));
            return;
          }
```

`raid_attempt` 追加个人营地规则：在 Task 4 已插入的营地拒绝块之后追加：

```ts
          const targetMapStr = String(target.mapId);
          const isHomeTarget = targetMapStr.startsWith('home_') && targetMapStr !== 'home_base';
          if (isHomeTarget) {
            const instOwner = targetMapStr.slice(5);
            if (target.ownerId !== instOwner) {
              ws.send(JSON.stringify({ type: 'raid_result', payload: { error: '该建筑不属于该营地实例主人' } }));
              return;
            }
            if (playerId === instOwner) {
              ws.send(JSON.stringify({ type: 'raid_result', payload: { error: '不能突袭自己的营地，用 F 直接开关' } }));
              return;
            }
          }
```

`pvp_hit` 放行个人营地：在 Task 4 的 `const CAMP_PVP = [...]` 下一行，把

```ts
          if (CAMP_PVP.includes(String(client.player.mapId))) break;
```

替换为：

```ts
          if (CAMP_PVP.includes(String(client.player.mapId))) break;
          if (String(client.player.mapId) === 'home_base') break;
```

个人营地实例（`home_<id>`）不拦，允许主人与访客互伤。

3b. `src/game/IsometricEngine.ts`：个人营地模板叠加。找到 `private initEntitiesForMap(mapId: MapZoneId) {` 内的

```ts
    const def = SUBMAPS[mapId] ?? SUBMAPS['camp_plaza'];
```

替换为：

```ts
    const isHomeInst = String(mapId).startsWith('home_') && String(mapId) !== 'home_base';
    const tplId = isHomeInst ? 'home_base' : mapId;
    const def = (SUBMAPS as any)[tplId] ?? SUBMAPS['camp_plaza'];
```

在该函数 `this.mapWaypoints = ...` 赋值后、`// 编辑器覆盖` 注释前插入：

```ts
    if (isHomeInst) {
      const instOwner = String(mapId).slice(5);
      for (const b of this.buildings) {
        if (b.id === 'home_anchor_tpl') {
          b.ownerId = instOwner;
          b.ownerName = instOwner === this.localPlayerId ? '我的营地' : `玩家营地·${instOwner.slice(-4)}`;
        }
      }
      const cached = (this as any)._serverBuildings as import('../types/game').BuildingEntity[] | undefined;
      if (cached) {
        const mine = cached.filter((x) => String(x.mapId) === String(mapId));
        for (const m of mine) {
          if (!this.buildings.some((x) => x.id === m.id)) this.buildings.push({ ...m });
        }
      }
    }
```

并在 `onBuildingPlaced` 回调处（`tryPlaceBuilding` 末尾 `this.buildings.push(newBuilding);` 下一行）追加缓存同步：

```ts
    const sb = ((this as any)._serverBuildings ?? []) as import('../types/game').BuildingEntity[];
    sb.push({ ...newBuilding });
    (this as any)._serverBuildings = sb;
```

在 `NetworkManager onBuildingPlaced` 的 App 回调里同样缓存一份（见3d）。

3c. `src/game/NetworkManager.ts`：加访营请求（复用 player_sync 的 mapId 字段，无需新消息类型）。在 `public sendPvpHit` 方法后插入：

```ts
  public visitHome(targetPlayerId: string) {
    this.send({ type: 'player_sync', payload: { mapId: `home_${targetPlayerId}` as any, x: 0, y: 9 } });
  }
  public goHome(selfId: string) {
    this.send({ type: 'player_sync', payload: { mapId: `home_${selfId}` as any, x: 0, y: 9 } });
  }
```

服务端 `player_sync` 已透传 `mapId`，无需改 server 即可实现“进入对方实例”（建筑按 mapId 隔离天然生效）。

3d. `src/App.tsx`：任务改线到个人营地 + 突袭入口。在文件头 `import { BASE_PLOTS } from './game/spawn';` 下一行加：

```tsx
import { homeMapIdFor } from './game/home';
```

`handleSelectMapZone` 支持实例ID：找到

```tsx
  const handleSelectMapZone = useCallback((zoneId: MapZoneId) => {
    setCurrentMapId(zoneId);
```

替换为：

```tsx
  const handleSelectMapZone = useCallback((zoneId: MapZoneId) => {
    setCurrentMapId(zoneId as MapZoneId);
```

新增两个回调（放在 `handleSelectMapZone` 下一行，直接复制）：

```tsx
  const handleGoHome = useCallback(() => {
    if (!selfId) return;
    const hid = homeMapIdFor(selfId) as MapZoneId;
    setCurrentMapId(hid);
    if (engineRef.current) engineRef.current.warpToMap(hid, 0, 9, '回家·个人营地');
    netManagerRef.current?.goHome(selfId);
  }, [selfId]);

  const handleVisitHome = useCallback((targetId: string, targetName: string) => {
    const hid = homeMapIdFor(targetId) as MapZoneId;
    setCurrentMapId(hid);
    if (engineRef.current) engineRef.current.warpToMap(hid, 0, 9, `突袭·${targetName}的营地`);
    netManagerRef.current?.visitHome(targetId);
    pushSystemMsg(`⚠️ 已潜入 [${targetName}] 的个人营地实例，只能破拆不能建造，祝好运。`);
  }, [pushSystemMsg]);
```

`onBuildingPlaced` 缓存同步：找到 `netManagerRef.current.placeBuilding({` 块，在该调用后、`return true;` 前插入：

```tsx
        const eb = engineRef.current as any;
        if (eb && Array.isArray(eb._serverBuildings)) {
          eb._serverBuildings.push({ id: `b_${Date.now()}`, type, x: Math.round(eb.mouse.worldX), y: Math.round(eb.mouse.worldY), mapId: currentMapId, ownerId: selfId });
        }
```

questSteps 改线：把 `claim` 项的

```tsx
      desc: '去8大地块任选一块站上去3秒（M看地图，渔港/伐木场/商业街都有地）。',
```

替换为：

```tsx
      desc: '点“回家”进入你的 home_ 独立营地（从零开始，只有一座残核），站上去即认领。',
```

并把 Task 8 的圈地判定改为个人营地判定：找到 Task 8 插入的

```tsx
      setClaimedPlot((v) => v || BASE_PLOTS.some((p) => Math.hypot(eng.player.x - p.x, eng.player.y - p.y) < 3));
```

替换为：

```tsx
      setClaimedPlot((v) => v || String(currentMapIdRef.current).startsWith('home_'));
```

注意 `currentMapIdRef` 已在 App 顶部定义（`const currentMapIdRef = useRef(currentMapId)`），直接可用，无需新 ref。`BASE_PLOTS` import 保留（野外前哨玩法仍用，不删）。

把 `safedoor` 项的

```tsx
      desc: '[B]建造→安全门（10石+20废铁+4零件），野外基地从此可守可被突袭。',
```

替换为：

```tsx
      desc: '在自家营地内[B]建造→安全门（10石+20废铁+4零件），访客只能破拆。',
```

把 `fortress` 项的

```tsx
      desc: '同时拥有安全门+防御塔+精英击杀，即毕业。',
```

替换为：

```tsx
      desc: '自家营地内同时拥有安全门+防御塔+精英击杀，即毕业。',
```

3e. 突袭入口 UI。`src/components/OnlinePlayersModal.tsx`：在每行玩家操作区加“突袭TA营地”按钮，找到 `onInviteToSquad` 按钮行，在其同一 flex 容器内追加：

```tsx
            <button
              onClick={() => (onVisitHome as any)?.(p.id, p.name)}
              className="px-2 py-1 rounded bg-red-900/60 border border-red-500/40 text-red-200 text-[11px] font-bold hover:bg-red-800/60"
              title="潜入TA的个人营地实例，只能破拆不能建造"
            >
              🚩突袭TA营地
            </button>
```

并在该组件 Props 接口加：

```tsx
  onVisitHome?: (targetId: string, targetName: string) => void;
```

`src/App.tsx` 调用处 `onInviteToSquad={(p) => {...}}` 下一行加：

```tsx
          onVisitHome={handleVisitHome}
```

`src/components/WorldMapModal.tsx`：在 Header 操作区 `关闭` 按钮前插入：

```tsx
              <button
                onClick={() => { (onGoHome as any)?.(); }}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-700 text-emerald-100 text-xs font-bold transition-colors"
                title="回自己的独立营地实例"
              >
                🏠我的营地
              </button>
```

并在 Props 接口加 `onGoHome?: () => void;`，在解构参数加 `onGoHome`，在 `src/App.tsx` 的 `<WorldMapModal` 调用加 `onGoHome={handleGoHome}`。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --reporter=verbose`
Expected: 全绿（home 5 + diplomacy 9 + spawn 4 + quests 4 + compound 5 + maps ≥14 + combat 20+）。

Run: `npm run lint`
Expected: exit 0。

Run: `npm run build`
Expected: 成功。

手动：`npm run dev` → 点 M→“我的营地”进入 `home_<自己>`，只有残核+两堆荒料；B建门后，A点在线名单“突袭TA营地”进入 `home_<B>`，B的门红框，F弹出突袭窗，A不可建造（服务端拒绝）。

- [ ] **Step 5: Commit**

```bash
git add server.ts src/game/IsometricEngine.ts src/game/NetworkManager.ts src/App.tsx src/components/OnlinePlayersModal.tsx src/components/WorldMapModal.tsx
git commit -m "feat(home): isolated personal camps with raidable visit flow"
```

---

### Task 12: 总验——16图互达 + 独立营地隔离 + 三幕毕业走查

**Files:**
- Modify: 无（只验证 + 修漏）
- Test: 全量 `vitest` + `lint` + `build` + 手动走查表

- [ ] **Step 1: Write the failing test**

本任务的“红”是全量回归：

Run: `npx vitest run --reporter=verbose`
Expected: 全绿（home 5 + diplomacy 9 + spawn 4 + quests 4 + compound 5 + maps ≥14 + combat 20+）。若有红，回对应 Task 修，不在本任务打补丁。

- [ ] **Step 2: Run static checks**

Run: `npm run lint`
Expected: exit 0。

Run: `npm run build`
Expected: `vite build` 成功，`dist/` 生成。

- [ ] **Step 3: Write minimal implementation（只修漏，不加功能）**

若 Step 1/2 全绿，本步只做一件事：清掉本地地图编辑器覆盖，避免旧墙挡新门（执行者在本机控制台执行，不入库）：

```js
Object.keys(localStorage).filter(k => k.startsWith('sdc_map_override_')).forEach(k => localStorage.removeItem(k)); location.reload();
```

若发现 `WorldMapModal` 未显示新图，检查 `src/game/maps.ts` 的 `MAP_IDS` 是否为 `Object.keys(SUBMAPS)` 派生（应是，无需手维护）；若 `REGIONS` 数量不对，确认新图 `region` 字段为 `town/mountain/marsh` 三者之一（本计划已保证）。

- [ ] **Step 4: Run manual checklist to verify it passes**

Run: `npm run dev`，逐项打勾：

```text
[ ] M地图：15野外/公共图（营地3/城镇4/山地4/湿地4）+1模板，逐门步行可达全部图，无死门
[ ] 出生：开2个无痕窗口进服，出生点不重叠（±6分散），Tab名单2人
[ ] 中立：公共营地内互相开火无伤害，他人建筑F提示中立/不可突袭
[ ] 独立营地：点“我的营地”进入home_<自己>，只有残核+荒料，从零建造工作台→安全门→炮塔
[ ] 隔离：A在自家建门，B在自家看不到A的门；B点“突袭TA营地”进入home_<A>才看到红框门
[ ] 突袭：B在home_<A>内按F弹出突袭窗，C4造成伤害，A收到警报；B在home_<A>内点建造被服务端拒绝
[ ] 敌对：同去town_ruins，A建safe_door后B靠近显示红框，B按F弹出突袭窗
[ ] 流程：新号QuestPanel从0/18开始，Act2第一步变为“回家认领”，站上自家营地即勾
[ ] 长度：废弃工厂/雪峰/深渊各有怪有箱，BOSS（霸主1200/1600）可击杀，Lv.10+自家要塞可毕业
[ ] 性能：野外怪≥3同屏不卡，雷达红点/建筑点正常
```

- [ ] **Step 5: Commit（若无修改则空提交跳过）**

```bash
git status --short
```

若干净则无需提交，直接贴走查勾选表。若有微调则：

```bash
git add -A
git commit -m "fix: post-expansion reachability and hostile polish"
```

---

## Verification Checklist（执行者逐项打勾）

- [ ] `npx vitest run --reporter=verbose` 全绿（home/diplomacy/spawn/quests/compound/maps/combat）
- [ ] `npm run lint` exit 0
- [ ] `npm run build` 成功
- [ ] M地图15公共图互达 + home模板存在，无死门
- [ ] 双开出生分散，公共营地中立不伤，野外敌对红框+可突袭
- [ ] 个人营地隔离：自家只见自家，访客经突袭入口才可见可打不可建
- [ ] QuestPanel 18步可逐项毕业，Act2走个人营地线，奖励正常发放
- [ ] 新图各有怪有箱有院，BOSS链可打完

## Out of Scope（明确不做）

- 不做公会/结盟/停战、不做离线保护/无敌盾、不做无缝大世界重写相机碰撞。
- 不新增货币/装备数值体系，BOSS/精英复用 `killReward` 曲线。
- 不改 `compound.ts` 分组键、`house.ts` 渲染、`visualTheme.ts` 配色；只加描边，不重画房子。
- 不做旧存档迁移：老 `localStorage` 地图覆盖需手动清理（Task 12 Step 3）。
- 个人营地不做密码锁/白名单/离线炮塔守家AI，只靠突袭强度+主人在线防守；不做营地装饰皮肤。

