# Tiles Phase-5A Implementation Plan（A 版地砖 + 8 实体接入）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 10 张 A 版地砖按世界锁定铺进地面菱形格 + van/truck/废料堆/栈道/晶簇/艾伦/薇薇安/无人机 8 实体贴图化，B 版缺失时自动用 A 顶（B 到货需补 preload 清单，见下方勘误）。

**Architecture:** `art.ts` 加 8 单图的 FRAMES/CONTENT（frame 名统一 `'full'`，紧身框已用脚本实测）+ INTERACTABLE 增改；引擎 tile 循环 `fill()` 后按菱形 clip 画 64px 世界锁定采样；B 缺失回退 A；NPC/无人机用身体包裹、武器名牌保留。

**Tech Stack:** TypeScript, Canvas2D clip + drawImage crop sampling, vitest

**Scope notes (deliberate):**
- B 版 10 张缺失：`tileImage` 自动回退 A。
  > **勘误（B 到货后复核）**：`tileImage` 查的是 `artImages` 预载表，B 文件不预载则永远查不到 → 一直回退 A。B 生效需把 10 个文件加进引擎 preload 清单，并把 `(wx+wy)%2` 严格棋盘改成低概率散点。详见 `docs/art-tile-b-handover.md`。
- 活水波光、裂隙辉光缝：返回 null 跳过贴图，程序动画保留。
- 玩家建筑地板（wood/stone/iron）：`continue` 早退，天然跳过贴图。
- veh-truck 无独立类型：van 按 hash 二选一 van/van2，增加残骸多样性。

---

### Task 1: art.ts 单图帧表 + 交互物增改 + 测试

