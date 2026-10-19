# 全地图重设计（Duckov 式围合院落）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 参考逃离鸭科夫（零号区→仓库/农场→J-Lab→风暴区的难度爬坡 + 每 POI 必是围闭院落 + 肥区钥匙房 + 撤离点）的设计语言，重做 12 张子图的建筑围墙与地基饰品，根治“墙没围住建筑、墙缝漏风、地基和墙对不上、地图丑且无策略性”问题，全程不改玩法数值（HP/伤害/掉率/移速）。

**Architecture:** 新增 `src/game/compound.ts` 收敛唯一的围合生成规则（STEP=1 相邻无缝 + 朝向规则 + 地基对齐 + 封闭校验纯函数，可单测）；`src/game/maps.ts` 只调 helper 重排 12 图的 `buildings/deco`（怪/采集点/门坐标不动，除非压墙才挪 1 格）；新增 `src/game/compound.test.ts` + `src/game/maps.test.ts` 锁死“必围合图必须无缝闭环、盒子必须在圈内、墙上无采集点重叠”。

**Tech Stack:** TypeScript + Canvas2D 等距引擎 + Vitest 3（已在 package.json）+ `tsc --noEmit` lint + Vite build。

---

## File Structure

| 文件 | 职责 | 改动性质 |
|---|---|---|
| `src/game/compound.ts`（新建，约110行） | 唯一真相围合规则：`buildCompoundWalls()`、`compoundFoundation()`、`isEnclosed()`、`boxInside()`、`wallHit()`；STEP=1 无缝间距约束 | Create |
| `src/game/compound.test.ts`（新建） | 单测：5x4 铁院四边闭合、门占边不断环、STEP=2 旧写法判为漏缝、盒子内外判定 | Create |
| `src/game/maps.test.ts`（新建） | 全图回归锁：必围合图清单、每图盒子在圈内、采集点不压墙、地基与院落同心 | Create |
| `src/game/maps.ts`（改） | 12 图 `buildings/deco` 重排，只动这两字段；`gates/interactables/monsters/loot` 不动（压墙的单个点微调除外） | Modify |
| `src/components/MapEditorModal.tsx`（不动） | 编辑器只读新数据，不改代码 | No change |
| `src/game/IsometricEngine.ts`（不动） | 墙体绘制/碰撞不改，只验证视觉 | No change |

设计决策（锁定，防“有品味但跑偏”）：

- Duckov 借鉴点只取 4 条：①难度爬坡（营地 SAFE→城镇/山地/渔港 LOW→深林/废墟/沼泽 HIGH→裂隙 EXTREME，本计划不改 risk，只改院落强度：SAFE 用石墙/开敞教学，LOW 用木/石小院，HIGH 用铁墙+安全门肥区，EXTREME 用半血残墙+能量缝讲故事）；②每 POI = 一座闭合院（墙+1 扇门+圈内 1 箱，肥区用 `safe_door`）；③肥区/撤离逻辑不动（gates 坐标一个不动）；④废墟感靠 deco（foundation/crater/rubble）+ 半血墙讲故事，不靠随机散墙。
- 病根（本计划要杀死的写法）：旧 `maps.ts` 墙间距 STEP=2（如 `-8,-12` 与 `-4,-12` 夹一扇 `-6` 门，中间 `-7/-5` 各漏 1 格）+ 东西/南北 `facing` 混用 + `deco.foundation` 中心与墙中心错位（如加油站地基在 `4,-13` 而墙在 `-6,-13`）。新规则：**同一边墙段必须整数 STEP=1 相邻，门替换边中点一段，不额外占格；南北边用 `facing:'ew'`，东西边用 `facing:'ns'`；地基中心 == 院落中心，`w+2/h+2`**。
- YAGNI：不做新贴图/新碰撞/新寻路/昼夜系统；不改怪与掉落；不断 gate；营地广场（`camp_plaza`）保持开敞安全区（Duckov 基地式），不强制围合。

必围合清单（`maps.test.ts` 锁死）：

- `camp_outskirts` 演示院必须闭合（教学突袭靶）。
- `town_gas` 加油站办公室闭合；`town_street` 五金店+餐馆各闭合；`town_ruins` 掠夺者堡垒闭合（塌楼两处为故意残墙 U 形，不判闭合，白名单）。
- `mtn_logging` 伐木工棚闭合；`mtn_quarry` 值班室闭合；`mtn_deep` 佣兵哨卡闭合。
- `marsh_docks` 渔民小屋闭合；`marsh_bog` 猎人高脚屋闭合（单柱改为 3x3 小院）；`marsh_rift` 先锋掩体为故意残墙 U 形（白名单）。
- `camp_plaza` / `camp_workshop` 为开敞安全区，白名单（教学 U 形/开敞）。

---

### Task 1: 围合 helper + 单测（先立规矩，后改图）

