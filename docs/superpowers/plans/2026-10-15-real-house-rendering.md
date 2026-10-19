# 真房子渲染 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把现在“N 段矮墙各画各的围栏感”改成“一座房子一次画完”：整屋阴影 → 两面挤出墙（亮/暗）→ 屋顶（平顶/尖顶）→ 墙面上内嵌门窗，门在缩略距离也清晰可辨，名牌不再堆成黑团。

**Architecture:** 新增 `src/game/house.ts` 纯函数（院落分组 + 四角/墙面/屋顶几何计算，可单测）；`IsometricEngine.ts` 新增 `drawHouse()` 只做薄渲染层调用，旧 `drawWallSeg` 逐段分支保留做 fallback；`render()` 里按 `x+y` 把同院建筑合并为一次 `drawHouse` 调用；名牌只画最近一座。先测后改，每任务独立可验证。

**Tech Stack:** TypeScript + Canvas2D + Vitest 3 + `tsc --noEmit` + `vite build`。

---

## File Structure

| 文件 | 职责 | 改动性质 |
|---|---|---|
| `src/game/house.ts`（新建，约120行） | 唯一真相几何：`HOUSE_WALL_H`、`groupBuildingsIntoHouses()`、`houseCorners()`、`wallFaces()`、`HOUSE_STYLE` 色板 | Create |
| `src/game/house.test.ts`（新建） | Vitest 单测：分组、闭合院四角、墙面朝向、门边定位 | Create |
| `src/game/IsometricEngine.ts:3441-3446` | 加 import（`house.ts`），不动现有逻辑 | Modify |
| `src/game/IsometricEngine.ts:3441-3787` | 新增 `drawHouse()`（约90行）+ `drawBuilding` 里闭合院走新分支、散墙走旧分支 | Modify |
| `src/game/IsometricEngine.ts:2478-2484` | `render()` 建筑入队改为按屋分组后一次绘制 | Modify |
| `src/game/IsometricEngine.ts:3752-3772` | 名牌只画 `nearestBuilding`，其余只画血条 | Modify |

设计决策（锁定）：
- 碰撞/突袭/HP/门开关逻辑一律不动，只改画法。`compound.ts` 数据不动。
- 一座房子 = 一个 `buildCompoundWalls` 前缀组（如 `gas_office_*` + 圈内 box）。散墙（残墙 U 形、演示墙）继续走旧 `drawWallSeg`，不强制成屋。
- 光源锁定左上：南向两面墙左亮右暗，屋顶左亮右暗，门窗内嵌深色 + 浅色框。
- YAGNI：不引入图片/精灵/Isomer 库，不做室内，不改地图数据。

---

### Task 1: 房子几何纯函数 + 单测（先立规矩，后动画笔）

**Files:**
- Create: `src/game/house.ts`
- Create: `src/game/house.test.ts`
- Test: `src/game/house.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/house.test.ts`，完整内容如下（直接复制可用）：

```ts
import { describe, expect, it } from 'vitest';
import { groupBuildingsIntoHouses, houseCorners, HOUSE_WALL_H } from './house';
import type { BuildingEntity } from '../types/game';

const wall = (id: string, x: number, y: number): BuildingEntity => ({
  id, type: 'iron_wall', name: '墙', x, y, hp: 850, maxHp: 850, level: 1, ownerName: '遗迹', facing: 'ew',
});

describe('groupBuildingsIntoHouses', () => {
  it('same prefix walls form one house, others stay single', () => {
    const bs = [wall('gas_office_n_-8', -8, -14), wall('gas_office_s_-8', -8, -12), wall('ru_cw_1', 6, 8)];
    const groups = groupBuildingsIntoHouses(bs);
    expect(groups).toHaveLength(2);
    expect(groups[0].members).toHaveLength(2);
    expect(groups[1].members).toHaveLength(1);
  });
  it('door id with same prefix joins its house', () => {
    const door: BuildingEntity = { id: 'gas_office_door', type: 'door', name: '门', x: -6, y: -12, hp: 650, maxHp: 650, level: 1, ownerName: '遗迹', facing: 'ew', isOpen: true, isLocked: false };
    const groups = groupBuildingsIntoHouses([wall('gas_office_n_-8', -8, -14), door]);
    expect(groups).toHaveLength(1);
    expect(groups[0].door?.id).toBe('gas_office_door');
  });
});

describe('houseCorners', () => {
  it('4x2 yard yields integer bounds and wall height constant', () => {
    const bs = [wall('a_n_0', -8, -14), wall('a_n_1', -7, -14), wall('a_s_0', -8, -12), wall('a_s_1', -7, -12)];
    const c = houseCorners(bs);
    expect(c).toEqual({ x0: -8, x1: -7, y0: -14, y1: -12 });
    expect(HOUSE_WALL_H).toBe(44);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/house.test.ts --reporter=verbose`
