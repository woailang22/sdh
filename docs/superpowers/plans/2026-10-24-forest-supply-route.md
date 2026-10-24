# 深林补给线 Implementation Plan

> 使用writing-plans整理，executing-plans在已授权checkout执行；TDD/verification-before-completion/requesting-code-review约束继续。

**Goal:** 在现有西部深林增加有区别的补给停留点和可导航目标，保持旧世界几何和真实存量。

**Architecture:** 仅扩充worldRoutes静态用途/路线目录，world生成、画布路牌、地图现有链路复用。server不新增旁路。

**Tech Stack:** 既有TypeScript、Canvas、React、Vitest、memory GameWorld；不引入依赖。

- [x] 保存改前4096块规范化/全量hash与三柜定义、原生存档只从owned一致backup继续；不读正式DB。
- [x] src/game/worldRoutes.test.ts验证forest四目标/真实坐标/补给顺序/风险说明/南下仍五站；src/game/world.test.ts验证三房10×6南门与同ID/可达；src/game/navigation.test.ts验证地图入口。有效6红/61，随后61绿。
- [x] src/game/worldRoutes.ts给旧五站route=south，三新用途route=forest；south过滤所属路线，forest映射三个实际柜坐标并追加现有deep_tree。撤目录负控失败并恢复字节。
- [x] QA审计4096块规范化几何/实体相同；server既有链路部分旧柜/耗尽自然刷新/满包/幂等22用例通过，生产server无改动。
- [x] 同实赚角色原生走访三柜并正常返营；地图桌面/390窄屏实际操作、标记不传送；更深铁杉未原生采集，风险不冒称验收。16阶段8703包/15成功动作，无回滚；关闭全部页面/owned服务。
- [x] 最终49文件784测试、全部QA类型/D4Zbspb4构建；去私有报告/来源hash与独立源码复核完成，最终证据审查和原授权普通push按交付检查点收尾；总目标active。

原生地图复验增加视野聚焦与WorldMapModal一处深林路线字号修正。视野占比预期红保留；旧/聚焦后/加大字号后三套实际截图均保留，布局实际边界高度18px/15.33px，不把聚焦误称字体修复。手动按键遇旧房两次正常绕行；一次退出目标落HUD安全helper拒绝后正常走近重试，均未回滚。

检查点以功能路线、存量和真实运行证据为准，不以描述或静态截图替代玩法。新增类型须在所有现有south断言保留原五站语义。
