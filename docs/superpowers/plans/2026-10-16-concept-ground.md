# Concept-Ground Implementation Plan（预览大图 = 游戏地面）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把四张地图预览大图直接铺进游戏地面：tile 照常画（世界锁定），预览图 cover 全屏盖 0.35 + 0.08 微视差，地面像素即概念图，放哪张图进哪张图。

**Architecture:** `art.ts` 加 `themeBackdrop(theme)→文件名`（与 WorldMapModal/App 的映射同表）；引擎 `renderMapGround` 尾部（noise 之后、restore 之前）调 `renderConceptBackdrop()`；图未就绪直接跳过 = 零风险回退。

**Tech Stack:** TypeScript, Canvas2D drawImage cover-fit, vitest

**Scope notes (deliberate):**
- tile 循环一行不改：建造地板、碰撞、寻路、小地图取色全部不受影响。
- 实体/雾霾/HUD 都在上层：只有地面多一层概念图罩染。
- 可调就两个数：BACKDROP_ALPHA 0.35、视差 0.08，都在方法内注释标出。

---

### Task 1: themeBackdrop + 测试

**Files:**
- Modify: `src/game/art.ts` (末尾追加）
- Test: `src/game/art.test.ts` (append 1 test)

- [ ] **Step 1: Write failing test** — append to `src/game/art.test.ts`:

```ts
import { themeBackdrop } from './art';

it('themeBackdrop maps every theme to a preview file', () => {
  expect(themeBackdrop('camp')).toBe('map-camp.jpg');
  expect(themeBackdrop('forest')).toBe('map-wild.jpg');
  expect(themeBackdrop('quarry')).toBe('map-wild.jpg');
  expect(themeBackdrop('lake')).toBe('map-water.jpg');
  expect(themeBackdrop('marsh')).toBe('map-water.jpg');
  expect(themeBackdrop('rift')).toBe('map-rift.jpg');
  expect(themeBackdrop('unknown_xyz')).toBe('map-camp.jpg');
});
```
NOTE: 先确认 import 行已含 themeBackdrop 再加——本 step 包含 import 修改：
oldString: `import { frameRect, iconFor, spriteStyle, angleToSurvivorFrame, frameContent, interactableSprite, buildingSprite, rarityFrameStyle } from './art';`
newString: `import { frameRect, iconFor, spriteStyle, angleToSurvivorFrame, frameContent, interactableSprite, buildingSprite, rarityFrameStyle, themeBackdrop } from './art';`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/art.test.ts`
Expected: FAIL with "does not provide an export named 'themeBackdrop'"

- [ ] **Step 3: Write minimal implementation** — append to end of `src/game/art.ts`:

```ts
const THEME_BACKDROP: Record<string, string> = {
  camp: 'map-camp.jpg', plaza: 'map-camp.jpg', urban: 'map-camp.jpg',
  ruins: 'map-camp.jpg', field: 'map-camp.jpg',
  forest: 'map-wild.jpg', quarry: 'map-wild.jpg',
  lake: 'map-water.jpg', marsh: 'map-water.jpg',
  rift: 'map-rift.jpg',
};

/** 主题→概念预览大图文件名（与 WorldMapModal/App splash 同表）；未知主题回退营地。 */
export function themeBackdrop(theme: string): string {
  return THEME_BACKDROP[theme] ?? 'map-camp.jpg';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/art.test.ts`
Expected: PASS (12 tests)

---

### Task 2: 引擎概念图地面（预加载 + 方法 + 调用）

**Files:**
- Modify: `src/game/IsometricEngine.ts` (import、preload、新增方法、renderMapGround 尾部调用）

- [ ] **Step 1: import + preload**

oldString:
```ts
import { frameContent, angleToSurvivorFrame, interactableSprite, buildingSprite, preloadArt } from './art';
```
newString:
```ts
import { frameContent, angleToSurvivorFrame, interactableSprite, buildingSprite, preloadArt, themeBackdrop } from './art';
```

oldString:
```ts
    this.artImages = preloadArt(['nature-trees.png', 'char-survivor.png', 'monster-pack.png', 'prop-wreck.png', 'building-facility.png', 'texture-ground.png']);
```
newString:
```ts
    this.artImages = preloadArt(['nature-trees.png', 'char-survivor.png', 'monster-pack.png', 'prop-wreck.png', 'building-facility.png', 'texture-ground.png', 'map-camp.jpg', 'map-wild.jpg', 'map-water.jpg', 'map-rift.jpg']);
```

- [ ] **Step 2: 新增方法** (插在 renderWeather 之前）

oldString:
```ts
  private renderWeather() {
```
newString:
```ts
  // --- CONCEPT BACKDROP（预览大图 cover 全屏盖 tile：BACKDROP_ALPHA 透明度 + 视差因子，放图失败直接跳过） ---
  private renderConceptBackdrop() {
    const BACKDROP_ALPHA = 0.35;
    const PARALLAX = 0.08;
    const img = this.artImages.get(`/art/${themeBackdrop(this.getGroundTheme())}`);
    if (!img || !img.complete || img.naturalWidth === 0) return;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;
    const scale = Math.max(this.width / iw, this.height / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const ox = Math.min(0, Math.max(this.width - dw, (this.width - dw) / 2 - this.camera.x * PARALLAX));
    const oy = Math.min(0, Math.max(this.height - dh, (this.height - dh) / 2 - this.camera.y * PARALLAX));
    this.ctx.save();
    this.ctx.globalAlpha = BACKDROP_ALPHA;
    this.ctx.drawImage(img, ox, oy, dw, dh);
    this.ctx.restore();
  }

  private renderWeather() {
```

- [ ] **Step 3: renderMapGround 尾部调用** (noise 之后、restore 之前）

oldString:
```ts
    this.ctx.restore();
  }

  // --- MAP SPECIFIC PROPS DRAWING ---
```
newString:
```ts
    // 概念图罩染（预览大图盖 tile；图未就绪则跳过 = 纯 tile）
    this.renderConceptBackdrop();

    this.ctx.restore();
  }

  // --- MAP SPECIFIC PROPS DRAWING ---
```

- [ ] **Step 4: Run** `npx tsc --noEmit` Expected: PASS

---

### Task 3: 全量验证

- [ ] **Step 1: Run** `npx vitest run` Expected: 全部 PASS（含新增 1 用例，共 130）
- [ ] **Step 2: Run** `npm run build` Expected: dist 构建成功