**Files:**
- Create: `src/game/compound.ts`
- Create: `src/game/compound.test.ts`
- Test: `src/game/compound.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/compound.test.ts`，完整内容如下（直接复制可用）：

```ts
import { describe, expect, it } from 'vitest';
import { buildCompoundWalls, compoundFoundation, isEnclosed, boxInside } from './compound';

describe('compound walls', () => {
  it('5x4 iron yard is enclosed with door on south', () => {
    const walls = buildCompoundWalls({
      idPrefix: 't_yard',
      cx: 0, cy: 0, w: 4, h: 3,
      wallType: 'iron_wall', wallName: '测试铁墙', ownerName: '测试',
      doorSide: 'S', doorType: 'door', doorName: '测试门',
    });
    // 北边 w+1=5 段，南边 w 段墙+1 扇门，东西边各 h-1=2 段（四角归南北边）
    // 总数 = 5 + (4+1) + 2 + 2 = 14
    expect(walls).toHaveLength(14);
    expect(isEnclosed(walls)).toBe(true);
  });
  it('old STEP=2 layout is detected as gapped', () => {
    // 复刻旧加油站 bug：-8 与 -4 夹 -6 门，漏 -7/-5
    const walls = buildCompoundWalls({
      idPrefix: 'old_gas',
      cx: 0, cy: 0, w: 4, h: 2,
      wallType: 'iron_wall', wallName: '旧墙', ownerName: '旧',
      doorSide: 'S', doorType: 'door', doorName: '旧门',
    });
    const gapped = walls.filter((b) => b.type !== 'door');
    // 手动抽掉两段模拟 STEP=2 漏缝
    const broken = gapped.filter((_, i) => i % 2 === 0).concat(walls.filter((b) => b.type === 'door'));
    expect(isEnclosed(broken)).toBe(false);
  });
  it('box inside vs outside', () => {
    const walls = buildCompoundWalls({
      idPrefix: 't_box', cx: 10, cy: 10, w: 4, h: 3,
      wallType: 'stone_wall', wallName: '石墙', ownerName: '测试',
      doorSide: 'S', doorType: 'door', doorName: '门',
    });
    expect(boxInside(10, 10, walls)).toBe(true);
    expect(boxInside(10, 30, walls)).toBe(false);
  });
  it('foundation is centered and padded by 2', () => {
    const f = compoundFoundation(6, 6, 4, 3, 'foundation');
    expect(f).toEqual({ x: 6, y: 6, w: 6, h: 5, type: 'foundation' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/compound.test.ts --reporter=verbose`
Expected: FAIL with `Error: Failed to resolve import "./compound" from "src/game/compound.test.ts"`（文件还不存在）。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/compound.ts`，完整内容如下（直接复制可用，行数约110）：

```ts
import type { BuildingEntity, DecoDef, BuildableType } from '../types/game';

export type WallKind = 'wood_wall' | 'stone_wall' | 'iron_wall';
export type DoorSide = 'N' | 'S' | 'E' | 'W';

export interface CompoundOpts {
  idPrefix: string;
  cx: number; cy: number;
  w: number; h: number; // 院落内径（格数），w>=2 h>=2
  wallType: WallKind;
  wallName: string;
  ownerName: string;
  level?: number;
  wallHp?: number;
  doorSide: DoorSide;
  doorType: 'door' | 'safe_door';
  doorName: string;
  doorExtra?: Partial<BuildingEntity>;
}

const WALL_HP: Record<WallKind, number> = {
  wood_wall: 350,
  stone_wall: 600,
  iron_wall: 850,
};

function wallId(prefix: string, side: string, i: number): string {
  return `${prefix}_${side}_${i}`;
}