Expected: FAIL with `Error: Failed to resolve import "./house" from "src/game/house.test.ts"`（文件还不存在）。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/house.ts`，完整内容如下（直接复制可用）：

```ts
import type { BuildingEntity } from '../types/game';

/** 整屋墙高（px），所有房子统一，门窗按此比例开洞 */
export const HOUSE_WALL_H = 44;
/** 屋顶尖顶峰高（px），平顶为 0 */
export const HOUSE_PEAK_H = 26;

export interface HouseGroup {
  key: string;
  members: BuildingEntity[];
  door: BuildingEntity | null;
  cx: number;
  cy: number;
}

function prefixOf(id: string): string {
  // gas_office_n_-8 → gas_office；gas_office_door → gas_office；ru_cw_1 → ru_cw
  if (id.endsWith('_door')) return id.slice(0, -5);
  const parts = id.split('_');
  if (parts.length <= 2) return parts[0];
  const last = parts[parts.length - 1];
  const prev = parts[parts.length - 2];
  if (/^-?\d+$/.test(last) && (prev === 'n' || prev === 's' || prev === 'e' || prev === 'w')) {
    return parts.slice(0, -2).join('_');
  }
  return parts.slice(0, -1).join('_');
}

function isHousePart(b: BuildingEntity): boolean {
  return b.type === 'iron_wall' || b.type === 'stone_wall' || b.type === 'wood_wall' || b.type === 'glass_wall' || b.type === 'door' || b.type === 'safe_door';
}

/** 同前缀墙+门并为一组；storage_box/turret 等不参组，原样单成员返回 */
export function groupBuildingsIntoHouses(buildings: BuildingEntity[]): HouseGroup[] {
  const wallGroups = new Map<string, BuildingEntity[]>();
  const singles: BuildingEntity[] = [];
  for (const b of buildings) {
    if (!isHousePart(b)) {
      singles.push(b);
      continue;
    }
    const key = prefixOf(b.id);
    const arr = wallGroups.get(key);
    if (arr) arr.push(b);
    else wallGroups.set(key, [b]);
  }
  const out: HouseGroup[] = [];
  for (const [key, members] of wallGroups) {
    const door = members.find((m) => m.type === 'door' || m.type === 'safe_door') ?? null;
    const xs = members.map((m) => m.x);
    const ys = members.map((m) => m.y);
    out.push({ key, members, door, cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 });
  }
  for (const s of singles) {
    out.push({ key: s.id, members: [s], door: null, cx: s.x, cy: s.y });
  }
  return out;
}

