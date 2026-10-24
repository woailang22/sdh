# 快捷栏实际装备实施计划

> **For agentic workers:** executing-plans/TDD/systematic-debugging/verification-before-completion/requesting-code-review；已有设计/实施/普通推送授权。复用当前checkout；正式data/sdc.sqlite禁止访问。

**Goal:** 前六格点击或数字键直接使用/装备实际物品，状态由服务器确认，防止按键重复和等待ACK时的换回。

**Architecture:** App统一激活回调复用equipItem/use_item；装备/卸下添加pending请求保护并在applyGameState匹配ACK或断线释放，期间阻止误丢交换后的物品。Hotbar只转发一次回调并显示实际手持工具，InventoryModal给出同一等待状态；Engine可选数字键回调。

**Tech Stack:** React/TypeScript/Vitest、既有memory GameWorld、原生CUA+独立owned持久化服务。

- [x] 编写App装备/食物派发、延迟/无关/失败ACK、断线守恒测试；Hotbar语义按钮/反馈/传播测试；Engine非repeat/输入排除/隐藏7—0测试，先观察真实缺失导致红。
- [x] App将前六选择回调接原equipItem/use_item，装备选择清高亮；equipItem只发一个pending，匹配ACK或断线释放，不乐观改装备。Hotbar只转发、不再额外消费；展示实际tool和等待提示，装备等待时禁用装备格。Engine数字1—6非repeat回调，无回调和7—0保留选择语义。
- [x] 定向204绿；撤匹配ACK门禁或非repeat条件均得到失败负控并精确恢复。最终完整49文件772项、全部QA类型、XJsiO6j_生产构建通过；服务器规则和地形/资源生成零diff。
- [x] 同实赚角色一致备份继续。首轮未按计划饮水，取证等待中自然饥饿死亡，未回滚；正常农舍取3食2水1种，鼠标食物/空格食物/数字饮水，回营取回7项掉落后点击斧、长按数字4共1500ms换镐。两次equip而非反复换回；重启原生工具/物品保留，背包打开按4无动作。观察器仅记录。
- [x] 审计唯一请求/资产守恒/正常保存恢复，记录全部失败/饥饿状态和验证边界；关页停服务，76来源hash与最终独立只读审查通过。按既有授权普通push sdh/main，并核远端SHA/干净树；总目标保持active。

验收边界：5573移动包中1拒绝、10纠正，原因未采集，不作碰撞/速度断言；18唯一动作全部成功，资产逐阶段守恒，SQLite完整性与一致备份经实际GameWorld恢复到内存通过。原生观察器未保存冲刺标志，不由“没有dash动作”断言无冲刺；Space传播由单元测试覆盖。聊天输入未执行，本阶段无原生采矿收益、持续60秒行走、GPU/总内存或全境经济/付费防守验收。首次开屏未进入、非TTY EOF停服、农舍墙体受阻、测试helper/脚本语法/React返回类型/验收脚本索引类型失败均保留。源码独立复核无新P1/P2，证据范围按复核意见收窄。
