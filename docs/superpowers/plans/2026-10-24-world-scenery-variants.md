# 公共野外景观轮廓变体实施计划

> **For agentic workers:** 使用executing-plans/TDD/verification-before-completion/requesting-code-review，沿用已授权设计与checkout，不打开正式data/sdc.sqlite。独立审查只读，其余在主线程顺序执行。

**Goal:** 保持现有景观数量和全部玩法内容，减少重复倒木轮廓，让林地、岩地、湿地与工业地带出现配套外观变化。

**Architecture:** worldScenery生成时加入确定性variant，art登记同布局新图集，Engine已有drawWorldScenery选择图并按原图/几何顺序回退。数据模型仅客户端景观，不进持久化。

**Tech Stack:** 现有TypeScript/Canvas/Vitest、内置imagegen、透明PNG；CUA仅操作浏览器，隔离Canvas样片不接玩家/服务/存档。

## 1. 素材和基线

- [x] 保存b18199e的4096分块玩法JSON哈希及原景观JSON到ignored data，供逐块对照，不读取存档。
- [x] imagegen生成3×2透明1536×1024新图集，首版2512547字节。一次对齐修订没有改善，弃用修订、选择首版；明确未达到prompt32px/统一y450。首版实轮廓在格内、边缘alpha<=3（255制），6帧按实测接地点登记，元数据保留全部偏差。原图未覆盖、脚本只检查图片。

## 2. 先红后绿的接入

Files: src/game/worldScenery.ts、src/game/art.ts、src/game/IsometricEngine.ts及其已有test。

- [x] 同一分块重复输出相同variant，六类图集物件均有0/1。上述定向命令先4项预期红（缺variant/帧/选择/回退），旧用例仍通过。
- [x] WorldScenery增加可选`variant?: 0 | 1`；生成时取原哈希高位，原位置/类型/scale不改。renderer按variant选择新图，接地点取实测值；失败回退原图再旧几何。图集帧表与原表同坐标。
- [x] 206定向项绿；新图成功一次draw、未ready回退旧图、双图失败几何、旧对象/低草原路径、alpha恢复、新图加载不失效地面缓存均覆盖。禁用alternate路径负控2项红，原字节恢复后206绿。

## 3. 完整性与真实Canvas

- [x] 4096分块玩法JSON哈希与基线相同，去variant景观JSON完全一致；17007锚点不增减，实际每块总上限15/大型4，六图集类型各有0/1。
- [x] 实际双Engine四场景各8轮正反顺序共64次/最终Canvas600×360，18张实际图片解码；四景截图、人物近景淡化和真实缺图回退保存。首次样片600×388且开屏提示遮挡，修正QA容器并移除仅样片开屏提示后重跑，初/第二轮数据保留，不改产品。新增图RGBA6MiB，不称总内存/GPU改善；各轮小幅submit波动不支持一致性能提升。
- [x] 完整47文件756项、全部QA类型、DAKYpUWo生产构建通过；原有Vite配置/大chunk警告保留。仅3生产代码文件和配套素材/回归；无server或玩法生成修改。
- [x] 去身份报告提交前53项来源SHA独立复核全匹配；64试次顺序/统计/实体数与4景/淡化/回退截图、756全测/类型/构建对应，无P1/P2。素材偏差和额外下载/解码成本明确。最终仅补审查收据、本项勾选并重生成54来源hash，按原授权随本次提交普通push sdh/main后核远端SHA/干净工作区；tab82及owned服务27024/39146已终态。总目标保持active。
