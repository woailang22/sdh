# 交接文档：B 版地砖接入（Tile Variant B）

> 2026-10-16｜项目 `D:\workspace-ai\sdc`（Vite + React 19 + TS，Canvas2D 引擎）
> 前置阅读：`docs/superpowers/plans/2026-10-16-tiles-phase5a.md`（A 版已接入并全量验证通过：131 tests / tsc 干净 / build OK）

> **已实施（as-built, 2026-10-19）：本文 Task 1/2 的做法已被更好的方案取代，勿再照做。**
> - 贴图改为**按需懒加载**（引擎删除了预载清单，新增 `artImage`/`warmArtCache`）→ B 不需要进 preload，因此没有"补预载表"这一步；
> - 选型用**低概率散点**而非严格棋盘：`hash2Pure(wx * 31 + 7, wy * 17 + 3) < 0.22 ? 'b' : 'a'`；
> - 每格 `save/clip/restore` 改为**预烘菱形贴片**（`tilePatch` + `tilePatchCache`，49 个采样位/主题变体）。
> 下方 Task 1/2 仅作历史记录；Task 3（验证清单）仍然适用。

## TL;DR

B 版 10 张地砖已生成并验收合格（512×512、全不透明、接缝干净、主题一致）。但要真正在游戏里生效，**还差两处改动**：

1. **B 文件没进预载表** —— 引擎查的是 `artImages` Map（只装预载清单里的文件），B 文件不预载 = 查不到 = 永远回退 A。所谓"到货零改代码"不成立（phase5a 计划内已勘误）。
2. **B 比 A 系统性暗 18~32 亮度** —— 现在的选型是严格棋盘 `(wx+wy)%2`，直接启用会看到扎眼的明暗棋盘格（预览图 `docs/art-phase5-checker-1/2.jpg` 可复现）。建议改成**低概率散点**（推荐）或做亮度补偿。

改完跑 `npx vitest run && npx tsc --noEmit && npm run build` 即可收工。

---

## 1. 资产盘点（已实测）

- 文件：`public/art/tile-{camp,plaza,field,urban,ruins,forest,quarry,lake,marsh,rift}-b.png`（10/10 齐）
- 格式：512×512、PNG colortype 6（RGBA）、alpha 均值 255（全不透明，地面用安全）、350~600KB
- 接缝（左右边缘 MAE）：3.4~15.9，合格（注：当前采样器 64px patch 范围 `[0,448]` 永不跨边，接缝只影响观感底色，不影响拼接）
- 主题一致性：与 A 同主题同结构（B 是"更暗/更湿"的变体），`docs/art-phase5-ab-preview.jpg` 逐对可看

### A/B 亮度差实测（0.299R+0.587G+0.114B，8px 采样）

| 主题 | LumaA | LumaB | Δ | B 接缝 MAE |
|---|---|---|---|---|
| camp | 100.7 | 70.6 | **30.1** | 7.9 |
| plaza | 110.2 | 82.3 | 27.9 | 8.6 |
| field | 99.8 | 75.4 | 24.4 | 12.1 |
| urban | 102.4 | 70.5 | **31.9** | 8.8 |
| ruins | 99.7 | 75.3 | 24.4 | 15.9 |
| forest | 71.8 | 49.8 | 22.0 | 10.0 |
| quarry | 146.0 | 114.2 | **31.8** | 10.2 |
| lake* | 79.2 | 53.8 | 25.4 | 3.4 |
| marsh | 80.3 | 56.6 | 23.7 | 6.6 |
| rift | 73.2 | 55.3 | 17.9 | 8.1 |

\* lake 纹理当前是死资产：`tileTextureKey` 的 lake 分支映射为 forest(栈道)/null(活水)/marsh(沼泽岸)，永远不会选到 lake 贴图（有意为之：湖心保留程序波光动画）。留档备用即可。

**预览素材**（若有疑问先看图）：`docs/art-phase5-ab-preview.jpg`（A/B 逐对比）、`docs/art-phase5-b-repeat-1/2.jpg`（B 平铺）、`docs/art-phase5-checker-1/2.jpg`（A+B 棋盘效果 = 问题现场）。

---

## 2. 代码现状（B 为何当前不显示）

`src/game/IsometricEngine.ts`：

- **L216** `preloadArt([...])` —— 清单里只有 `tile-*-a.png` 等，无一个 B 文件
- **L300** `tileImage(theme, 'b')` —— 查 `this.artImages.get('/art/tile-<theme>-b.png')`，查不到返回 null
- **L314** `drawTileTexture()` —— 选型在 **L317**：
  ```ts
  const variant = ((wx + wy) % 2 === 0) ? 'a' : 'b';
  ```
  b 查不到 → `tileImage` 内部回退 a → 当前游戏画面 = 纯 A，无异常

