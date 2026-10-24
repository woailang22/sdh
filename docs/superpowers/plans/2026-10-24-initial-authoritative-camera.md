# 首份服务器状态相机修复实施计划

> 使用systematic-debugging、writing-plans、executing-plans、TDD、verification-before-completion和requesting-code-review；已有实施/普通推送授权，复用当前checkout和owned QA存档，正式DB不访问。

- [ ] 核对App首次快照/引擎创建顺序与既有warpToMap实现。
- [ ] 在现有App回调fixture加入初始远坐标和warp spy，首份同world必须warp、后续普通/纠正不重复；真实Engine验证warp后人物居中且无输入update相机静止，观察有效红。
- [ ] 最小修改首份同步条件，绿测、撤条件负控原字节恢复、完整测试/类型/构建。
- [ ] 同owned DB远处角色1920×1080原生重连，保留此前及当前初始化记录和页面错误；不改资产/时钟，关页停服恢复视口。
- [ ] 连同两段开阔路线记录独立重算分位数/移动/跨块、保留1280失配和13—15秒间隙/方向选择偏差；审计保存恢复/来源hash，独立审查与普通推送，核远端SHA和干净树。整体目标保持active。