/** Duckov 式闭合院：STEP=1 相邻无缝。南北边 facing ew，东西边 facing ns。门替换所在边中点一段。 */
export function buildCompoundWalls(o: CompoundOpts): BuildingEntity[] {
  const level = o.level ?? 1;
  const hp = o.wallHp ?? WALL_HP[o.wallType];
  const out: BuildingEntity[] = [];
  const x0 = o.cx - o.w / 2;
  const x1 = o.cx + o.w / 2;
  const y0 = o.cy - o.h / 2;
  const y1 = o.cy + o.h / 2;
  const midX = o.cx;
  const midY = o.cy;

  const pushWall = (id: string, x: number, y: number, facing: 'ew' | 'ns') => {
    out.push({
      id, type: o.wallType as BuildableType, name: o.wallName,
      x, y, hp, maxHp: hp, level, ownerName: o.ownerName, facing,
    });
  };
  const pushDoor = (x: number, y: number, facing: 'ew' | 'ns') => {
    const base: BuildingEntity = {
      id: `${o.idPrefix}_door`, type: o.doorType as BuildableType, name: o.doorName,
      x, y, hp: o.doorType === 'safe_door' ? 5000 : 650,
      maxHp: o.doorType === 'safe_door' ? 5000 : 650,
      level: o.doorType === 'safe_door' ? 2 : 1,
      isOpen: o.doorType === 'safe_door' ? false : true,
      isLocked: o.doorType === 'safe_door' ? true : false,
      ownerName: o.ownerName, facing,
    };
    out.push({ ...base, ...(o.doorExtra ?? {}) });
  };

  // 北边 y0：x0..x1 STEP=1 facing ew；若门在北则中点换门
  for (let x = x0; x <= x1; x++) {
    if (o.doorSide === 'N' && x === midX) pushDoor(x, y0, 'ew');
    else pushWall(wallId(o.idPrefix, 'n', x), x, y0, 'ew');
  }
  // 南边 y1
  for (let x = x0; x <= x1; x++) {
    if (o.doorSide === 'S' && x === midX) pushDoor(x, y1, 'ew');
    else pushWall(wallId(o.idPrefix, 's', x), x, y1, 'ew');
  }
  // 东西边只做中间段（四角已归南北边，避免重复堆叠）：y0+1..y1-1 facing ns
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    if (o.doorSide === 'W' && y === midY) pushDoor(x0, y, 'ns');
    else pushWall(wallId(o.idPrefix, 'w', y), x0, y, 'ns');
  }
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    if (o.doorSide === 'E' && y === midY) pushDoor(x1, y, 'ns');
    else pushWall(wallId(o.idPrefix, 'e', y), x1, y, 'ns');
  }
  return out;
}

/** 地基必须与院落同心，w+2/h+2。 */
export function compoundFoundation(cx: number, cy: number, w: number, h: number, type: DecoDef['type'] = 'foundation'): DecoDef {
  return { x: cx, y: cy, w: w + 2, h: h + 2, type };
}