可用 hash 工具：**L4** 已 `import { hash2 as hash2Pure } ... from './visualTheme'`（纯函数、世界坐标确定、刷新稳定），引擎内既有用法见 L2994。

---

## 3. 待办（按序做，全程 TDD 心态：改完只做验证，不改行为面以外的东西）

### Task 1：把 B 加进预载清单（L216）

在那一个长数组末尾追加 10 项：

```ts
'tile-camp-b.png', 'tile-plaza-b.png', 'tile-field-b.png', 'tile-urban-b.png', 'tile-ruins-b.png', 'tile-forest-b.png', 'tile-quarry-b.png', 'tile-lake-b.png', 'tile-marsh-b.png', 'tile-rift-b.png'
```

### Task 2：换选型策略（L317，二选一）

**方案 A（推荐，零美术返工）**：低概率散点，暗斑读作"湿/磨损地面"而非棋盘：

```ts
const variant = hash2Pure(wx * 31 + 7, wy * 17 + 3) < 0.22 ? 'b' : 'a';
```

概率可按主题微调（示例，非必须）：

```ts
const bChance: Record<string, number> = { camp: 0.25, plaza: 0.15, field: 0.2, urban: 0.22, ruins: 0.22, forest: 0.25, quarry: 0.18, marsh: 0.25, rift: 0.3 };
const variant = hash2Pure(wx * 31 + 7, wy * 17 + 3) < (bChance[key] ?? 0.2) ? 'b' : 'a';
```

**方案 B（想保留 50/50 混铺）**：在同一 clip 内给 B 叠一层白纱补偿亮度，Δ≈26/255 → 白纱 0.08~0.12：

```ts
if (variant === 'b') {
  this.ctx.fillStyle = 'rgba(255,255,255,0.10)';
  this.ctx.fillRect(sx - 32, sy - 32, 64, 64);
}
```

（粗糙但快；各主题 Δ 不同，只能取平均值，不如方案 A 稳。更优解是让生图工具重出"与 A 等亮度、仅纹理不同"的 B 批。）

### Task 3：验证 + 收尾

- `npx vitest run` → 预期 15 文件 / 131 用例全绿（地砖选型无单测，风险面纯视觉）
- `npx tsc --noEmit` → 零输出
- `npm run build` → 成功
- 游戏内目视（`npm run dev` → http://127.0.0.1:3000）：
  1. 营地广场/营地区：无棋盘纹，暗斑自然
  2. 商业街（urban）：expressway 亮带内无明显规则方格
  3. 采石场（最亮主题，Δ31.8 最显形）：散点不突兀
  4. 湖港：湖心波光动画仍在（B 不得盖住 null 分支）
  5. 裂隙前线：紫色辉光缝仍在
  6. 低倍率跑动几圈：无闪帧、无缺块（贴图首帧未解码时自动回退 A，属正常）

---

## 4. 坑 / 约束（别踩）

- **别改名**：文件名必须严格 `tile-<theme>-<a|b>.png`，代码按字符串查 `/art/`，改名=静默回退 A。
- **别动 art.ts 静态表规则**：项目 tsconfig 无 `resolveJsonModule`、Vite 不打包 `public/`，所以帧表全静态抄录 —— 但地砖走的是 `artImages` Map 直查，**不需要**动 any FRAMES 表。
- **玩家自建地板（wood/stone/iron）** 在 tile 循环里 `continue` 早退，永远不铺地砖贴图 —— 这是特性不是 bug。
- **活水/裂隙缝** `tileTextureKey` 返回 null 的格必须保持 null，否则会冻掉程序动画。
- 若低端机掉帧：每格 2 次 clip+drawImage，可加质量开关（散点概率=0 或整段 `drawTileTexture` 短路）。桌面端实测无感。
- 提交规范：仓库是 git（origin/main），未要求提交则保持工作区即可。

## 5. 相关文件索引

| 文件 | 作用 |
|---|---|
| `src/game/IsometricEngine.ts` L216 / L272 / L300 / L314-317 | 预载清单 / 主题映射 / 图查找+回退 / 采样+选型 |
| `public/art/tile-*-a.png`、`tile-*-b.png` | 资产本体（20 张） |
| `docs/superpowers/plans/2026-10-16-tiles-phase5a.md` | 前置计划（含本文件的勘误批注） |
| `docs/art-prompts-tiles-and-props.md` | 生图包（B 复生成时改这段 prompt：强调"与 A 等平均亮度，仅纹理差异 ±10%"） |
| `docs/art-phase5-*.jpg` | 验收预览图（A/B 对比 / B 平铺 / A+B 棋盘） |
