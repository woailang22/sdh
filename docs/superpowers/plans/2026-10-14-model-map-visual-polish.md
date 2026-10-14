# 模型与地图视觉优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Canvas 直绘的“棋盘格地面 + 散装色值 + 火柴人模型”升级为统一美术风格：低对比地形、柔和阴影+轮廓光、主题化植被/建筑/角色、小地图与世界地图可读性提升，全程不改 gameplay 数值。

**Architecture:** 新增 `src/game/visualTheme.ts` 收敛所有色板与纯函数（可单元测试）；`IsometricEngine.ts` 只做薄渲染层调用；`RadarMinimap.tsx` / `WorldMapModal.tsx` 复用同一套主题色与图标语义。先测后改，每任务独立可验证。

**Tech Stack:** TypeScript + Canvas2D + React 19 + Tailwind 4 + Vite 8 + Vitest 3（新增，仅跑纯函数单测）

---

## File Structure

| 文件 | 职责 | 改动性质 |
|---|---|---|
| `src/game/visualTheme.ts`（新建，约120行） | 唯一真相色板：`THEME_PALETTE`、`groundBaseColor()`、`hash2()`、`withAlpha()`、`healthBarColor()`、`radarDotColor()`、`themeAccent()` | Create |
| `src/game/visualTheme.test.ts`（新建） | Vitest 单测：色板对比度、hash 确定性、alpha 拼接、血条分段 | Create |
| `src/game/IsometricEngine.ts:2433-2932` `renderMapGround()` | 地面菱形 tile 填充 + 杂点装饰 | Modify |
| `src/game/IsometricEngine.ts:3267-3275` `hash2()` | 挪到 visualTheme，引擎 re-export 保持兼容 | Modify |
| `src/game/IsometricEngine.ts:3781-3995` `drawPineTree/drawOakTree/drawWastelandShrub/drawReedsAndLilies/drawRiftCrystallineFlora` | 植被/装饰模型统一阴影+受光面 | Modify |
| `src/game/IsometricEngine.ts:4193-4770` `drawMonster/drawPlayer/drawRemotePlayer` | 角色统一描边+轮廓光+血条 | Modify |
| `src/game/IsometricEngine.ts:2981-3230` `drawTruck/drawOilTanker/drawSupplyChest/drawRiftMonolith/drawQuarryBoulders` + `3406-3740` `drawBuilding/drawBuildingHp` + `5548-5649` `drawWaypointPortal` | 建筑/载具/传送门抛光 | Modify |
| `src/game/IsometricEngine.ts:5290-5420` `renderDynamicLighting()` + `initWeather/renderWeather` | 光照与天气氛围 | Modify |
| `src/components/RadarMinimap.tsx:35-178` | 小地图：主题底 + 图例 + 北向针 | Modify |
| `src/components/WorldMapModal.tsx:26-31,134-218` | 世界地图：SVG 缩略预览 + 层级清理 | Modify |
| `package.json:6-13` scripts | 新增 `"test": "vitest run"` | Modify |
| `package.json:27-38` devDependencies | 新增 `"vitest": "^3.0.0"` | Modify |

设计决策（锁定）：
- 不引入图片/精灵集：保持零资源 Canvas 直绘，只修配色、对比、阴影、描边、构图。原因：YAGNI，避免资源管线。
- 棋盘对比度上限：同一主题两 tile 色差 ΔL ≤ 6%，不再用 `(wx+wy)%2 ? '#a77348' : '#94633a'` 这种高差写法。
- 全局光方向锁定：左上光（-0.5,-0.8），所有高光统一画在左上，受影在右下。阴影统一用 `createRadialGradient` 椭圆，不再混用纯色 ellipse。
- `shadowBlur` 禁止在每 tile 调用，只允许 BOSS 核心/传送门 2 处，且半径缓存。

---

### Task 1: 测试基座 + visualTheme 色板抽离

**Files:**
- Create: `src/game/visualTheme.ts`
- Create: `src/game/visualTheme.test.ts`
- Modify: `package.json:6-13`
- Test: `src/game/visualTheme.test.ts`

- [ ] **Step 1: Write the failing test**

创建 `src/game/visualTheme.test.ts`，完整内容如下（直接复制可用）：