/** 封闭校验：按边重建期望点集，缺任一段即 false。只认本 helper 生成的矩形（含 1 扇门）。 */
export function isEnclosed(buildings: BuildingEntity[]): boolean {
  if (buildings.length === 0) return false;
  const pts = new Set(buildings.map((b) => `${b.x},${b.y}`));
  const xs = buildings.map((b) => b.x);
  const ys = buildings.map((b) => b.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  for (let x = x0; x <= x1; x++) {
    if (!pts.has(`${x},${y0}`)) return false;
    if (!pts.has(`${x},${y1}`)) return false;
  }
  for (let y = y0 + 1; y <= y1 - 1; y++) {
    if (!pts.has(`${x0},${y}`)) return false;
    if (!pts.has(`${x1},${y}`)) return false;
  }
  return true;
}

/** 盒子是否在圈内（严格内点，不压墙）。 */
export function boxInside(bx: number, by: number, walls: BuildingEntity[]): boolean {
  const xs = walls.map((b) => b.x);
  const ys = walls.map((b) => b.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  return bx > x0 && bx < x1 && by > y0 && by < y1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/compound.test.ts --reporter=verbose`
Expected: PASS，`Test Files 1 passed (1)`，`Tests 4 passed (4)`。

Run: `npm run lint`
Expected: exit 0 无报错。

- [ ] **Step 5: Commit**

```bash
git add src/game/compound.ts src/game/compound.test.ts
git commit -m "feat(maps): add enclosed-compound helper with tests"
```

---

### Task 2: 全图回归锁（先写判官，后改图，防改完又漏缝）

**Files:**
- Create: `src/game/maps.test.ts`
- Test: `src/game/maps.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/maps.test.ts`，完整内容如下：

```ts
import { describe, expect, it } from 'vitest';
import { SUBMAPS } from './maps';
import { isEnclosed, boxInside } from './compound';
import type { BuildingEntity } from '../types/game';

// 必围合院落：key 为地图 id，值为该图内必须闭合的墙组名前缀 + 圈内盒子 id
// 开敞/残墙白名单：camp_plaza、camp_workshop、town_ruins 塌楼、marsh_rift 掩体不在此表
const REQUIRED: Record<string, { prefix: string; boxId: string }[]> = {
  camp_outskirts: [{ prefix: 'demo_yard', boxId: 'demo_chest' }],
  town_gas: [{ prefix: 'gas_office', boxId: 'gas_office_box' }],
  town_street: [
    { prefix: 'st_hw', boxId: 'st_hw_box' },
    { prefix: 'st_dn', boxId: 'st_dn_box' },
  ],
  mtn_logging: [{ prefix: 'lg_cabin', boxId: 'lg_cabin_box' }],
  mtn_quarry: [{ prefix: 'q_office', boxId: 'q_office_box' }],
  mtn_deep: [{ prefix: 'forest_post', boxId: 'deep_cache_box' }],
  marsh_docks: [{ prefix: 'dock_hut', boxId: 'dock_hut_box' }],
  marsh_bog: [{ prefix: 'bog_hut', boxId: 'bog_hunter_box' }],
};

function groupByPrefix(buildings: BuildingEntity[], prefix: string): BuildingEntity[] {
  return buildings.filter((b) => b.id.startsWith(prefix));
}

describe('maps enclosure regression', () => {
  for (const [mapId, groups] of Object.entries(REQUIRED)) {
    it(`${mapId} yards are enclosed and boxes inside`, () => {
      const def = SUBMAPS[mapId];
      expect(def, `${mapId} missing`).toBeDefined();
      for (const g of groups) {
        const walls = groupByPrefix(def.buildings, g.prefix);
        expect(walls.length, `${mapId}:${g.prefix} empty`).toBeGreaterThan(8);
        expect(isEnclosed(walls), `${mapId}:${g.prefix} not enclosed`).toBe(true);
        const box = def.buildings.find((b) => b.id === g.boxId);
        expect(box, `${mapId}:${g.boxId} missing`).toBeDefined();
        expect(boxInside(box!.x, box!.y, walls), `${mapId}:${g.boxId} outside`).toBe(true);
      }
    });
  }
  it('no interactable sits on a wall tile', () => {
    for (const [mapId, def] of Object.entries(SUBMAPS)) {
      const wallPts = new Set(def.buildings.filter((b) => b.type.includes('wall') || b.type === 'door' || b.type === 'safe_door').map((b) => `${b.x},${b.y}`));
      for (const it of def.interactables) {
        expect(wallPts.has(`${it.x},${it.y}`), `${mapId}:${it.id} on wall`).toBe(false);
      }
    }
  });
  it('raider and merc safe_door yards stay enclosed (raidable肥区)', () => {
    for (const mapId of ['town_ruins', 'mtn_deep']) {
      const def = SUBMAPS[mapId];
      const door = def.buildings.find((b) => b.type === 'safe_door');
      expect(door, `${mapId} safe_door missing`).toBeDefined();
      const prefix = door!.id.replace(/_door$/, '').replace(/_gate.*$/, '');
      const walls = def.buildings.filter((b) => b.id.startsWith(prefix) || b.id.startsWith(door!.id.split('_')[0]));
      // 至少门两侧有墙，不判全闭环（堡垒院在 Task 5/6 会补全，这里只锁门存在）
      expect(walls.length).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/maps.test.ts --reporter=verbose`
Expected: FAIL，多条 `not enclosed` / `empty` 红（旧图前缀对不上、STEP=2 漏缝、盒子在圈外）。这是要的红。

- [ ] **Step 3: Write minimal implementation**

本步不改 `maps.ts`（改图是 Task 3-6 的事），只确认判官就位。若 `npm run lint` 报 `maps.test.ts` 类型错，修复导入大小写（`../types/game`），不放宽断言。

- [ ] **Step 4: Run test to confirm current red state is recorded**

Run: `npx vitest run src/game/maps.test.ts --reporter=verbose | head -n 40`
Expected: 红，至少 `camp_outskirts`、`town_gas`、`marsh_docks` 三处 `not enclosed`。把红记下来就继续（Task 3 起逐个变绿）。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/maps.test.ts
git commit -m "test(maps): add enclosure regression lock (red now, green after redesign)"
```

---

### Task 3: 营地区 3 图重设计（SAFE 教学线：开敞广场 + 工坊 U 形 + 外圩演示闭合院）

**Files:**
- Modify: `src/game/maps.ts:44-122`（`camp_plaza/camp_workshop/camp_outskirts` 三段）
- Test: `src/game/maps.test.ts`

- [ ] **Step 1: Write the failing test**

本任务无新增测试文件，判官是 Task 2 的 `camp_outskirts yards are enclosed`。先跑看红：

Run: `npx vitest run src/game/maps.test.ts -t "camp_outskirts" --reporter=verbose`
Expected: FAIL with `camp_outskirts:demo_yard not enclosed`（旧 `demo_wall_1/2` 只有 2 段）。

- [ ] **Step 2: Run test to verify it fails**

同上，确认红后再动手。 thermostat：不要跳过此步。

- [ ] **Step 3: Write minimal implementation**

3a. 文件头加 import（`src/game/maps.ts:1-9` 第一行后插入）：

```ts
import { buildCompoundWalls, compoundFoundation } from './compound';
```

3b. 替换 `camp_plaza` 的 `buildings/deco`（保持 gates/interactables/monsters 不动）。找到 `camp_plaza: {` 到其 `deco: [` 块，替换其中 `buildings: [...]` 与 `deco: [...]` 为：

```ts
    buildings: [
      { id: 'anchor_1', type: 'anchor_core', name: '开拓团 · 坍界锚点水晶核心', x: 0.0, y: 0.0, hp: 6000, maxHp: 6000, level: 3, ownerName: '恒界开拓团' },
      { id: 'camp_turret_1', type: 'turret', name: '营地电弧防卫塔', x: 4.5, y: -4.5, hp: 1200, maxHp: 1200, level: 2, fireCooldown: 0, ownerName: '恒界开拓团' },
      { id: 'camp_storage_1', type: 'storage_box', name: '前哨公共储物箱', x: -3.0, y: 0.5, hp: 800, maxHp: 800, level: 2, ownerName: '恒界开拓团' },
    ],
    deco: [
      { x: 0, y: 0, w: 11, h: 9, type: 'foundation' },
    ],
```

理由：Duckov 基地式开敞安全区，不围合，地基加大 9x7→11x9 显广场气派。

3c. 替换 `camp_workshop` 的 `buildings`（加 U 形教学墙：北+东西，不封南，留开敞口教学“墙要连起来”）。找到 `id: 'camp_workshop'` 段，`buildings: [` 整块替换为：

```ts
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
```

并把该段 `deco` 置为（若原来没有则新增一行）：

```ts
    deco: [
      { x: 0, y: 1, w: 9, h: 6, type: 'foundation' },
    ],
```

注意：`ws_storage` 从 `(6,4)` 搬进圈内 `(0,1)`，`ws_parts_bin` 从 `(0,10)` 搬进 `(1,1)`，`ws_turret` 搬到圈外 `(-5,-3)` 放哨。`ws_crate` 采集点在 `(8,-6)` 不压墙，不动。

3d. 替换 `camp_outskirts` 的 `buildings/deco` 为 Duckov 式演示闭合院（4x3 铁院 + 安全门南 + 箱在圈内）。整块替换为：

```ts
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'demo_yard', cx: 18, cy: -4, w: 4, h: 3,
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
      { x: 18, y: -4, w: 6, h: 5, type: 'foundation' },
    ],
```

院落占格：x 16..20，y -5.5..-2.5（w=4,h=3 取半格，helper 用整数循环 x0=16,x1=20,y0=-5.5?注意 helper 要求整数中心——此处 cx=18,cy=-4,w=4,h=2 更稳，取 h=2 得 y -5..-3，箱在 (18,-4) 正中。为与测试 `boxInside` 严格内点一致，本计划统一用偶数 w/h，保证 x0/x1/y0/y1 全整数。上面 `w:4,h:3` 在 cy=-4 时 y0=-5.5 非整数——修正为 `w:4,h:2`，地基 `compoundFoundation(18,-4,4,2)` 即 6x4。本段最终以 `w:4,h:2` 落盘，地基手写 6x4。）

最终落盘（复制此版，不要用上一段的 h:3）：

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/maps.test.ts -t "camp_outskirts" --reporter=verbose`
Expected: PASS。

Run: `npx vitest run src/game/compound.test.ts src/game/maps.test.ts --reporter=verbose`
Expected: compound 4 passed；maps 仅 camp_outskirts 绿，其余仍红（正常）。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/maps.ts src/game/compound.ts src/game/maps.test.ts
git commit -m "feat(maps): redesign camp region with demo enclosed yard"
```

---

### Task 4: 城镇区 3 图重设计（LOW→HIGH 爬坡：加油站铁院 / 商业街双院 / 废墟堡垒+残墙故事）

**Files:**
- Modify: `src/game/maps.ts:124-309`（`town_gas/town_street/town_ruins`）
- Test: `src/game/maps.test.ts`

- [ ] **Step 1: Write the failing test**

Run: `npx vitest run src/game/maps.test.ts -t "town_gas" --reporter=verbose`
Expected: FAIL（旧墙 STEP=2）。

Run: `npx vitest run src/game/maps.test.ts -t "town_street" --reporter=verbose`
Expected: FAIL。

- [ ] **Step 2: Run test to verify it fails**

同上，两图确认红后再动手。

- [ ] **Step 3: Write minimal implementation**

3a. `town_gas`：加油站办公室改为 4x2 铁闭合院（cx=-6,cy=-13，门南，盒在圈内），便利店地基与院同心。找到 `id: 'town_gas'` 段，`buildings: [` 整块替换为：

```ts
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
```

`deco: [` 整块替换为：

```ts
    deco: [
      { x: -6, y: -13, w: 6, h: 4, type: 'foundation' },
      { x: 8, y: -13, w: 10, h: 7, type: 'foundation' },
      { x: -14, y: 6, w: 7, h: 5, type: 'crater' },
    ],
```

第一块地基与院同心（6x4），第二块是便利店主体（货架/医疗箱/保险箱区在 8,-13 附近，不砌墙，用地基讲“无墙大开间”与办公室“有墙小里间”的 Duckov 对比）。

3b. `town_street`：五金店（石院 4x2，cx=-10,cy=-8，门南）+ 餐馆（木院 4x2，cx=12,cy=6，门南），各圈 1 箱。找到 `id: 'town_street'` 段，`buildings: [` 整块替换为：

```ts
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
```

`deco` 替换为：

```ts
    deco: [
      { x: -10, y: -8, w: 6, h: 4, type: 'foundation' },
      { x: 12, y: 6, w: 6, h: 4, type: 'foundation' },
      { x: 0, y: 18, w: 8, h: 6, type: 'rubble' },
    ],
```

注意：`st_hardware` 采集点在 `(-10,-8)` 与新盒同格——把盒放在圈内正中是设计意图，采集点与盒同格不算压墙（判官只查墙格），但视觉重叠。把 `st_hardware` 采集点从 `(-10,-8)` 挪到 `(-10,-10)`（院外北 2 格，同一函数 `interactables` 里改 x/y 两数即可）。

3c. `town_ruins`：掠夺者堡垒 4x2 铁闭合院 + 安全门南（cx=22,cy=-6）+ 塌楼残墙 U 形保留讲故事。`buildings: [` 整块替换为：

```ts
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
```

`deco` 替换为：

```ts
    deco: [
      { x: -14, y: -14, w: 6, h: 5, type: 'foundation' },
      { x: 22, y: -6, w: 6, h: 4, type: 'foundation' },
      { x: 0, y: 0, w: 9, h: 7, type: 'crater' },
      { x: -4, y: 18, w: 7, h: 5, type: 'rubble' },
    ],
```

旧 `ru_cw_3/4` 在 `(6,8)/(8,8)` 的两段孤墙删除（无院不成形，留着就是“丑+漏”），塌楼只留北边一组 U 形。`ru_truck` 等采集点不动（经查均不在新墙格上）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/maps.test.ts -t "town_gas" --reporter=verbose`
Expected: PASS。

Run: `npx vitest run src/game/maps.test.ts --reporter=verbose`
Expected: camp_outskirts + town_gas + town_street 绿；mtn/marsh 仍红；`no interactable sits on a wall` 全绿。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/maps.ts src/game/maps.test.ts
git commit -m "feat(maps): redesign town region with closed shops and raider fort"
```

---

### Task 5: 山地区 3 图重设计（LOW 爬 HIGH：伐木木院 / 采石场石院 / 深林佣兵铁堡）

**Files:**
- Modify: `src/game/maps.ts:311-445`（`mtn_logging/mtn_quarry/mtn_deep`）
- Test: `src/game/maps.test.ts`

- [ ] **Step 1: Write the failing test**

Run: `npx vitest run src/game/maps.test.ts -t "mtn_logging" --reporter=verbose`
Expected: FAIL。

Run: `npx vitest run src/game/maps.test.ts -t "mtn_quarry" --reporter=verbose`
Expected: FAIL。

- [ ] **Step 2: Run test to verify it fails**

同上，确认两处红。

- [ ] **Step 3: Write minimal implementation**

3a. `mtn_logging`：伐木工棚 4x2 木闭合院（cx=-15,cy=-3，门南，盒在圈内）。`buildings: [` 整块替换为：

```ts
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
```

新增 `deco`（原来没有）：

```ts
    deco: [
      { x: -15, y: -3, w: 6, h: 4, type: 'foundation' },
    ],
```

`log_toolshed` 采集点在 `(-14,4)`，新院 y -4..-2，不重叠，不动。

3b. `mtn_quarry`：值班室 4x2 石闭合院（cx=-8,cy=-1，门南）。`buildings: [` 整块替换为：

```ts
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
```

`deco: [` 整块替换为：

```ts
    deco: [
      { x: -8, y: -1, w: 6, h: 4, type: 'foundation' },
      { x: 12, y: -10, w: 8, h: 6, type: 'rockery' },
    ],
```

3c. `mtn_deep`：佣兵哨卡 4x2 石闭合院 + 安全门南（cx=-16,cy=8，HIGH 肥区）。`buildings: [` 整块替换为：

```ts
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
```

注意盒与门同院：盒在正中 `(-16,8)`，门在南边 `(-16,9)`，不压格（判官 `boxInside` 严格内点通过）。`deep_herb` 在 `(14,10)` 远处不动。新增 `deco`：

```ts
    deco: [
      { x: -16, y: 8, w: 6, h: 4, type: 'foundation' },
    ],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/maps.test.ts --reporter=verbose`
Expected: camp + town + mtn 全绿；仅 marsh 红。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/maps.ts
git commit -m "feat(maps): redesign mountain region with closed cabin office and fort"
```

---

### Task 6: 湿地区 3 图重设计（LOW→EXTREME：渔民木院 / 猎人小院 / 裂隙残堡故事）

**Files:**
- Modify: `src/game/maps.ts:447-568`（`marsh_docks/marsh_bog/marsh_rift`）
- Test: `src/game/maps.test.ts`

- [ ] **Step 1: Write the failing test**

Run: `npx vitest run src/game/maps.test.ts -t "marsh_docks" --reporter=verbose`
Expected: FAIL（旧渔民小屋只有 2 段 ns 墙、无门、盒在墙外 `(14,-6)`）。

Run: `npx vitest run src/game/maps.test.ts -t "marsh_bog" --reporter=verbose`
Expected: FAIL（只有单柱）。

- [ ] **Step 2: Run test to verify it fails**

同上，确认红。

- [ ] **Step 3: Write minimal implementation**

3a. `marsh_docks`：渔民小屋 4x2 木闭合院（cx=12,cy=-6，门东临湖，盒圈内）。`buildings: [` 整块替换为：

```ts
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'dock_hut', cx: 12, cy: -6, w: 4, h: 2,
        wallType: 'wood_wall', wallName: '渔民小屋木墙', ownerName: '废土遗迹',
        doorSide: 'E', doorType: 'door', doorName: '渔屋湖门',
        doorExtra: { isOpen: true, isLocked: false },
      }),
      {
        id: 'dock_hut_box', type: 'storage_box', name: '渔民鱼获箱', x: 12, y: -6, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '异变青鱼', count: 4, icon: '🐟' },
          { name: '防水医疗包', count: 1, icon: '💉' },
        ],
      },
    ],
```

`deco` 新增（原来没有）：

```ts
    deco: [
      { x: 12, y: -6, w: 6, h: 4, type: 'foundation' },
    ],
```

门开东（`doorSide:'E'`，facing ns）是 Duckov 式“门朝资源”：出门即钓台 `(0,6)/(-6,12)` 方向。`dock_poplar` 在 `(10,-6)`——正好压在西墙 `(10,-6)` 上！把 `dock_poplar` 从 `(10,-6)` 挪到 `(9,-9)`（院外西北，不压墙，`interactables` 里改两数）。

3b. `marsh_bog`：猎人高脚屋 2x2 木闭合院（cx=-8,cy=3，门南，盒圈内）。`buildings: [` 整块替换为：

```ts
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'bog_hut', cx: -8, cy: 3, w: 2, h: 2,
        wallType: 'wood_wall', wallName: '高脚屋木墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '高脚屋活门',
        doorExtra: { isOpen: true, isLocked: false },
      }),
      {
        id: 'bog_hunter_box', type: 'storage_box', name: '猎人防水箱', x: -8, y: 3, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '防水绷带', count: 3, icon: '🩹' },
          { name: '熏鱼干', count: 6, icon: '🥩' },
        ],
      },
    ],
