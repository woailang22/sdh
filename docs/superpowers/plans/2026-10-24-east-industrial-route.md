# East Industrial Route Implementation Plan

> **For agentic workers:** 按superpowers:executing-plans逐项执行，交付前requesting-code-review独立只读复核。已授权普通推送sdh/main；沿用当前合适checkout。

**Goal:** 在既有无缝世界地图上提供真实东行工业路线，使补给、工业材料、风险与营地用途可读。

**Architecture:** 仅扩展worldRoutes.ts的地图情报数组；WorldMapModal沿用现有路线选择/下拉/步行标记，世界生成和所有资源规则不改。worldRoutes.test.ts验证真实节点与配方工业成本，navigation.test.ts加强按钮输出。

**Tech Stack:** TypeScript/React/既有地图SVG/Vitest/原生CUA、隔离owned SQLite QA。

- [x] 读取2fb2808、worldRoutes/WorldMapModal/world生成、直接调用/测试、实际7节点掉落与配方/交易规则；确认燃油电池不作为熔炉燃料，写设计与取舍。
- [ ] 测试先行：东线真实7节点/坐标/view/ID唯一；前段补给及工业成本、深区有限材料与研究/防御条件；SSR路线按钮。运行焦点看真实断言红。
- [ ] worldRoutes.ts增加east单路线7点，复用原标签偏移/视图和风险文案，不动房屋/掉落/资源点密度/服务器。
- [ ] 焦点绿、移除新路线负控红并finally字节恢复、全测试/类型/构建及无关源/世界定义一致性验证。
- [ ] 最终生产包隔离新普通游客原生地图桌面/390窄屏选择与七点说明/不瞬移、前段正常走访搜刮；记录资产/正常生存/移动/纠正/错误/slow与一致性backup恢复，明确深区未实际完整走访。
- [ ] 初次取证发现持续饥饿被当成战斗伤害取消搜食，先补失败业务回归，再加独立lastCombatDamageAt与combat.ts共享快照损伤判定接App；保留所有伤害/死亡/恢复/交战/离线原规则，兼容旧服/旧档并覆盖真实攻击与混合伤害。负控、全测/类型/构建后继续同角色正常取证，不掩盖前次饿死。
- [ ] 更新公开去凭据证据/总checkpoint，独立只读复核、自有服务/页关闭/视口恢复，普通提交推送并核对远端；完整目标不缩小。
