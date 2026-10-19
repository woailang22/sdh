# 给 ChatGPT 一次生图指令（全文复制粘贴，一次生成18张）

> 现状：零图片，全是 Canvas 直绘 + emoji + Tailwind。`src/game/IsometricEngine.ts:3991` 树、`src/game/IsometricEngine.ts:4275` 车、`src/game/IsometricEngine.ts:3605` 建筑全是 fillRect，`src/game/items.ts:21` 100+道具全是 emoji。
> 要求：全局远景为主，单体为干净剪影，不画数值、不露玩法名、不带字。统一风格：`muted wasteland painterly, low saturation, soft light, clean silhouette, no text, no UI, no watermark`
> 落位：新建 `public/art/`，前端用 `/art/xxx` 直接引用。

## 落位总表（18个，ChatGPT按名保存）

```
public/art/
  keyart-dawn.jpg         登录/加载底 16:9
  map-camp.jpg            营地预览 16:9
  map-wild.jpg            山林预览 16:9
  map-water.jpg           水域预览 16:9
  map-rift.jpg            高危预览 16:9
  texture-ground.png      地面微噪 1:1平铺
  char-survivor.png       幸存者四向 透明底 4格横排
  monster-pack.png        野怪三阶 透明底 3格横排 小/大/巨
  building-walls.png      墙+门+地板 透明底 3x3九宫格
  building-facility.png   塔/台/箱/火/核 透明底 5格横排
  nature-trees.png        松/橡/石/草 透明底 4格横排
  prop-wreck.png          废车/废墟/弹药箱/医疗柜/木箱 透明底 5格横排
  icon-weapons.png        步枪/冲锋/霰弹/狙击/手枪 图标表 5格
  icon-gear.png           头盔/背心/背包/镐/铲 图标表 5格
  icon-throwable.png      炸药/燃烧瓶/烟雾/闪光/手雷 图标表 5格
  icon-medical-food.png   绷带/急救箱/药丸/肉排/鱼/果酱 图标表 6格
  icon-material.png       木/石/废铁/零件/电池/晶石 图标表 6格
  ui-chrome.png           深色面板+按钮+稀有度框 UI底 3件套
```

---

## 粘贴给ChatGPT的正文（从下行开始复制）

```
请一次生成18张，统一 muted wasteland painterly, low saturation, soft light, clean silhouette, no text, no UI, no watermark, no close-up details。全部远景或干净单体，不要字。

1. keyart-dawn.jpg --ar 16:9:
wide isometric survival settlement at dawn, far distant view, tents and campfire glow center, morning haze, muted green-gray ground, empty sky 70%

2. map-camp.jpg --ar 16:9:
isometric safe camp overview far view, tents wooden fences flat plain daylight, tiny silhouettes only

3. map-wild.jpg --ar 16:9:
isometric forest quarry hills far view, dark pines gray rocks light fog, muted tones

4. map-water.jpg --ar 16:9:
isometric lake marsh wetlands far view, calm blue-gray water wooden pier reeds overcast

5. map-rift.jpg --ar 16:9:
isometric cracked wasteland purple glow far view, dark rocks violet mist dusk, no monsters details

6. texture-ground.png --ar 1:1:
top-down seamless ground noise muted olive gray very low contrast grain tileable flat no objects

7. char-survivor.png transparent:
isometric survivor character sprite sheet 4 directions side by side, hooded wasteland outfit backpack, same pose walking, clean silhouette, solid dark background for easy cutout, full body far view

8. monster-pack.png transparent:
isometric mutant beasts 3 tiers side by side small fast / medium armored / huge boss, dark chitin silhouette purple glow seams, solid dark background, full body far view

9. building-walls.png transparent:
isometric building kit 3x3 grid, wood wall stone wall alloy wall, wood floor stone floor metal grid floor, wood door armored door bunker door, clean front angle, solid background

10. building-facility.png transparent:
isometric facilities row of 5, watch turret, workbench table, storage crate, campfire, crystal anchor core, solid dark background, small scale far view

11. nature-trees.png transparent:
isometric nature kit row of 4, dark pine tree, broadleaf oak, gray boulder, dry grass tuft, solid background, far view

12. prop-wreck.png transparent:
isometric props row of 5, wrecked sedan car, ruined concrete wall, ammo crate, medical cabinet, wooden supply box, solid dark background, far view

13. icon-weapons.png grid:
game item icons row of 5 flat icons 64px style, assault rifle, submachine gun, shotgun, sniper rifle, pistol, dark rounded square background, centered, no text

14. icon-gear.png grid:
game item icons row of 5, tactical helmet, plate vest, canvas backpack, pickaxe, axe, dark rounded square background, no text

15. icon-throwable.png grid:
game item icons row of 5, plastic explosive block, molotov bottle, smoke can, flash grenade, frag grenade, dark rounded background, no text

16. icon-medical-food.png grid:
game item icons row of 6, bandage roll, medkit box, pills bottle, grilled meat, fish, jam jar, dark rounded background, no text

17. icon-material.png grid:
game item icons row of 6, log wood, granite stone, scrap metal gear, circuit part, battery, purple crystal shard, dark rounded background, no text

18. ui-chrome.png:
dark sci-fi UI chrome kit, empty panel background, primary button, rarity frames common to mythic 5 colors, flat clean, no text, no icons inside

保持同色系低饱和，单体留出透明/纯底方便抠图，图标居中不要字。按文件名保存到 public/art/。
```

## 前端接法（一句话）

```
public/art/*.jpg|png -> /art/*.jpg|png
keyart-dawn -> index.html 背景 / loading
map-* -> WorldMapModal.tsx 预览
texture-ground -> IsometricEngine.ts 地面 alpha 0.08 平铺
char/monster/building/nature/prop -> IsometricEngine.ts drawPlayer/drawMonster/drawBuilding/drawPineTree/drawOakTree/drawCarAndWelder 替换 fillRect
icon-* -> items.ts ITEM_DEFS icon / Hotbar.tsx / InventoryModal.tsx / BuildingBar.tsx 把 emoji 换 <img>
ui-chrome -> TopMenuBar / CharacterHUD / Hotbar / 面板类统一底
```

丢进 `public/art/` 跑 `http://127.0.0.1:3000` 先看全局，不顺眼只换色不加细节。
