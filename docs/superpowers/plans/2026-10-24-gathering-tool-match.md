# 采集工具名称精确匹配实施计划

> **For agentic workers:** 按systematic-debugging证据与test-driven-development执行；requesting-code-review最终独立只读复核。当前checkout继续，sdh/main普通推送已授权，不访问正式sdc.sqlite。

**Goal:** 装备镐时伐木每次1、石斧每次3，保持各工具既有采石/钓鱼和真实资产规则。

**Architecture:** 仅替换equipmentRules中的木材加成匹配为两个斧ID精确比较；复用既有共享函数和服务器gather链。新增共享工具矩阵与真实GameWorld动作回归，避免只检查采石就宣称没有斧加成。

**Tech Stack:** TypeScript、Vitest、原生CUA、独立owned QA SQLite一致备份、被动动作观察器。

- [x] 从1295a5c原生流水看到pickaxe_stone单次3木，定位未锚定子串正则，确认说明/批准工具分工与真实收益矛盾。
- [ ] 先写已知六工具共享矩阵和服务器真实切换/收益/节点/重放/恢复回归，确认当前实现因镐木收益失败。
- [ ] 仅改木材工具精确匹配，聚焦变绿；撤匹配负控后恢复，完整测试/全部QA类型/生产构建。
- [ ] 同一已停的实赚营地存档一致性backup到新QA；正常食用携带口粮、出营，用现有镐和斧分别实际采树验证1/3，不改坐标/材料/生命/时钟/节点。
- [ ] 核对动作、材料、装备、节点与保存/备份恢复，公开证据及限制；清理服务页面/视口，独立只读复核后普通推送并核对。地图/种子补给/防御/性能总目标继续。
