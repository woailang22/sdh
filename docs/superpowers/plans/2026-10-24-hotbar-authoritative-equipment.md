# 快捷栏实际装备实施计划

> **For agentic workers:** executing-plans/TDD/systematic-debugging/verification-before-completion/requesting-code-review；已有设计/实施/普通推送授权。复用当前checkout；正式data/sdc.sqlite禁止访问。

**Goal:** 前六格点击或数字键直接使用/装备实际物品，状态由服务器确认，防止按键重复和等待ACK时的换回。

**Architecture:** App统一激活回调复用equipItem/use_item；equipItem添加pending请求保护并在applyGameState匹配ACK或断线释放。Hotbar只转发一次回调并显示实际手持工具；Engine可选数字键回调。

**Tech Stack:** React/TypeScript/Vitest、既有memory GameWorld、原生CUA+独立owned持久化服务。

- [ ] 编写App装备/食物派发、延迟/无关/失败ACK、断线守恒测试；Hotbar语义按钮/反馈/传播测试；Engine非repeat/输入排除/隐藏7—0测试，先观察真实缺失导致红。
- [ ] App将前六选择回调接原equipItem/use_item，装备选择清高亮；equipItem只发一个pending，匹配ACK或断线释放，不乐观改装备。Hotbar只转发、不再额外消费；展示实际tool和等待提示，装备等待时禁用装备格。Engine数字1—6非repeat回调，无回调和7—0保留选择语义。
- [ ] 定向绿；撤核心派发或ACK门禁做失败负控并精确恢复。完整测试、QA类型、生产构建；服务器规则和地形/资源生成零diff。
- [ ] 从owned workshop-storage终态一致备份继续同实赚角色，正常饮水后原生点击/数字换工具、持键、物品使用和实际反馈；观察器仅记录不注入状态。先准备脚本再开服务，避免等待时额外饥饿；超时检查同handle，不回滚。
- [ ] 审计唯一请求/资产守恒/正常保存恢复，记录全部失败/饥饿状态和验证边界；关页停服务，来源hash与独立只读审查后普通push sdh/main，核远端SHA/干净树。总目标保持active。
