# Art Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 接入 public/art/ 18张图进游戏，替换 emoji/fillRect，首屏可用、有回退。

**Architecture:** 新建 src/game/art.ts 统一加载 atlas.json + 图片缓存，引擎优先 drawImage、失败回退原 procedural；UI 侧用 src/game/artIcons.ts 映射 item.id -> /art 图标裁剪；背景图直接 <img> 引用。

**Tech Stack:** TypeScript, Vite public/, Canvas2D drawImage, React, vitest

---

### Task 1: Art loader

**Files:**
- Create: `src/game/art.ts`
- Test: `src/game/art.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { frameRect, iconFor } from './art';
describe('art', () => {
  it('maps rifle to weapons atlas', () => {
    expect(iconFor('rifle').file).toBe('icon-weapons.png');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/game/art.test.ts`
Expected: FAIL with "Cannot find module './art'"

- [ ] **Step 3: Write minimal implementation**

```ts
import atlas from '../../public/art/atlas.json';
export function iconFor(id: string) {
  if (id.startsWith('wp_') || id==='rifle') return { file: 'icon-weapons.png', frame: 'assault-rifle' };
  return { file: 'icon-material.png', frame: 'wood' };
}
export function frameRect(file: string, frame: string) {
  const a: any = (atlas as any).assets.find((x: any)=>x.file===file);
  return a?.frames?.find((f: any)=>f.id===frame)?.rect ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/game/art.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/art.ts src/game/art.test.ts
git commit -m "feat: add art atlas loader"
```

### Task 2: Icon map for UI

**Files:**
- Create: `src/game/artIcons.ts`
- Modify: `src/components/Hotbar.tsx:67`

- [ ] **Step 1: Write icon map**

```ts
export const ITEM_ICON_IMG: Record<string,string> = {
  rifle: '/art/icon-weapons.png#assault-rifle',
  wood: '/art/icon-material.png#wood',
};
export function itemImg(id:string): string | null {
  const v = ITEM_ICON_IMG[id];
  if (!v) return null;
  return v.split('#')[0];
}
```

- [ ] **Step 2: Use in Hotbar with fallback**

```tsx
{item.icon && itemImg(item.id) ? <img src={itemImg(item.id)!} className="w-7 h-7 object-contain" /> : <span className="text-xl">{item.icon}</span>}
```

- [ ] **Step 3: Run**

Run: `npx vitest run src/game/art.test.ts`
Expected: PASS

### Task 3: Engine sprite hook (safe)

**Files:**
- Modify: `src/game/IsometricEngine.ts:57-80`

- [ ] **Step 1: Add art cache field**

```ts
public artImages = new Map<string, HTMLImageElement>();
public tryLoadArt(src: string) {
  if (this.artImages.has(src)) return;
  const img = new Image(); img.src = src; this.artImages.set(src, img);
}
```

- [ ] **Step 2: In drawPineTree early try drawImage, else fallback**

```ts
const img = this.artImages.get('/art/nature-trees.png');
if (img && img.complete && img.naturalWidth>0) {
  // pine is frame 0 of 4 in a row: source slice
  this.ctx.drawImage(img, 0, 0, img.width/4, img.height, s.x-32, s.y-110, 64, 110);
  return;
}
```

- [ ] **Step 3: Run lint**

Run: `npx tsc --noEmit`
Expected: PASS with no new errors in art files

### Task 4: Backgrounds + map previews

**Files:**
- Modify: `src/components/WorldMapModal.tsx:188-192`
- Modify: `src/App.tsx`

- [ ] **Step 1: Map preview imgs**

```tsx
const MAP_BG: Record<string,string> = { camp:'/art/map-camp.jpg', town:'/art/map-camp.jpg', mountain:'/art/map-wild.jpg', marsh:'/art/map-water.jpg' };
<img src={MAP_BG[m.region] ?? '/art/map-camp.jpg'} className="mt-2 h-20 w-full object-cover rounded-lg border border-slate-800" loading="lazy" />
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: dist/ built, public/art copied

### Task 5: Verify

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: PASS (pre-existing passes remain)

- [ ] **Step 2: Run dev check**

Run: `npx tsc --noEmit`
Expected: PASS
