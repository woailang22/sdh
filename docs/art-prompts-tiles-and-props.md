# 生图包 Phase-5：地砖 + 实体补齐（一次生成）

> 用法：全文粘贴给 ChatGPT，一次生成。落位：全部放 `public/art/`（与之前 18 张同一目录）。
> 风格锁死：muted wasteland painterly, low saturation, soft top-left light, hand-painted, no text, no watermark, no UI, no photo.

## 全局铁律（每张都遵守）

1. **色调**：低饱和灰调废土，与现有包一致（营地卡其橄榄、森林灰棕、湖水岩蓝、裂隙灰褐）。
2. **地砖**：512x512、**无缝平铺 seamless tileable**、画面均匀（只有土纹/石子/草屑，无建筑无人无大物件），A/B 两张仅明暗微差（给 checker 用）。
3. **实体**：1024x1024、**真透明底 alpha**、单个主体居中、四周留透明边、**不画地面阴影**（引擎统一画）、不画光环描边。
4. **视角**：等距斜 30° 左右，三分之四侧面（与现有 wrecked-sedan / survivor 同视角）。
5. **占位/遮挡/碰撞（引擎规则，画图时配合）**：实体按底部中心锚定、y 排序遮挡；物体宽度不超出单格太多；高大物体（车/塔）宁矮勿宽。

---

## 一、地砖 20 张（10 主题 × A/B）

通用前缀（每张 prompt 开头都带）：
`seamless tileable game ground texture, 512x512, hand-painted muted wasteland style, low saturation, soft top-left light, uniform surface with fine detail only (no buildings, no people, no large objects, no text), `

1. `tile-camp-a.png` / 2. `tile-camp-b.png`（B 稍暗）
   `packed dirt camp ground, khaki-olive dust, small pebbles and straw bits, faint footprints, base tone #6e6e50`
3. `tile-plaza-a.png` / 4. `tile-plaza-b.png`
   `worn concrete slabs ground, warm gray, faint slab seams and cracks, dust in crevices`
5. `tile-field-a.png` / 6. `tile-field-b.png`
   `dry farmland soil, shallow furrows, clods and dry straw, brown-tan`
7. `tile-urban-a.png` / 8. `tile-urban-b.png`
   `dusty asphalt street, cracks and patches, faded lane speck, gray with warm dust film`
9. `tile-ruins-a.png` / 10. `tile-ruins-b.png`
   `rubble ground, broken concrete chunks, rebar bits, tan-gray dust`
11. `tile-forest-a.png` / 12. `tile-forest-b.png`
   `forest floor duff, brown-gray humus, pine needles, twigs, moss specks`
13. `tile-quarry-a.png` / 14. `tile-quarry-b.png`
   `pale gray limestone rock ground, gravel and chipped stone, subtle strata lines`
15. `tile-lake-a.png` / 16. `tile-lake-b.png`
   `slate blue-gray lake water surface, subtle horizontal ripple, no horizon no sky, no objects`
17. `tile-marsh-a.png` / 18. `tile-marsh-b.png`
   `muddy marsh ground, olive mud, shallow puddle specks, reed root bits`
19. `tile-rift-a.png` / 20. `tile-rift-b.png`
   `volcanic ash ground, gray-brown, fine cracks and ember specks, NO violet glow (glow 由程序画）`

## 二、实体 8 张（1024 透明底）

通用前缀：
`isometric game sprite, 3/4 side view, 30-degree oblique, transparent background true alpha, single centered object with transparent margins, no ground shadow, no glow outline, no text, hand-painted muted wasteland style, low saturation, soft top-left light, `

21. `veh-van.png`
    `wrecked delivery van, rusted panels, flat tires, broken windows, dust-covered, medium size`
22. `veh-truck.png`
    `wrecked pickup truck, rusted, missing bumper, dust-covered, medium size`
23. `prop-scrap.png`
    `scrap metal pile, twisted pipes, gears, plates, rusty, small mound`
24. `prop-pond.png`
    `wooden pier dock planks on posts, weathered wood, rope coil, NO water (water 由地砖画）, small`
25. `prop-crystal-cluster.png`
    `small violet crystal cluster growing from rock base, mineable size, faint inner glow, distinct from big anchor`
26. `npc-allen.png`
    `male wasteland engineer worker, overalls, wrench in hand, standing, full body, same proportions as survivor character`
27. `npc-vivian.png`
    `female wasteland technician, jacket, holding tablet, standing, full body, same proportions as survivor character`
28. `drone.png`
    `small hovering quadcopter drone, top-down oblique view, blinking light, dust below, tiny size`

---

## 落位表（生成后放这里）

| 文件 | 路径 | 用途 |
|---|---|---|
| tile-*.png ×20 | `public/art/tile-<theme>-<a\|b>.png` | 地面 pattern（替换 flat fill） |
| veh-van.png / veh-truck.png | `public/art/` | van/truck 残骸（替换程序车） |
| prop-scrap.png | `public/art/` | 废料堆 |
| prop-pond.png | `public/art/` | 钓台木栈道（水面用地砖） |
| prop-crystal-cluster.png | `public/art/` | 可挖晶簇（区别于锚点核心） |
| npc-allen.png / npc-vivian.png | `public/art/` | 艾伦/薇薇安（替换程序小人） |
| drone.png | `public/art/` | 无人机 |

## 验收标准（给我验收时看）

- 地砖 2x2 平铺看不出接缝，大物件穿帮为不合格。
- 实体真透明（棋盘格底），边缘无白边/黑边。
- 同主题 A/B 并排放，明暗差一眼可见但不大。
- 风格与现有 18 张放一起不跳（同灰度同笔触）。