**Files:**
- Modify: `src/game/art.ts` (FRAMES 加 8 单图、CONTENT_BOUNDS 加 8 full、INTERACTABLE 增改）
- Test: `src/game/art.test.ts` (append 2 tests)

- [ ] **Step 1: Write failing tests** — append + import 行加 `themeBackdrop`？不，本 task 只需现有 import（frameContent/interactableSprite 已导入）。append:

```ts
it('single-image sprites use full frame with tight bounds', () => {
  expect(frameContent('veh-van.png', 'full')).toEqual({ x: 97, y: 218, width: 844, height: 615 });
  expect(frameContent('npc-allen.png', 'full')).toEqual({ x: 300, y: 30, width: 394, height: 957 });
  expect(frameContent('drone.png', 'full')).toEqual({ x: 86, y: 222, width: 852, height: 602 });
});
it('interactable table covers van/truck/scrap/pond and cluster crystal', () => {
  expect(interactableSprite('van')).toEqual({ file: 'veh-van.png', frame: 'full', w: 110, h: 80, yOff: 8, alpha: 1 });
  expect(interactableSprite('van2')).toEqual({ file: 'veh-truck.png', frame: 'full', w: 116, h: 77, yOff: 8, alpha: 1 });
  expect(interactableSprite('scrap')).toEqual({ file: 'prop-scrap.png', frame: 'full', w: 72, h: 46, yOff: 4, alpha: 1 });
  expect(interactableSprite('pond')).toEqual({ file: 'prop-pond.png', frame: 'full', w: 84, h: 68, yOff: 6, alpha: 1 });
  expect(interactableSprite('crystal')).toEqual({ file: 'prop-crystal-cluster.png', frame: 'full', w: 40, h: 56, yOff: 4, alpha: 1 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/art.test.ts`
Expected: FAIL（frameContent 回退 null，因为 FRAMES 无此文件）

- [ ] **Step 3: Write minimal implementation** — 3 edits:

(a) FRAMES 末尾（`'ui-chrome.png': {...},` 块之后、`};` 之前）加：
```ts
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
```
ANCHOR: oldString 为 ui-chrome 块尾：
```ts
    'rarity-mythic': { x: 995, y: 862, width: 259, height: 392 },
  },
};
```
（FRAMES 里 `};` 紧跟 ui-chrome 块——执行时若匹配多处，改用更大的 ui-chrome panel 行上下文。）

(b) CONTENT_BOUNDS 加（插在 `'ui-chrome.png'` 块之后）：
```ts
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
```
ANCHOR oldString:
```ts
    'rarity-mythic': { x: 1008, y: 900, width: 225, height: 227 },
  },
};
```

(c) INTERACTABLE_SPRITES：加 4 行、改 crystal 行：
oldString:
```ts
  campfire: { file: 'building-facility.png', frame: 'campfire', w: 64, h: 57, yOff: 4, alpha: 0.9 },
  crystal: { file: 'building-facility.png', frame: 'crystal-anchor', w: 40, h: 54, yOff: 4, alpha: 1 },
};
```
newString:
```ts
  campfire: { file: 'building-facility.png', frame: 'campfire', w: 64, h: 57, yOff: 4, alpha: 0.9 },
  crystal: { file: 'prop-crystal-cluster.png', frame: 'full', w: 40, h: 56, yOff: 4, alpha: 1 },
  van: { file: 'veh-van.png', frame: 'full', w: 110, h: 80, yOff: 8, alpha: 1 },
  van2: { file: 'veh-truck.png', frame: 'full', w: 116, h: 77, yOff: 8, alpha: 1 },
  scrap: { file: 'prop-scrap.png', frame: 'full', w: 72, h: 46, yOff: 4, alpha: 1 },
  pond: { file: 'prop-pond.png', frame: 'full', w: 84, h: 68, yOff: 6, alpha: 1 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/art.test.ts`
Expected: PASS (13 tests)

---

### Task 2: 引擎预加载 18 文件

**Files:**
- Modify: `src/game/IsometricEngine.ts` (preload 一行）

- [ ] **Step 1: 扩展 preload**

oldString:
```ts
    this.artImages = preloadArt(['nature-trees.png', 'char-survivor.png', 'monster-pack.png', 'prop-wreck.png', 'building-facility.png', 'texture-ground.png']);
```
（注：concept-ground 计划搁置，map-*.jpg 预加载合并到本 task 一并加入。）
newString:
```ts
    this.artImages = preloadArt(['nature-trees.png', 'char-survivor.png', 'monster-pack.png', 'prop-wreck.png', 'building-facility.png', 'texture-ground.png', 'map-camp.jpg', 'map-wild.jpg', 'map-water.jpg', 'map-rift.jpg', 'tile-camp-a.png', 'tile-plaza-a.png', 'tile-field-a.png', 'tile-urban-a.png', 'tile-ruins-a.png', 'tile-forest-a.png', 'tile-quarry-a.png', 'tile-lake-a.png', 'tile-marsh-a.png', 'tile-rift-a.png', 'veh-van.png', 'veh-truck.png', 'prop-scrap.png', 'prop-pond.png', 'prop-crystal-cluster.png', 'npc-allen.png', 'npc-vivian.png', 'drone.png']);
```
NOTE: tile-*-b 缺失 404 无害（tileImage 回退 A）。勘误：B 到货后需追加进本清单才能生效（查表制，不预载=查不到）。

- [ ] **Step 2: Run** `npx tsc --noEmit` Expected: PASS

---

### Task 3: 地砖贴图系统（key + 回退 + 菱形采样 + 插入）

**Files:**
- Modify: `src/game/IsometricEngine.ts` (drawArtFrame 后加 3 方法，tile 循环 fill 后插入一行）

- [ ] **Step 1: 加 3 方法** (插在 `drawSurvivorSprite` 方法之后、`private groundPattern` 字段之前）

oldString:
```ts
  /** 本地玩家身体贴图（四向；枪械/名牌仍 procedural）。 */
  private drawSurvivorSprite(px: number, pyFeet: number, angle: number): boolean {
    const frame = angleToSurvivorFrame(angle);
    return this.drawArtFrame('char-survivor.png', frame, px - 17, pyFeet - 78, 34, 78);
  }
```
newString: same + append:
```ts

  /**
   * 地砖贴图主题：与地面 fill 分支同逻辑（camp 中心 plaza、活水/裂缝返回 null 走程序动画）。
   */
  private tileTextureKey(wx: number, wy: number, theme: string): string | null {
    if (theme === 'camp') {
      if (Math.hypot(wx, wy) < 3.8) return 'plaza';
      if (wx >= -6 && wx <= 6 && wy >= -5 && wy <= 5) return 'forest';
      return 'camp';
    }
    if (theme === 'urban' || theme === 'ruins') {
      return Math.abs(wx + wy) < 4.8 ? 'urban' : 'ruins';
    }
    if (theme === 'lake') {
      const isDock = (wx >= -2 && wx <= 4 && (wy === 0 || wy === -2 || wy === 2)) || (wx >= 1 && wx <= 3 && wy >= -3 && wy <= 3);
      if (isDock) return 'forest';
      if (wx < 3) return null;
      return 'marsh';
    }
    if (theme === 'marsh') return 'marsh';
    if (theme === 'quarry') return 'quarry';
    if (theme === 'forest') return 'forest';
    if (theme === 'field') return 'field';
    if (theme === 'plaza') return 'plaza';
    if (theme === 'rift') {
      if (Math.abs(wx - wy) < 1.8 || Math.abs(wx + wy) < 1.4) return null;
      return 'rift';
    }
    return 'camp';
  }

  /** 地砖图：B 缺失回退 A（文件到货零改代码）；都不在返回 null。 */
  private tileImage(theme: string, variant: 'a' | 'b'): HTMLImageElement | null {
    const get = (v: string) => this.artImages.get(`/art/tile-${theme}-${v}.png`) ?? null;
    const ok = (img: HTMLImageElement | null): img is HTMLImageElement =>
      !!img && img.complete && img.naturalWidth > 0;
    const primary = get(variant);
    if (ok(primary)) return primary;
    if (variant !== 'a') {
      const fallback = get('a');
      if (ok(fallback)) return fallback;
    }
    return null;
  }

  /** 菱形格贴图：clip 当前菱形 path，按世界坐标采样 64px patch（512 图内），失败静默。 */
  private drawTileTexture(wx: number, wy: number, sx: number, sy: number, theme: string) {
    const key = this.tileTextureKey(wx, wy, theme);
    if (!key) return;
    const variant = ((wx + wy) % 2 === 0) ? 'a' : 'b';
    const img = this.tileImage(key, variant);
    if (!img) return;
    const TW = 64;
    const span = 512 - TW;
    const px = (((wx * 32) % span) + span) % span;
    const py = (((wy * 32) % span) + span) % span;
    this.ctx.save();
    this.ctx.clip();
    this.ctx.drawImage(img, px, py, TW, TW, sx - 32, sy - 32, 64, 64);
    this.ctx.restore();
  }
```

- [ ] **Step 2: tile 循环插入** (fill 之后、seam 注释之前；此时菱形 path 仍 current，wx/wy/theme 在作用域）

oldString:
```ts
        this.ctx.fill();

        // Only draw construction seams on human-made placed floors or camp central stonework, NEVER on natural lake/soil
```
newString:
```ts
        this.ctx.fill();

        // 地砖贴图（tile-*-a/b 世界锁定采样；无图/水波/裂缝静默跳过 = 纯 flat）
        this.drawTileTexture(wx, wy, s.x, s.y, theme);

        // Only draw construction seams on human-made placed floors or camp central stonework, NEVER on natural lake/soil
```

- [ ] **Step 3: Run** `npx tsc --noEmit` Expected: PASS

---

### Task 4: 交互物 van/scrap/pond/crystal 接线

**Files:**
- Modify: `src/game/IsometricEngine.ts` (drawInteractable 4 个 case)

- [ ] **Step 1: van（hash 二选一残骸）**

oldString:
```ts
      case 'van':
        this.drawTruck(it.x, it.y);
```
newString:
```ts
      case 'van': {
        const wreckKey = this.hash2(it.x, it.y) > 0.5 ? 'van2' : 'van';
        if (!this.tryInteractableSprite(wreckKey, it.x, it.y)) this.drawTruck(it.x, it.y);
      }
```
NOTE: case 块加花括号（const 需块作用域）。

- [ ] **Step 2: scrap**

oldString:
```ts
      case 'scrap':
        this.drawScrapPile(it.x, it.y);
```
newString:
```ts
      case 'scrap':
        if (!this.tryInteractableSprite('scrap', it.x, it.y)) this.drawScrapPile(it.x, it.y);
```

- [ ] **Step 3: pond**

oldString:
```ts
      case 'pond':
        this.drawPierDock(it.x, it.y, 2);
```
newString:
```ts
      case 'pond':
        if (!this.tryInteractableSprite('pond', it.x, it.y)) this.drawPierDock(it.x, it.y, 2);
```

- [ ] **Step 4: crystal** — INTERACTABLE 已换晶簇，case 逻辑不动（try→晶簇，失败→spite/flora）。SKIP，无改动。

- [ ] **Step 5: Run** `npx tsc --noEmit` Expected: PASS

---

### Task 5: 艾伦/薇薇安/无人机贴图（武器名牌保留）

**Files:**
- Modify: `src/game/IsometricEngine.ts` (3 处身体包裹）

- [ ] **Step 1: Allen 开合** (bodyBob? Allen 方法无 bob，用 s.y）

oldString:
```ts
    // 2. Heavy Pneumatic Exoskeleton Boots
```
newString:
```ts
    const allenSprite = this.drawWorldSprite('npc-allen.png', 'full', tm.x, tm.y, 35, 84);
    if (!allenSprite) {
    // 2. Heavy Pneumatic Exoskeleton Boots
```

oldString:
```ts
    this.ctx.shadowBlur = 0;

    // 6. Two-Handed Heavy Kinetic Breaching Maul (气动重锤)
```
newString:
```ts
    this.ctx.shadowBlur = 0;
    }

    // 6. Two-Handed Heavy Kinetic Breaching Maul (气动重锤)
```

- [ ] **Step 2: Vivian 开合**

oldString:
```ts
    // 2. Sleek Tactical Speed Boots
```
newString:
```ts
    const vivianSprite = this.drawWorldSprite('npc-vivian.png', 'full', tm.x, tm.y, 28, 84);
    if (!vivianSprite) {
    // 2. Sleek Tactical Speed Boots
```

oldString:
```ts
    this.ctx.shadowBlur = 0;

    // 8. Tactical Identifier Badge
```
newString:
```ts
    this.ctx.shadowBlur = 0;
    }

    // 8. Tactical Identifier Badge
```

- [ ] **Step 3: Drone 开合** (机身+镜头包，激光扇/频闪保留；悬浮 yOff=-18+hover*22)

oldString:
```ts
    // 2. Carbon-Fiber Stealth Aerofoil Chassis
```
newString:
```ts
    if (!this.drawWorldSprite('drone.png', 'full', wx, wy, 56, 40, -18 + hoverOffset * 22)) {
    // 2. Carbon-Fiber Stealth Aerofoil Chassis
```

oldString:
```ts
    // 4. Aviation Strobe Navigation Lights (Port Red, Starboard Green)
```
newString:
```ts
    }
    // 4. Aviation Strobe Navigation Lights (Port Red, Starboard Green)
```
NOTE: 先读 strobe 段确认 `// 4.` 注释精确文本（plan 按 5558 行所见写；若不匹配，用 strobe 段首两行做 oldString）。

- [ ] **Step 4: Run** `npx tsc --noEmit` Expected: PASS

---

### Task 6: 全量验证

- [ ] **Step 1: Run** `npx vitest run` Expected: 全部 PASS（含新增 2 用例，共 131）
- [ ] **Step 2: Run** `npm run build` Expected: dist 构建成功
