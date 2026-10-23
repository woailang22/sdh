# 营地作物状态可读性实施计划

> **For agentic workers:** 按executing-plans实施此已批准大设计内的小项；test-driven-development先红后绿，requesting-code-review最终独立只读复核。沿用当前checkout和已授权sdh/main普通推送；不访问正式data/sdc.sqlite。

**Goal:** 玩家靠近营地种植田即可从形态和提示识别未播种、生长、成熟、损坏，并保留真实生产规则。

**Architecture:** 新增小型farmRenderer.ts，复用现有BuildingEntity.production与ITEM_DEFS；仅从IsometricEngine现有farm_plot绘制分支调用。绘图读取Date.now，不增加timer/图片/缓存/网络；授权/耗料/成熟/领取仍原服务器处理。

**Tech Stack:** Canvas2D、TypeScript、现有Vitest、原生CUA、独立owned earned QA SQLite与被动观察器。

- [x] 检查已批准设计、上轮真实截图、Engine分支、服务器DTO授权和领取路径、既有绘图测试；证实当前readyAt不影响绘图，根因在客户端表现。
- [ ] 在src/game/IsometricEngine.test.ts用真实drawBuilding入口补边界、领取清田、损坏/权限/距离与不改任务/请求的回归，运行确认旧实现按预期失败。
- [ ] 新增src/game/farmRenderer.ts，接入Engine农田绘图最小分支，保留其他设施/阴影/生命条/排序；聚焦回归变绿，做撤回接线的负控并恢复原字节。
- [ ] 运行完整测试、全部QA类型检查和生产构建，保留真实失败及修复过程，不凭模型计数冒称通过。
- [ ] 从上轮已停的真实QA存档一致备份新独立路径，同身份正常离营补木废再播种，不预置物资/坐标/生命/时间；原生截图确认四状态中可实际出现的空田/生长/成熟/领取后状态，损坏由测试覆盖而非花费不存在的爆破物伪造。
- [ ] 审计正常收支、请求/存档/backup恢复、当前页错误/慢帧及限制，清理所有自有服务/页与恢复视口；独立只读源与证据复核、公开脱敏报告并普通推送核对。

本轮为种植经营的可读性完善，保留上一轮全部失败与证据。种子再供给、工作台/仓库/防御衔接、完整地图/长期经济/冷地面/连续60秒/GPU/内存仍属于总目标，不因局部完成而删去。
