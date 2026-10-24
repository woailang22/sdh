# 公共野外景观轮廓变体实施计划

> **For agentic workers:** 使用executing-plans/TDD/verification-before-completion/requesting-code-review，沿用已授权设计与checkout，不打开正式data/sdc.sqlite。独立审查只读，其余在主线程顺序执行。

**Goal:** 保持现有景观数量和全部玩法内容，减少重复倒木轮廓，让林地、岩地、湿地与工业地带出现配套外观变化。

**Architecture:** worldScenery生成时加入确定性variant，art登记同布局新图集，Engine已有drawWorldScenery选择图并按原图/几何顺序回退。数据模型仅客户端景观，不进持久化。

**Tech Stack:** 现有TypeScript/Canvas/Vitest、内置imagegen、透明PNG；CUA仅操作浏览器，隔离Canvas样片不接玩家/服务/存档。

## 1. 素材和基线

- [ ] 保存当前4096分块玩法JSON及景观锚点基线到ignored data，记录src相关hash。
- [ ] imagegen生成3×2透明1536×1024新图集；检查六帧内容和透明留白，保存public/art/world-environment-v2.png及prompt元数据。缺陷先修素材；不得覆盖原图。

## 2. 先红后绿的接入

Files: src/game/worldScenery.ts、src/game/art.ts、src/game/IsometricEngine.ts及其已有test。

- [ ] 测试同一分块重复输出相同variant，4种主要环境有0/1两类，类型/数量/排除条件仍成立。先运行`npx vitest run src/game/worldScenery.test.ts src/game/art.test.ts src/game/IsometricEngine.test.ts --maxWorkers=2 --minWorkers=2`观察预期红。
- [ ] WorldScenery增加可选`variant?: 0 | 1`；生成时写入稳定哈希位。renderer选择`prop.variant === 1 ? 'world-environment-v2.png' : 'world-environment-v1.png'`，新图失败回退原图，再旧几何。新增图集帧表与原表同坐标。
- [ ] 测试新图正常只draw一次、未到达回退旧图、两张均失败旧几何、旧对象仍旧图、遮挡alpha恢复、加载新图不使地面缓存失效。绿测后撤新增选择路径做失败负控，再字节恢复。

## 3. 完整性与真实Canvas

- [ ] 用基线逐一比较4096分块：玩法JSON完全一致；剔除variant的景观JSON完全一致；统计每类0/1数量、每块大型物件<=4和总量<=16。
- [ ] 使用现有隔离Canvas样片方式，4场景交替旧/新图，真实加载图片、浏览器截图检查纹理/透明边/人物前景淡化；只读DOM提取诊断，不操作游戏内部状态。记录额外图集解码大小与实际图片数量，不冒称总内存改善。
- [ ] 运行完整测试、类型和生产构建，检查diff，无无关改动。
- [ ] 保存去身份报告/来源SHA，独立只读审查后普通push sdh/main，核远端SHA和干净工作区；关闭本轮临时页/owned服务。总目标保持active。