```

院占格 x -9..-7，y 2..4，共 8 段（北3+南2墙+1门+东西各1）。总数 8+1盒，判官 `>8` 卡的是 `walls.length`（8 段含门=8，不满足 >8！）。修正判官放宽或院放大：本计划取院放大到 `w:4,h:2`（12 段），cx=-8,cy=3，盒 `(-8,3)`。最终落盘用 `w:4,h:2`：

```ts
    buildings: [
      ...buildCompoundWalls({
        idPrefix: 'bog_hut', cx: -8, cy: 3, w: 4, h: 2,
        wallType: 'wood_wall', wallName: '高脚屋木墙', ownerName: '废土遗迹',
        doorSide: 'S', doorType: 'door', doorName: '高脚屋活门',
        doorExtra: { isOpen: true, isLocked: false },
      }),
      {
        id: 'bog_hunter_box', type: 'storage_box', name: '猎人防水箱', x: -8, y: 3, hp: 400, maxHp: 400, level: 1, ownerName: '废土遗迹',
        storedLoot: [
          { name: '防水绷带', count: 3, icon: '🩹' },
          { name: '熏鱼干', count: 6, icon: '🥩' },
        ],
      },
    ],
```

`deco` 新增：

```ts
    deco: [
      { x: -8, y: 3, w: 6, h: 4, type: 'foundation' },
    ],
