# 首份服务器状态相机修复实施计划

> 使用systematic-debugging、writing-plans、executing-plans、TDD、verification-before-completion和requesting-code-review；已有实施/普通推送授权，复用当前checkout和owned QA存档，正式DB不访问。

- [x] 核对App首次快照/引擎创建顺序与既有warpToMap实现。开屏期间状态先到，engine创建后的重放prev非空；使用既有投影engine身份，而非只检查!prev。
- [x] 在现有App回调fixture加入初始远坐标和warp spy，首份同world（状态前/后到）及替换引擎3红；后续普通/纠正不重复；真实Engine验证warp后人物居中且无输入update相机静止通过。
- [x] 最小修改首份同步条件，仅App读取既有投影标记提前；205定向绿，撤条件及错误!prev方案均负控失败、原字节恢复，完整49文件776项/类型/BfVuIukN构建通过。
- [x] 同owned DB远处角色(-60,-298.9403298064224)、1920×1080原生重连；保留此前及当前初始化记录，旧5个慢样本中3次scroll、其中ground93.3ms，新5个样本scroll0但仍一次draw50.1ms；不是全部帧/完整启动优化验收。新页错误[]，资产/时钟正常，关页停服恢复视口。
- [x] 连同两段开阔路线记录独立重算分位数/移动/跨块、保留1280失配和13—15秒间隙/方向选择偏差；审计保存恢复通过，85来源hash与最终独立证据审查无新增P1/P2。按既有授权普通推送并核远端SHA/干净树；整体目标保持active。