```ts
import { describe, expect, it } from 'vitest';
import { groundBaseColor, hash2, withAlpha, healthBarColor, themeAccent } from './visualTheme';

describe('visualTheme', () => {
  it('same tile coordinate is deterministic', () => {
    expect(groundBaseColor('camp', 3, -2)).toBe(groundBaseColor('camp', 3, -2));
  });
  it('checker contrast is subtle (not ugly high-contrast)', () => {
    const a = groundBaseColor('camp', 0, 0);
    const b = groundBaseColor('camp', 1, 0);
    expect(a).not.toBe(b);
    // 两色必须是同色系微差：直接断言我们锁定的色板值
    expect([a, b].sort().join(',')).toBe('#3a6b47,#3d704b');
  });
  it('hash2 is deterministic in [0,1)', () => {
    expect(hash2(3, 7)).toBe(hash2(3, 7));
    expect(hash2(3, 7)).toBeGreaterThanOrEqual(0);
    expect(hash2(3, 7)).toBeLessThan(1);
  });
  it('withAlpha appends alpha correctly', () => {
    expect(withAlpha('#38bdf8', 0.5)).toBe('rgba(56, 189, 248, 0.5)');
  });
  it('health bar color segments', () => {
    expect(healthBarColor(0.8)).toBe('#22c55e');
    expect(healthBarColor(0.45)).toBe('#f59e0b');
    expect(healthBarColor(0.15)).toBe('#ef4444');
  });
  it('theme accent is defined for all themes', () => {
    expect(themeAccent('rift')).toBe('#c026d3');
    expect(themeAccent('lake')).toBe('#38bdf8');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: FAIL with `Error: Failed to resolve import "./visualTheme" from "src/game/visualTheme.test.ts"`（文件还不存在）。如果提示 `vitest: command not found`，先跑 Step 3 的安装再重跑，本步预期依然是模块缺失失败。

- [ ] **Step 3: Write minimal implementation**

创建 `src/game/visualTheme.ts`，完整内容如下：

```ts
// 唯一真相色板：所有 Canvas 直绘与小地图/世界地图都从这里取色。
export type GroundTheme =
  | 'camp' | 'plaza' | 'field' | 'urban' | 'ruins'
  | 'forest' | 'quarry' | 'lake' | 'marsh' | 'rift';

const HEX_RE = /^#([0-9a-fA-F]{6})$/;

function hexToRgb(hex: string): [number, number, number] {
  const m = HEX_RE.exec(hex);
  if (!m) throw new Error(`bad hex color: ${hex}`);
  const v = m[1];
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}

// camp 主色微差对（ΔL 约 4%，测试锁死这两个值）
const CAMP_A = '#3a6b47';
const CAMP_B = '#3d704b';

const BASE_PAIRS: Record<GroundTheme, [string, string]> = {
  camp: [CAMP_A, CAMP_B],
  plaza: ['#666f7e', '#6a7382'],
  field: ['#3a6b47', '#3d6f4a'],
  urban: ['#333b47', '#353d49'],
  ruins: ['#463c31', '#493e33'],
  forest: ['#4a3a24', '#4d3d26'],
  quarry: ['#646b78', '#676e7b'],
  lake: ['#0369a1', '#0370ab'],
  marsh: ['#2f4f3a', '#314f3b'],
  rift: ['#241033', '#261239'],
};

const ACCENTS: Record<GroundTheme, string> = {
  camp: '#34d399', plaza: '#94a3b8', field: '#4ade80',
  urban: '#f59e0b', ruins: '#a16207', forest: '#16a34a',
  quarry: '#94a3b8', lake: '#38bdf8', marsh: '#2dd4bf', rift: '#c026d3',
};

export function themeAccent(theme: GroundTheme): string {
  return ACCENTS[theme];
}

export function hash2(x: number, y: number): number {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  h = h - Math.floor(h);
  return h;
}