```

`bog_reed` 在 `(-8,6)`，新院南边 y=4，门在 `(-8,4)`，采集点在门外 2 格，不压墙，不动。

3c. `marsh_rift`：先锋队掩体改为 U 形残堡（北+东西 5 段半血铁墙，南开敞=被炸开的口，讲 EXTREME 故事，不判闭合）。`buildings: [` 整块替换为：

```ts
    buildings: [
      { id: 'rift_cover_n1', type: 'iron_wall', name: '先锋队掩体残墙', x: 5, y: 5, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋', facing: 'ew' },
      { id: 'rift_cover_n2', type: 'iron_wall', name: '先锋队掩体残墙', x: 6, y: 5, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋', facing: 'ew' },
      { id: 'rift_cover_n3', type: 'iron_wall', name: '先锋队掩体残墙', x: 7, y: 5, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋', facing: 'ew' },
      { id: 'rift_cover_w', type: 'iron_wall', name: '先锋队掩体残墙', x: 5, y: 6, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋', facing: 'ns' },
      { id: 'rift_cover_e', type: 'iron_wall', name: '先锋队掩体残墙', x: 7, y: 6, hp: 300, maxHp: 850, level: 1, ownerName: '遗落先锋', facing: 'ns' },
    ],
```

`deco` 新增：

```ts
    deco: [
      { x: 6, y: 6, w: 5, h: 4, type: 'foundation' },
      { x: 10, y: 10, w: 7, h: 5, type: 'crater' },
    ],
```

`rift_cache` 宝箱在 `(12,12)` 远处不动；`rift_core` 在 `(0,0)` 不动。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/maps.test.ts --reporter=verbose`
Expected: PASS 全绿（REQUIRED 8 组 + 2 不压墙 + 堡垒门锁，全 pass）。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/maps.ts
git commit -m "feat(maps): redesign marsh region with closed fisher hunter yards"
```

---

### Task 7: 全图总验 + 试玩走图（gates 不动、编辑器覆盖清理、丑图终检）

**Files:**
- Modify: 无代码改动（验证任务）
- Test: `src/game/compound.test.ts` + `src/game/maps.test.ts` + 全量 `vitest` + `tsc` + `vite build`

- [ ] **Step 1: Write the failing test**

无新增断言。本步的“红”是指：如果之前有任务跳步，全量测试会红。先跑全量看状态：

Run: `npx vitest run --reporter=verbose`
Expected: 若 Task 3-6 全做完则全绿（含旧 `visualTheme/combat` 用例，共 20+）；若有红，回到对应 Task 修，不在本任务里打补丁。

- [ ] **Step 2: Run full suite to verify green**

Run: `npx vitest run --reporter=verbose`
Expected: `Test Files 4 passed (4)`（combat、visualTheme、compound、maps），`Tests` 全 passed，无 failed。

Run: `npm run lint`
Expected: exit 0。

Run: `npm run build`
Expected: `vite build` 成功，`dist/` 生成。

- [ ] **Step 3: Manual walkthrough (Duckov 式走图 12 图，每图 30 秒)**

3a. 清编辑器旧覆盖（否则新图被 localStorage 旧数据盖掉）：浏览器控制台执行：

```js
Object.keys(localStorage).filter(k => k.startsWith('sdc_map_override_')).forEach(k => localStorage.removeItem(k)); location.reload();
```

3b. `npm run dev` 后按清单走图打勾：

```text
[ ] camp_plaza：广场开敞，地基 11x9 居中，无散墙
[ ] camp_workshop：U 形北墙齐整，南开敞，仓/零件箱在 U 内，塔在外放哨
[ ] camp_outskirts：演示铁院闭环，门南，箱在圈内，农田两块不压院
[ ] town_gas：办公室铁院闭环，地基同心；便利店大地基讲大开间
[ ] town_street：五金石院+餐馆木院各闭环，门南，采集点已挪出院
[ ] town_ruins：堡垒铁院+安全门闭环，塌楼 U 形半血讲故事，无孤墙
[ ] mtn_logging：木院闭环配地基；mtn_quarry：石院闭环配地基
[ ] mtn_deep：佣兵石院+安全门闭环，补给箱在圈内
[ ] marsh_docks：渔屋木院门朝东，盒圈内，白杨已挪走不压墙
[ ] marsh_bog：猎人院闭环；marsh_rift：残堡 U 形+弹坑， intentionally 开敞
[ ] 按 M 世界地图：12 卡名/主题不变；雷达点位与新院对得上
[ ] 传送门（gates）逐个踩一遍可穿，无被墙挡住的门
```

任一门被墙挡住 → 回对应 Task 把院平移 2 格（只改 `cx/cy` 两数），重跑 `maps.test.ts`，不改 helper。

- [ ] **Step 4: Final verification run**

Run: `npx vitest run --reporter=verbose`
Expected: 全绿。

Run: `npm run lint && npm run build`
Expected: 均成功。

- [ ] **Step 5: Commit (docs only if no code changed)**

若本任务无代码改动，提交测试快照或跳过提交（二选一，不空提交）：

```bash
git status --short
```

若干净则无需提交，直接在 PR/群里贴走图勾选表。若有微调则：

```bash
git add -A
git commit -m "fix(maps): nudge yards off gates after walkthrough"
```

---

## Verification Checklist（执行者逐项打勾）

- [ ] `npx vitest run --reporter=verbose` 全绿（compound 4 + maps 10+ + combat/visualTheme 历史用例）
- [ ] `npm run lint` exit 0
- [ ] `npm run build` 成功
- [ ] 12 图走图：无 STEP=2 漏缝墙、无盒在圈外、无采集点压墙、无地基与墙错位、无门被墙挡
- [ ] 世界地图/雷达/传送门回归正常

## Out of Scope（明确不做）

- 不改 `gates` 坐标/朝向、不改怪数值与站位（除非压墙才挪 1 格并在任务里写明）、不改掉落表、不改墙体绘制与碰撞、不引入图片资源、不做昼夜系统、不重构 `App.tsx`。
- `camp_plaza/camp_workshop` 开敞与 `town_ruins 塌楼/marsh_rift 掩体` 残缺是故意设计，不算 bug，不许“顺手补成闭环”。
