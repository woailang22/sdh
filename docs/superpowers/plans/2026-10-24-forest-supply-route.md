# 深林补给线 Implementation Plan

> 使用writing-plans整理，executing-plans在已授权checkout执行；TDD/verification-before-completion/requesting-code-review约束继续。

**Goal:** 在现有西部深林增加有区别的补给停留点和可导航目标，保持旧世界几何和真实存量。

**Architecture:** 仅扩充worldRoutes静态用途/路线目录，world生成、画布路牌、地图现有链路复用。server不新增旁路。

**Tech Stack:** 既有TypeScript、Canvas、React、Vitest、memory GameWorld；不引入依赖。

- [ ] 保存改前4096块规范化/全量hash与三柜定义、原生存档只从owned一致backup继续；不读正式DB。
- [ ] src/game/worldRoutes.test.ts验证forest四目标/真实坐标/补给顺序/风险说明/南下仍五站；src/game/world.test.ts验证三房10×6南门与同ID/可达；src/game/navigation.test.ts验证地图入口。运行新增用例看到预期红。
- [ ] src/game/worldRoutes.ts给旧五站route=south，三新用途route=forest；south过滤所属路线，forest映射三个实际柜坐标并追加现有deep_tree。运行定向测试绿，撤目录负控失败并恢复字节。
- [ ] QA审计4096块几何/实体与改前相同；server现有node.items保存链路做部分旧柜/空柜自然刷新/满包回归，避免新用途补满。若已通过则保持server实现。
- [ ] 正常owned原生查看地图/标记与实际补给访问，记录真实路径/消耗/风险与截图，关页停服；未访问部分明确保留未验收。
- [ ] 全部测试、类型、构建；去私有报告和来源hash、独立复核后普通push sdh/main；总目标active。

检查点以功能路线、存量和真实运行证据为准，不以描述或静态截图替代玩法。新增类型须在所有现有south断言保留原五站语义。