export function groundBaseColor(theme: GroundTheme, wx: number, wy: number): string {
  const pair = BASE_PAIRS[theme] ?? BASE_PAIRS.camp;
  const isEven = (wx + wy) % 2 === 0;
  // camp 锁死测试期望，其他主题走同一微差逻辑
  return isEven ? pair[0] : pair[1];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function healthBarColor(ratio: number): string {
  if (ratio > 0.55) return '#22c55e';
  if (ratio > 0.28) return '#f59e0b';
  return '#ef4444';
}

export function radarDotColor(kind: 'building' | 'interactable' | 'teammate' | 'monster' | 'waypoint'): string {
  switch (kind) {
    case 'building': return '#38bdf8';
    case 'interactable': return '#f59e0b';
    case 'teammate': return '#10b981';
    case 'monster': return '#ef4444';
    case 'waypoint': return '#06b6d4';
  }
}
```

修改 `package.json` 两处（先读文件确认行号，再改）：

```json
"scripts": {
  "dev": "tsx server.ts",
  "start": "tsx server.ts",
  "build": "vite build",
  "preview": "vite preview",
  "clean": "rm -rf dist server.js",
  "lint": "tsc --noEmit",
  "test": "vitest run"
}
```

并在 `devDependencies` 追加一行 `"vitest": "^3.0.0",`（保持字母序，放在 `typescript` 之前）。

安装：`npm install -D vitest@^3.0.0`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: PASS，`Test Files 1 passed (1)`，`Tests 6 passed (6)`。

再跑类型检查：`npm run lint`
Expected: 无输出（exit 0）。有错则修类型再重跑。

- [ ] **Step 5: Commit**

```bash
git add src/game/visualTheme.ts src/game/visualTheme.test.ts package.json package-lock.json
git commit -m "feat(visual): add visualTheme palette with tests"
```

---

### Task 2: 地面 tile 去“棋盘格丑”——低对比 + 噪点纹理

**Files:**
- Modify: `src/game/IsometricEngine.ts:1-3`（加 import）
- Modify: `src/game/IsometricEngine.ts:2433-2700`（`renderMapGround` 主体）
- Test: `src/game/visualTheme.test.ts`（复用 Task 1，不新增文件）

- [ ] **Step 1: Write the failing test**

在 `src/game/visualTheme.test.ts` 末尾追加（完整块，直接贴）：

```ts
describe('ground texture rules', () => {
  it('urban road center uses asphalt pair, not concrete gray', () => {
    // 约束：urban 主 tile 必须是深沥青系，由 groundBaseColor 保证
    expect(groundBaseColor('urban', 0, 0)).toBe('#333b47');
    expect(groundBaseColor('urban', 1, 0)).toBe('#353d49');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/visualTheme.test.ts -t "urban road center" --reporter=verbose`
Expected: FAIL（当前 `BASE_PAIRS.urban` 若与期望不一致则红；若已一致则把期望改成新值先看红再改回——本计划已锁死 `#333b47/#353d49`，首次跑应 PASS，这种情况下把本步视为“验证约束存在”，继续 Step 3）。

- [ ] **Step 3: Write minimal implementation**

3a. 文件头加 import（`src/game/IsometricEngine.ts:1-3`）：

```ts
import { soundManager } from '../audio/soundManager';
import { SUBMAPS, displayName, regionOf, lootResourceOf } from './maps';
import { groundBaseColor, hash2 as hash2Pure, withAlpha, themeAccent } from './visualTheme';
```

3b. 替换 `renderMapGround` 的 B 段配色逻辑。找到 `// B. Natural Map Terrain By Zone (theme-driven):` 开始的 `if (theme === 'camp') { ... } else if (theme === 'rift') { ... }` 整块（约 153 行），替换为以下完整块（直接覆盖，保持缩进 8 空格）：

```ts
// B. Natural Map Terrain By Zone (theme-driven, low-contrast):
const gkey = (theme === 'camp' || theme === 'plaza' || theme === 'field' || theme === 'urban' || theme === 'ruins' || theme === 'forest' || theme === 'quarry' || theme === 'lake' || theme === 'marsh' || theme === 'rift') ? theme : 'camp';
if (theme === 'camp') {
  const inLivingBase = wx >= -6 && wx <= 6 && wy >= -5 && wy <= 5;
  const distToCenter = Math.hypot(wx, wy);
  if (distToCenter < 3.8) {
    this.ctx.fillStyle = groundBaseColor('plaza', wx, wy);
  } else if (inLivingBase) {
    this.ctx.fillStyle = groundBaseColor('forest', wx, wy);
  } else {
    this.ctx.fillStyle = groundBaseColor('camp', wx, wy);
  }
} else if (theme === 'plaza') {
  this.ctx.fillStyle = groundBaseColor('plaza', wx, wy);
} else if (theme === 'field') {
  this.ctx.fillStyle = groundBaseColor('field', wx, wy);
} else if (theme === 'urban' || theme === 'ruins') {
  const distToExpressway = Math.abs(wx + wy);
  if (distToExpressway < 4.8) {
    this.ctx.fillStyle = groundBaseColor('urban', wx, wy);
  } else if (distToExpressway < 7.2) {
    this.ctx.fillStyle = groundBaseColor('ruins', wx, wy);
  } else {
    this.ctx.fillStyle = groundBaseColor('ruins', wx, wy);
  }
} else if (theme === 'lake') {
  const isDock = (wx >= -2 && wx <= 4 && (wy === 0 || wy === -2 || wy === 2)) || (wx >= 1 && wx <= 3 && wy >= -3 && wy <= 3);
  if (isDock) {
    this.ctx.fillStyle = groundBaseColor('forest', wx, wy);
  } else if (wx < 3) {
    const wave = Math.sin(this.gameTime * 2.4 + wx * 0.8 + wy * 0.8);
    this.ctx.fillStyle = wave > 0 ? '#0370ab' : '#0369a1';
  } else {
    this.ctx.fillStyle = groundBaseColor('marsh', wx, wy);
  }
} else if (theme === 'marsh') {
  this.ctx.fillStyle = groundBaseColor('marsh', wx, wy);
} else if (theme === 'quarry') {
  this.ctx.fillStyle = groundBaseColor('quarry', wx, wy);
} else if (theme === 'forest') {
  this.ctx.fillStyle = groundBaseColor('forest', wx, wy);
} else if (theme === 'rift') {
  if (Math.abs(wx - wy) < 1.8 || Math.abs(wx + wy) < 1.4) {
    const pulse = (Math.sin(this.gameTime * 4.5 + wx * 1.2 + wy * 1.2) + 1) * 0.5;
    this.ctx.fillStyle = pulse > 0.5 ? '#7e22ce' : '#6b21a8';
  } else {
    this.ctx.fillStyle = groundBaseColor('rift', wx, wy);
  }
} else {
  this.ctx.fillStyle = groundBaseColor(gkey as 'camp', wx, wy);
}
```

3c. 同一函数内删除“野花小石子 fillRect 噪点”三处硬杂点，替换为统一 alpha 点（找到 `// 野花与小石子（哈希分布）` 约 8 行，替换为）：

```ts
// 野花与小石子：统一用 withAlpha 低饱和点，不再用纯 #f9a8d4 高饱和方块
const wildN = hash2Pure(wy * 3 + 11, wx * 5 + 7);
if (wildN > 0.955) {
  this.ctx.fillStyle = withAlpha('#fde68a', 0.55);
  this.ctx.beginPath();
  this.ctx.arc(s.x + 6, s.y - 2, 1.6, 0, Math.PI * 2);
  this.ctx.fill();
} else if (wildN < 0.045) {
  this.ctx.fillStyle = withAlpha('#94a3b8', 0.5);
  this.ctx.beginPath();
  this.ctx.arc(s.x - 7, s.y + 2, 1.4, 0, Math.PI * 2);
  this.ctx.fill();
}
```

3d. 类内 `hash2` 改为委托（找到 `private hash2(x: number, y: number): number {` 约 8 行，替换为）：

```ts
private hash2(x: number, y: number): number {
  return hash2Pure(x, y);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: PASS，7 passed。

Run: `npm run lint`
Expected: exit 0 无报错。

手动验证：`npm run dev` 打开后看营地广场，tile 应为暗绿微差、无高亮黄钉（`#fde047` 已删），路缘为深沥青。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/visualTheme.ts src/game/visualTheme.test.ts
git commit -m "feat(visual): low-contrast ground tiles and subtle texture dots"
```

---

### Task 3: 统一阴影 + 描边 + 血条（所有模型共用）

**Files:**
- Modify: `src/game/visualTheme.ts`（追加 3 个纯函数）
- Modify: `src/game/visualTheme.test.ts`（追加 3 个单测）
- Modify: `src/game/IsometricEngine.ts:3406-3420`（`drawBuilding` 开头）、`3740-3752`（`drawBuildingHp`）
- Test: `src/game/visualTheme.test.ts`

- [ ] **Step 1: Write the failing test**

在 `src/game/visualTheme.test.ts` 末尾追加：

```ts
describe('shared model helpers', () => {
  it('outline color for dark and light sprites', () => {
    const { outlineFor } = require('./visualTheme') as typeof import('./visualTheme');
    expect(outlineFor('#180728')).toBe('#e9d5ff');
    expect(outlineFor('#e8e4d8')).toBe('#1c1917');
  });
  it('shadow radius scales with footprint', () => {
    const { shadowRadius } = require('./visualTheme') as typeof import('./visualTheme');
    expect(shadowRadius('small')).toBe(18);
    expect(shadowRadius('large')).toBe(32);
  });
});
```

注：用 `require` 是为了本步先红（`outlineFor/shadowRadius` 还不存在，TS 会报 `Property does not exist`）。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/visualTheme.test.ts -t "shared model helpers" --reporter=verbose`
Expected: FAIL with `outlineFor is not a function` 或 `Property 'outlineFor' does not exist`。

- [ ] **Step 3: Write minimal implementation**

在 `src/game/visualTheme.ts` 末尾追加（完整块）：

```ts
export function outlineFor(fillHex: string): string {
  // 深色填充用浅紫白描边，浅色填充用深棕描边，保证 3:1 以上对比
  const darkFills = new Set(['#180728', '#170624', '#292524', '#44403c', '#3a2013', '#422817']);
  if (darkFills.has(fillHex.toLowerCase())) return '#e9d5ff';
  // 默认按亮度判断：以 #808080 为界
  try {
    const [r, g, b] = hexToRgb(fillHex);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum < 0.45 ? '#e9d5ff' : '#1c1917';
  } catch {
    return '#1c1917';
  }
}

export function shadowRadius(size: 'small' | 'medium' | 'large'): number {
  if (size === 'small') return 18;
  if (size === 'large') return 32;
  return 24;
}

export function drawSoftShadow(
  ctx: CanvasRenderingContext2D, sx: number, sy: number, radius: number
): void {
  const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, radius);
  g.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
  g.addColorStop(0.7, 'rgba(0, 0, 0, 0.18)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, radius, radius * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
}
```

把测试改回 ES import 风格（替换 Step 1 整块为）：

```ts
import { outlineFor, shadowRadius } from './visualTheme';
describe('shared model helpers', () => {
  it('outline color for dark and light sprites', () => {
    expect(outlineFor('#180728')).toBe('#e9d5ff');
    expect(outlineFor('#e8e4d8')).toBe('#1c1917');
  });
  it('shadow radius scales with footprint', () => {
    expect(shadowRadius('small')).toBe(18);
    expect(shadowRadius('large')).toBe(32);
  });
});
```

引擎侧最小接入（只改两处，保持 diff 小）：
- `src/game/IsometricEngine.ts` 文件头 import 追加 `drawSoftShadow, healthBarColor`：

```ts
import { groundBaseColor, hash2 as hash2Pure, withAlpha, themeAccent, drawSoftShadow, healthBarColor } from './visualTheme';
```

- `drawBuildingHp(x, y, hp, maxHp)` 内血条填充替换为 `healthBarColor`（找到 `this.ctx.fillStyle = hpGrad;` 前后，保留渐变背板，只把填充色逻辑换成）：

```ts
const ratio = Math.max(0, Math.min(1, hp / maxHp));
this.ctx.fillStyle = healthBarColor(ratio);
const barW = 46;
this.ctx.fillRect(x - barW / 2, y, barW * ratio, 5);
```

（如果原函数签名是 `(x, y, hp, maxHp)` 且内部已有 `barW`，删除重复声明只留一份；以 lint 通过为准。）

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: PASS，9 passed。

Run: `npm run lint`
Expected: exit 0。

- [ ] **Step 5: Commit**

```bash
git add src/game/visualTheme.ts src/game/visualTheme.test.ts src/game/IsometricEngine.ts
git commit -m "feat(visual): shared shadow outline and healthbar helpers"
```

---

### Task 4: 植被与装饰抛光（松/橡/灌木/芦苇/裂隙花）

**Files:**
- Modify: `src/game/IsometricEngine.ts:3781-3991`（`drawPineTree/drawOakTree/drawWastelandShrub/drawReedsAndLilies/drawRiftCrystallineFlora`）
- Test: `src/game/visualTheme.test.ts`（断言受光色存在，不测像素）

- [ ] **Step 1: Write the failing test**

追加到 `src/game/visualTheme.test.ts`：

```ts
describe('flora palette', () => {
  it('pine highlight is brighter than base', () => {
    const { pineColors } = require('./visualTheme') as typeof import('./visualTheme');
    expect(pineColors().highlight).toBe('#4ade80');
    expect(pineColors().base).toBe('#0d381e');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/visualTheme.test.ts -t "flora palette" --reporter=verbose`
Expected: FAIL with `pineColors is not a function`。

- [ ] **Step 3: Write minimal implementation**

3a. `src/game/visualTheme.ts` 末尾追加：

```ts
export function pineColors(): { base: string; mid: string; highlight: string; trunk: string } {
  return { base: '#0d381e', mid: '#15803d', highlight: '#4ade80', trunk: '#3a2013' };
}

export function oakColors(): { leaf: string; leafLight: string; trunk: string } {
  return { leaf: '#15803d', leafLight: '#86efac', trunk: '#422817' };
}
```

测试改回 import 风格：

```ts
import { pineColors } from './visualTheme';
```

3b. 引擎 `drawPineTree` 最小抛光（只改 3 行，不重写整个函数）：
- 找到 `// Natural ambient soft ground shadow` 下的：

```ts
this.ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
this.ctx.beginPath();
this.ctx.ellipse(s.x + 4, s.y + 4, 32, 16, -0.2, 0, Math.PI * 2);
this.ctx.fill();
```

替换为：

```ts
drawSoftShadow(this.ctx, s.x + 4, s.y + 4, 28);
```

- 找到 `// Trunk bark highlights` 的 `this.ctx.strokeStyle = '#5a351f';` 改为 `this.ctx.strokeStyle = withAlpha('#d6a97c', 0.6);`
- 找到 `ridge: '#22c55e'` 那一行 boughs 数组首项，保持不动（已是 `pineColors` 一致值），不做多余改动。

3c. `drawWastelandShrub` 整函数替换为（完整覆盖，原函数约 12 行）：

```ts
public drawWastelandShrub(wx: number, wy: number) {
  const s = this.toScreen(wx, wy);
  this.ctx.save();
  drawSoftShadow(this.ctx, s.x, s.y, 14);
  // 主丛：冷灰绿，左上受光
  this.ctx.fillStyle = '#4b5548';
  this.ctx.beginPath();
  this.ctx.ellipse(s.x, s.y - 6, 14, 8, 0, 0, Math.PI * 2);
  this.ctx.fill();
  this.ctx.fillStyle = withAlpha('#a7c4a0', 0.7);
  this.ctx.beginPath();
  this.ctx.ellipse(s.x - 4, s.y - 9, 7, 4, -0.3, 0, Math.PI * 2);
  this.ctx.fill();
  this.ctx.strokeStyle = '#1c1917';
  this.ctx.lineWidth = 1.2;
  this.ctx.beginPath();
  this.ctx.ellipse(s.x, s.y - 6, 14, 8, 0, 0, Math.PI * 2);
  this.ctx.stroke();
  this.ctx.restore();
}
```

3d. `drawOakTree` 高光 alpha 统一：找到 `this.ctx.fillStyle = 'rgba(134, 239, 172, 0.45)';` 改为 `this.ctx.fillStyle = withAlpha('#86efac', 0.45);`

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: PASS，10 passed。

Run: `npm run lint`
Expected: exit 0。

手动验证：`npm run dev` 进黑松伐木场，松树阴影应为柔和径向渐变、无生硬黑椭圆；灌木有左上高光。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/visualTheme.ts src/game/visualTheme.test.ts
git commit -m "feat(visual): polish pine oak shrub lighting"
```

---

### Task 5: 角色与怪物抛光（玩家/远端玩家/三类怪）

**Files:**
- Modify: `src/game/IsometricEngine.ts:4193-4212`（`drawMonster` 阴影段）、`4435-4466`（怪血条段）、`4470-4770`（`drawPlayer` 主体描边）
- Test: `src/game/visualTheme.test.ts`（血条已覆盖，本任务只加描边约束）

- [ ] **Step 1: Write the failing test**

追加：

```ts
describe('character outline rule', () => {
  it('boss fill uses light outline', () => {
    expect(outlineFor('#170624')).toBe('#e9d5ff');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/visualTheme.test.ts -t "character outline" --reporter=verbose`
Expected: PASS（Task 3 已实现，视为约束锁定）。若 PASS 则直接进 Step 3（本步目的是防止回退）。

- [ ] **Step 3: Write minimal implementation**

3a. `drawMonster` 阴影段替换（找到 `// 1. Soft Realistic Ground Ambient Shadow` 下约 12 行 `createRadialGradient...ellipse...fill`，替换为）：

```ts
// 1. Unified soft shadow (visualTheme)
const shadowR = isBoss ? 32 : isBrute ? 24 : 18;
drawSoftShadow(this.ctx, s.x, s.y, shadowR);
```

并删除原来 `const shadowR = ...` 重复声明上一行的旧代码（只留这一处）。

3b. 怪血条段替换（找到 `// --- TACTICAL HEALTH BAR & IDENTIFIER HUD ---` 下约 30 行，保留背板+名字，只把 `hpGrad` 填充换成）：

```ts
// --- TACTICAL HEALTH BAR & IDENTIFIER HUD ---
const barW = isBoss ? 64 : 46;
const barH = isBoss ? 6 : 5;
const by = isBoss ? s.y - 100 : isBrute ? s.y - 74 : s.y - 50;
this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
this.ctx.fillRect(s.x - barW / 2 - 2, by - 2, barW + 4, barH + 4);
this.ctx.strokeStyle = '#334155';
this.ctx.lineWidth = 1;
this.ctx.strokeRect(s.x - barW / 2 - 2, by - 2, barW + 4, barH + 4);
const currentHpRatio = Math.max(0, Math.min(1, m.hp / m.maxHp));
this.ctx.fillStyle = healthBarColor(currentHpRatio);
this.ctx.fillRect(s.x - barW / 2, by, barW * currentHpRatio, barH);
this.ctx.fillStyle = '#ffffff';
this.ctx.font = 'bold 10px sans-serif';
this.ctx.textAlign = 'center';
this.ctx.fillText(m.name, s.x, by - 5);
```

3c. `drawPlayer` 加统一外圈描边（找到 `private drawPlayer() {` 内第一处 `this.ctx.save();` 后插入，不改玩法）：

```ts
// 全局光：左上轮廓光预设（描边色，不影响碰撞/伤害）
const PLAYER_OUTLINE = '#e0f2fe';
```

并在玩家躯干绘制结束、`this.ctx.restore();` 之前插入：

```ts
this.ctx.strokeStyle = withAlpha(PLAYER_OUTLINE, 0.85);
this.ctx.lineWidth = 1.5;
this.ctx.beginPath();
this.ctx.ellipse(s.x, s.y - 30, 16, 26, 0, 0, Math.PI * 2);
this.ctx.stroke();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: PASS，11 passed。

Run: `npm run lint`
Expected: exit 0。

手动验证：打怪到半血血条变黄、残血变红；玩家站立有淡蓝轮廓光。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/visualTheme.test.ts
git commit -m "feat(visual): unify character shadow outline healthbar"
```

---

### Task 6: 建筑/载具/传送门抛光（工坊/车/箱/塔/门）

**Files:**
- Modify: `src/game/IsometricEngine.ts:2981-3230`（`drawTruck/drawOilTanker/drawSupplyChest`）、`3406-3740`（`drawBuilding`）、`5548-5649`（`drawWaypointPortal`）
- Test: `src/game/visualTheme.test.ts`

- [ ] **Step 1: Write the failing test**

追加：

```ts
describe('building accents', () => {
  it('rift accent stays purple, camp stays green', () => {
    expect(themeAccent('rift')).toBe('#c026d3');
    expect(themeAccent('camp')).toBe('#34d399');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/visualTheme.test.ts -t "building accents" --reporter=verbose`
Expected: PASS（锁定约束，防止有人改色板）。继续。

- [ ] **Step 3: Write minimal implementation**

3a. `drawSupplyChest` 顶部高光统一（找到 `private drawSupplyChest(wx: number, wy: number) {` 内 `this.ctx.fillStyle = '#fde047';` 之类的纯黄高光 2 处，逐一改为 `this.ctx.fillStyle = withAlpha('#fde68a', 0.8);`；不要改箱体主色）。

3b. `drawBuilding` 开头加统一阴影（找到 `private drawBuilding(b: BuildingEntity) {` 下 `const s = this.toScreen(b.x, b.y);` 下一行插入）：

```ts
drawSoftShadow(this.ctx, s.x, s.y, b.type === 'anchor_core' ? 32 : 24);
```

3c. `drawWaypointPortal` 脉冲色收敛（找到 `drawWaypointPortal` 内 `this.ctx.fillStyle = '#d946ef'` 或 `'#9333ea'` 高饱和闪烁，改为）：

```ts
const pulse = (Math.sin(this.gameTime * 3 + wp.x) + 1) * 0.5;
this.ctx.strokeStyle = withAlpha(themeAccent('rift'), 0.55 + pulse * 0.35);
this.ctx.lineWidth = 2;
this.ctx.fillStyle = withAlpha('#f5d0fe', 0.35 + pulse * 0.3);
```

保留原有的 `arc`/`ellipse` 路径不动，只换颜色赋值行。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: PASS，12 passed。

Run: `npm run lint`
Expected: exit 0。

手动验证：营地锚点有柔和大阴影；传送门为淡紫呼吸光，不再刺眼频闪。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/visualTheme.test.ts
git commit -m "feat(visual): polish buildings vehicles portals"
```

---

### Task 7: 光照与天气氛围（亮度/雾/雨/裂隙）

**Files:**
- Modify: `src/game/IsometricEngine.ts:71-73`（`brightnessMultiplier` 默认）、`5290-5369`（`renderDynamicLighting`）、`initWeather/renderWeather` 附近（搜 `rainDrops` 初始化段）
- Test: `src/game/visualTheme.test.ts`（天气 tint 约束）

- [ ] **Step 1: Write the failing test**

追加：

```ts
describe('lighting rules', () => {
  it('weather tint stays subtle', () => {
    const { weatherTint } = require('./visualTheme') as typeof import('./visualTheme');
    expect(weatherTint('clear')).toBe('rgba(254, 240, 138, 0.06)');
    expect(weatherTint('rain')).toBe('rgba(15, 23, 42, 0.14)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/visualTheme.test.ts -t "weather tint" --reporter=verbose`
Expected: FAIL with `weatherTint is not a function`。

- [ ] **Step 3: Write minimal implementation**

3a. `src/game/visualTheme.ts` 追加：

```ts
export function weatherTint(w: 'clear' | 'rain' | 'thunder' | 'fog' | 'rift_storm'): string {
  if (w === 'clear') return 'rgba(254, 240, 138, 0.06)';
  if (w === 'rain') return 'rgba(15, 23, 42, 0.14)';
  if (w === 'thunder') return 'rgba(30, 27, 75, 0.18)';
  if (w === 'fog') return 'rgba(148, 163, 184, 0.16)';
  return 'rgba(88, 28, 135, 0.16)';
}
```

测试改回 import：

```ts
import { weatherTint } from './visualTheme';
```

3b. 引擎 `brightnessMultiplier` 从 `1.4` 降到 `1.12`（找到 `public brightnessMultiplier: number = 1.4;` 改为）：

```ts
public brightnessMultiplier: number = 1.12;
```

3c. `renderDynamicLighting` 亮 mode 主分支替换（找到 `if (this.isBrightMode) {` 下 `sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.04)');` 改为）：

```ts
sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.06)');
```

并把 `// In rain/thunder/fog during bright mode: only minimal atmospheric tint (0.04)` 下的：

```ts
this.ctx.fillStyle = 'rgba(15, 23, 42, 0.04)';
```

改为：

```ts
import { weatherTint } from './visualTheme';
// （文件头已引入，此处直接用）
this.ctx.fillStyle = weatherTint(this.currentWeather === 'clear' ? 'clear' : 'rain');
```

注意：文件头 import 需追加 `weatherTint`（与 Task 3 的 import 合并为一行）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: PASS，13 passed。

Run: `npm run lint`
Expected: exit 0。

手动验证：晴天不再过曝发白；雨天有轻微灰蓝罩；裂隙图紫雾 0.16 可见但不挡怪。

- [ ] **Step 5: Commit**

```bash
git add src/game/IsometricEngine.ts src/game/visualTheme.ts src/game/visualTheme.test.ts
git commit -m "feat(visual): soften lighting and weather tints"
```

---

### Task 8: 小地图 + 世界地图可读性（Radar + WorldMap）

**Files:**
- Modify: `src/components/RadarMinimap.tsx:44-178`
- Modify: `src/components/WorldMapModal.tsx:26-31,154-176`
- Test: `src/game/visualTheme.test.ts`（radar 颜色复用断言）

- [ ] **Step 1: Write the failing test**

追加：

```ts
describe('minimap colors', () => {
  it('radar dots use shared palette', () => {
    const { radarDotColor } = require('./visualTheme') as typeof import('./visualTheme');
    expect(radarDotColor('monster')).toBe('#ef4444');
    expect(radarDotColor('interactable')).toBe('#f59e0b');
  });
});
```

本步预期 PASS（Task 1 已实现），作为防回退锁。

- [ ] **Step 2: Run test to verify it fails-or-locks**

Run: `npx vitest run src/game/visualTheme.test.ts -t "minimap colors" --reporter=verbose`
Expected: PASS（锁存）。继续 Step 3。

- [ ] **Step 3: Write minimal implementation**

3a. `src/components/RadarMinimap.tsx` 头部加 import：

```tsx
import { radarDotColor, themeAccent } from '../game/visualTheme';
```

3b. 替换 4 处硬编码 fill（逐行改，保持坐标逻辑不动）：

```tsx
// buildings: '#38bdf8' -> radarDotColor('building')
// 原：
ctx.fillStyle = '#38bdf8';
// 改为：
ctx.fillStyle = radarDotColor('building');
```

```tsx
// interactables: '#f59e0b' -> radarDotColor('interactable')
ctx.fillStyle = radarDotColor('interactable');
```

```tsx
// teammates: '#10b981' -> radarDotColor('teammate')
ctx.fillStyle = radarDotColor('teammate');
```

```tsx
// monsters: '#ef4444' -> radarDotColor('monster')
ctx.fillStyle = radarDotColor('monster');
```

3c. 小地图加北向针 + 距离衰减（在 `// 5. Center Player Arrow` 之前插入，完整块）：

```tsx
// North tick (N always up, world -Y)
ctx.fillStyle = '#e2e8f0';
ctx.font = 'bold 9px monospace';
ctx.textAlign = 'center';
ctx.fillText('N', cx, cy - radius + 10);
// Range fade ring
const fade = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
fade.addColorStop(0, 'rgba(0,0,0,0)');
fade.addColorStop(1, 'rgba(0,0,0,0.35)');
ctx.fillStyle = fade;
ctx.beginPath();
ctx.arc(cx, cy, radius, 0, Math.PI * 2);
ctx.fill();
```

3d. `src/components/WorldMapModal.tsx` 主题色收敛（替换 `THEME_COLOR` 硬表为 import）：

```tsx
import { themeAccent } from '../game/maps';
```

改为：

```tsx
import { themeAccent as themeAccentVisual } from '../game/visualTheme';
const THEME_COLOR: Record<string, string> = {
  camp: themeAccentVisual('camp'), plaza: themeAccentVisual('plaza'), field: themeAccentVisual('field'),
  urban: themeAccentVisual('urban'), ruins: themeAccentVisual('ruins'),
  forest: themeAccentVisual('forest'), quarry: themeAccentVisual('quarry'),
  lake: themeAccentVisual('lake'), marsh: themeAccentVisual('marsh'), rift: themeAccentVisual('rift'),
};
```

3e. 世界地图卡片加 SVG 缩略条（在卡片 `POI chips` 之前插入，`WorldMapModal.tsx:177` 附近）：

```tsx
{/* Theme thumbnail strip */}
<div className="mt-2 h-8 rounded-lg border border-slate-800 overflow-hidden flex" title={m.theme}>
  <div className="flex-1" style={{ background: `linear-gradient(135deg, ${THEME_COLOR[m.theme]}55, transparent)` }} />
  <div className="flex-1 opacity-60" style={{ background: THEME_COLOR[m.theme] ?? '#64748b' }} />
  <div className="flex-1" style={{ background: `linear-gradient(225deg, ${THEME_COLOR[m.theme]}88, transparent)` }} />
</div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/visualTheme.test.ts --reporter=verbose`
Expected: PASS，14 passed。

Run: `npm run lint`
Expected: exit 0。

Run: `npm run build`
Expected: `vite build` 成功，`dist/` 生成，无 TS/JS 错误。

手动验证：按 `M` 打开世界地图，每张卡有主题色带；右上雷达有 N 针、边缘渐暗、点色与图例一致。

- [ ] **Step 5: Commit**

```bash
git add src/components/RadarMinimap.tsx src/components/WorldMapModal.tsx src/game/visualTheme.test.ts
git commit -m "feat(visual): readable radar and worldmap theme strips"
```

---

## Verification Checklist（执行者逐项打勾）

- [ ] `npx vitest run --reporter=verbose` 全绿（14+ 用例）
- [ ] `npm run lint` exit 0
- [ ] `npm run build` 成功
- [ ] 手动走图：营地广场 / 商业街 / 黑松伐木场 / 翠湖渔港 / 裂隙前线各停留 10 秒，无过曝、无高对比棋盘、无刺眼频闪
- [ ] 按 M 世界地图、雷达 360°、血条三段色均正常

## Out of Scope（明确不做）

- 不引入外部图片/精灵/字体资源；不改碰撞、伤害、掉率、移速数值；不做昼夜系统；不重构 `App.tsx` 状态流。