/** 院落四角边界（整数格），drawHouse 的唯一输入 */
export function houseCorners(members: BuildingEntity[]): { x0: number; x1: number; y0: number; y1: number } {
  const xs = members.map((m) => m.x);
  const ys = members.map((m) => m.y);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/house.test.ts --reporter=verbose`
Expected: PASS，`Test Files 1 passed (1)`，`Tests 3 passed (3)`。

Run: `npm run lint`
Expected: 无输出（exit 0）。

- [ ] **Step 5: Commit**

```bash
git add src/game/house.ts src/game/house.test.ts
git commit -m "feat(house): add house grouping geometry with tests"
```

---

### Task 2: drawHouse 一座房子一次画完（先只接加油站验证）

**Files:**
- Modify: `src/game/IsometricEngine.ts:1-16`（加 import）
- Modify: `src/game/IsometricEngine.ts:3441-3446`（新增 drawHouse，约90行）
- Modify: `src/game/IsometricEngine.ts:3529-3567`（wall/door 分支加试用开关）
- Test: `src/game/house.test.ts`（复用，不新增文件）

- [ ] **Step 1: Write the failing test**

本任务渲染无新增单测，用几何锁防回退，先跑红确认基线：

Run: `npx vitest run src/game/house.test.ts -t "same prefix" --reporter=verbose`
Expected: PASS（Task 1 已绿，本步视为约束锁定，直接进 Step 3）。

- [ ] **Step 2: Run test to verify it fails-or-locks**

同上，确认 PASS 后动手。

- [ ] **Step 3: Write minimal implementation**

3a. 文件头加 import（`src/game/IsometricEngine.ts:1-16`，找到 `from './visualTheme'` 那一行，在其下一行插入）：

```ts
import { groupBuildingsIntoHouses, houseCorners, HOUSE_WALL_H, HOUSE_PEAK_H } from './house';
```

3b. 在 `private drawBuilding(b: BuildingEntity) {` 之前（`src/game/IsometricEngine.ts:3441` 行上一行）插入完整新方法（直接复制，缩进 2 空格）：

```ts
private drawHouse(members: BuildingEntity[], door: BuildingEntity | null) {
  const { x0, x1, y0, y1 } = houseCorners(members);
  const first = members[0];
  const isWood = first.type === 'wood_wall';
  const isStone = first.type === 'stone_wall';
  const cLeft = isWood ? '#8a5a2b' : isStone ? '#9aa5b5' : '#6b7d94';
  const cRight = isWood ? '#5a3413' : isStone ? '#5b6675' : '#3d4a5e';
  const cRoofL = isWood ? '#a4713d' : isStone ? '#7d8aa0' : '#54687f';
  const cRoofR = isWood ? '#6e4520' : isStone ? '#525d70' : '#33405280';
  const wallH = HOUSE_WALL_H;
  const gLeft = this.toScreen(x0, y1);
  const gBottom = this.toScreen(x1, y1);
  const gRight = this.toScreen(x1, y0);
  const up = (p: { x: number; y: number }, dy: number) => ({ x: p.x, y: p.y - dy });
  this.ctx.save();
  drawSoftShadow(this.ctx, (gLeft.x + gRight.x) / 2, gBottom.y + 4, 40);
  const quad = (a: { x: number; y: number }, b2: { x: number; y: number }, c2: { x: number; y: number }, d: { x: number; y: number }, fill: string) => {
    this.ctx.fillStyle = fill;
    this.ctx.beginPath();
    this.ctx.moveTo(a.x, a.y); this.ctx.lineTo(b2.x, b2.y); this.ctx.lineTo(c2.x, c2.y); this.ctx.lineTo(d.x, d.y);
    this.ctx.closePath(); this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(0,0,0,0.45)'; this.ctx.lineWidth = 1.5; this.ctx.stroke();
  };
  quad(gLeft, gBottom, up(gBottom, wallH), up(gLeft, wallH), cLeft);
  quad(gBottom, gRight, up(gRight, wallH), up(gBottom, wallH), cRight);
  const tLeft = up(gLeft, wallH);
  const tBottom = up(gBottom, wallH);
  const tRight = up(gRight, wallH);
  const apex = { x: tBottom.x, y: tBottom.y - HOUSE_PEAK_H };
  this.ctx.fillStyle = cRoofL;
  this.ctx.beginPath();
  this.ctx.moveTo(tLeft.x, tLeft.y); this.ctx.lineTo(tBottom.x, tBottom.y); this.ctx.lineTo(apex.x, apex.y);
  this.ctx.closePath(); this.ctx.fill(); this.ctx.stroke();
  this.ctx.fillStyle = cRoofR;
  this.ctx.beginPath();
  this.ctx.moveTo(tBottom.x, tBottom.y); this.ctx.lineTo(tRight.x, tRight.y); this.ctx.lineTo(apex.x, apex.y);
  this.ctx.closePath(); this.ctx.fill(); this.ctx.stroke();
  const doorOnSouth = door && door.y === y1;
  if (doorOnSouth && door) {
    const w = Math.max(10, (gBottom.x - gLeft.x) * 0.16);
    const h = wallH * 0.62;
    const cx = (gLeft.x + gBottom.x) / 2;
    const baseY = (gLeft.y + gBottom.y) / 2;
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(cx - w / 2 - 2, baseY - h - 2, w + 4, h + 4);
    this.ctx.fillStyle = door.type === 'safe_door' ? '#3f5c50' : '#5b7a99';
    this.ctx.fillRect(cx - w / 2, baseY - h, w, h);
    this.ctx.fillStyle = door.isOpen ? '#34d399' : '#ef4444';
    this.ctx.fillRect(cx + w / 2 - 6, baseY - h - 6, 5, 5);
  }
  this.ctx.restore();
  const s = this.toScreen((x0 + x1) / 2, y1);
  const ref = door ?? first;
  this.drawBuildingHp(s.x, s.y - wallH - HOUSE_PEAK_H - 12, ref.hp, ref.maxHp);
}
```

3c. 只让加油站试用新画法（`drawBuilding` 内 `if (b.type === 'wood_wall')` 之前插入，白名单，其余图不动）：

```ts
if ((b.type === 'iron_wall' || b.type === 'stone_wall' || b.type === 'wood_wall' || b.type === 'door' || b.type === 'safe_door') && b.id.startsWith('gas_office')) {
  return;
}
```

注意：本步 `drawHouse` 暂无人调用（调用在 Task 3），本任务只验证编译通过 + 几何单测仍绿。白名单 `return` 是占位 Guard，保证旧分支行为不变。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/house.test.ts --reporter=verbose`
Expected: PASS，3 passed。

Run: `npm run lint`
Expected: exit 0（若报 `HOUSE_PEAK_H` 未使用，把 `apex` 那行保留即已使用；若报 `door` 未使用，检查是否漏了门块）。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/house.ts src/game/house.test.ts
git commit -m "feat(house): add drawHouse single-pass renderer behind gas_office flag"
```

---

### Task 3: render 分组绘制 + 名牌只显最近（治黑字堆叠）

**Files:**
- Modify: `src/game/IsometricEngine.ts:2478-2484`（建筑入队）
- Modify: `src/game/IsometricEngine.ts:3752-3772`（名牌）
- Modify: `src/game/IsometricEngine.ts:3529-3567`（白名单改为全量分组调用）
- Test: `src/game/house.test.ts`

- [ ] **Step 1: Write the failing test**

追加到 `src/game/house.test.ts` 末尾（完整块，直接贴）：

```ts
describe('house label rule', () => {
  it('scattered walls stay separate houses', () => {
    const { groupBuildingsIntoHouses } = require('./house') as typeof import('./house');
    const bs = [
      { id: 'ru_cw_1', type: 'stone_wall', name: '断墙', x: -15, y: -15, hp: 250, maxHp: 600, level: 1, ownerName: '遗迹' },
      { id: 'rift_cover_n1', type: 'iron_wall', name: '残墙', x: 5, y: 5, hp: 300, maxHp: 850, level: 1, ownerName: '先锋' },
    ];
    expect(groupBuildingsIntoHouses(bs as any)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/house.test.ts -t "label rule" --reporter=verbose`
Expected: FAIL with `require is not defined`（ESM 下 require 不可用，先红是对的）。

- [ ] **Step 3: Write minimal implementation**

3a. 把 Step 1 的测试改回 ESM import 风格（替换整块为）：

```ts
import { groupBuildingsIntoHouses as group2 } from './house';
describe('house label rule', () => {
  it('scattered walls stay separate houses', () => {
    const bs = [
      { id: 'ru_cw_1', type: 'stone_wall', name: '断墙', x: -15, y: -15, hp: 250, maxHp: 600, level: 1, ownerName: '遗迹' },
      { id: 'rift_cover_n1', type: 'iron_wall', name: '残墙', x: 5, y: 5, hp: 300, maxHp: 850, level: 1, ownerName: '先锋' },
    ];
    expect(group2(bs as any)).toHaveLength(2);
  });
});
```

注意：文件头已有 `import { groupBuildingsIntoHouses, ... }`，把新增的 `group2` 改为复用已有 import（删除 `import { groupBuildingsIntoHouses as group2 }` 那一行，块内用 `groupBuildingsIntoHouses`），避免重复导入 lint 错。最终新增块为：

```ts
describe('house label rule', () => {
  it('scattered walls stay separate houses', () => {
    const bs = [
      { id: 'ru_cw_1', type: 'stone_wall', name: '断墙', x: -15, y: -15, hp: 250, maxHp: 600, level: 1, ownerName: '遗迹' },
      { id: 'rift_cover_n1', type: 'iron_wall', name: '残墙', x: 5, y: 5, hp: 300, maxHp: 850, level: 1, ownerName: '先锋' },
    ];
    expect(groupBuildingsIntoHouses(bs as any)).toHaveLength(2);
  });
});
```

3b. `render()` 建筑入队改为分组一次绘制（找到 `src/game/IsometricEngine.ts:2478-2484` 的 `this.buildings.forEach((b) => {` 整块，替换为）：

```ts
const houseGroups = groupBuildingsIntoHouses(this.buildings);
houseGroups.forEach((g) => {
  const isSingleWall = g.members.length === 1 && g.door === null;
  const isClosedHouse = g.members.length >= 8;
  if (isClosedHouse) {
    const depths = g.members.map((m) => m.x + m.y);
    renderList.push({
      yDepth: Math.max(...depths),
      render: () => this.drawHouse(g.members, g.door),
    });
  } else if (isSingleWall) {
    const b = g.members[0];
    renderList.push({
      yDepth: b.x + b.y,
      render: () => this.drawBuilding(b),
    });
  } else {
    g.members.forEach((b) => {
      renderList.push({
        yDepth: b.x + b.y,
        render: () => this.drawBuilding(b),
      });
    });
  }
});
```

3c. 删除 Task 2 的 `gas_office` 白名单 Guard（删除 Step 3c 加的那 3 行），改为全量规则：闭合院（≥8 段）走 `drawHouse`，散墙走旧分支。

3d. 名牌只画最近（找到 `src/game/IsometricEngine.ts:3752` 的 `if (b.type !== 'safe_door') {` 改为）：

```ts
if (b.type !== 'safe_door' && this.nearestBuilding?.id === b.id) {
```

`safe_door` 分支不动（堡垒名牌保留，那是肥区战报需要）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/house.test.ts --reporter=verbose`
Expected: PASS，4 passed。

Run: `npm run lint`
Expected: exit 0。

Run: `npm run build`
Expected: `vite build` 成功，`dist/` 生成。

手动验证：`npm run dev` 进加油站（town_gas），办公室应为一座完整房子（两面墙 + 尖顶 + 南面深色门 + 门上小灯），名牌只剩靠近的那一座。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/house.test.ts
git commit -m "feat(house): group render pass and nearest-only labels"
```

---

### Task 4: 全屋顶风格铺开 + 总验（木/石/铁三色 + 截图验收）

**Files:**
- Modify: `src/game/IsometricEngine.ts:3441-3530`（drawHouse 窗/残墙 fallback 微调）
- Test: 全量 `vitest` + `lint` + `build`

- [ ] **Step 1: Write the failing test**

无新增断言。本步的“红”指全量回归：

Run: `npx vitest run --reporter=verbose`
Expected: 若 Task 1-3 全做完则全绿（house 4 + compound 5 + maps 10 + combat/visualTheme 历史用例）；有红则回对应 Task 修，不在本任务打补丁。

- [ ] **Step 2: Run full suite to verify green**

Run: `npx vitest run --reporter=verbose`
Expected: 全绿，0 failed。

- [ ] **Step 3: Write minimal implementation**

3a. 给 `drawHouse` 加窗（在门块之后、`this.ctx.restore();` 之前插入，完整块）：

```ts
const winW = Math.max(8, (gBottom.x - gLeft.x) * 0.1);
const winH = wallH * 0.28;
const winCx = (gBottom.x + gRight.x) / 2;
const winBaseY = (gBottom.y + gRight.y) / 2 - wallH * 0.45;
this.ctx.fillStyle = '#0f172a';
this.ctx.fillRect(winCx - winW / 2 - 1, winBaseY - winH - 1, winW + 2, winH + 2);
this.ctx.fillStyle = '#fde68a';
this.ctx.fillRect(winCx - winW / 2, winBaseY - winH, winW, winH);
```

3b. 残墙 fallback 高度压低（找到 `drawWallSeg(s.x, s.y, facing, 36, 15, 36,` 那行的 `36` 高度只改残墙调用处，不改正常墙）：凡 `hp < maxHp` 的墙段调用，高度参数传 `22` 而不是 `36`。对应代码在 `drawBuilding` 的 `stone_wall/iron_wall` 分支，改为：

```ts
const isRuin = b.hp < b.maxHp;
const ruinH = b.type === 'iron_wall' ? (isRuin ? 22 : 40) : (isRuin ? 20 : 36);
```

并把原 `drawWallSeg(s.x, s.y, facing, 36, 15, 36,` 的第三个 `36` 换成 `ruinH`（stone 分支），`drawWallSeg(s.x, s.y, facing, 36, 14, 40,` 的 `40` 换成 `ruinH`（iron 分支）。只换高度数字，颜色/deco 不动。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --reporter=verbose`
Expected: 全绿。

Run: `npm run lint && npm run build`
Expected: 均成功。

手动走图打勾（`npm run dev`，先清编辑器覆盖：控制台执行 `Object.keys(localStorage).filter(k => k.startsWith('sdc_map_override_')).forEach(k => localStorage.removeItem(k)); location.reload();`）：

```text
[ ] town_gas：铁房子 + 尖顶 + 南门深色可辨，窗一扇
[ ] town_street：石房子（五金）+ 木房子（餐馆）各有屋顶，门朝南
[ ] town_ruins：堡垒铁房子闭环 + 塌楼残墙变矮不断环
[ ] mtn_logging：木房子尖顶；marsh_docks：渔屋门朝东正确
[ ] 任意近距离站一座房子旁：只有它显示名牌，其余只剩血条
[ ] 传送门逐个踩一遍可穿，无被房子挡住的门
```

- [ ] **Step 5: Commit**

```bash
git status --short
```

若干净则无需提交，直接贴走图勾选表。若有微调则：

```bash
git add -A
git commit -m "feat(house): windows and ruin height pass"
```

---

## Verification Checklist（执行者逐项打勾）

- [ ] `npx vitest run --reporter=verbose` 全绿（house 4 + compound/maps/combat/visualTheme 历史用例）
- [ ] `npm run lint` exit 0
- [ ] `npm run build` 成功
- [ ] 加油站房子：两面墙 + 尖顶 + 南门深色 + 门灯，缩略距离可辨门
- [ ] 名牌只剩最近一座，无黑字堆叠
- [ ] 残墙变矮，堡垒仍闭环可突袭

## Out of Scope（明确不做）

- 不改 `maps.ts` 数据、`compound.ts` 分组键、碰撞/HP/掉落/门开关逻辑；不引入图片资源；不做室内；`safe_door` 战报名牌保留。
