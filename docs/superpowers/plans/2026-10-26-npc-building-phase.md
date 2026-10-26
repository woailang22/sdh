# 野外NPC阶段建筑扫描复用

> **For agentic workers:** Execute the checkpoints sequentially. Only readonly final review is delegated under requesting-code-review.

**Goal:** 降低多只野外怪物模拟时对其它营地持久建筑的重复读取，保持碰撞、视线、死亡、重生、保存和回滚规则。

**Architecture:** 保留buildingsFor默认实时查询。仅在同一个同步simulateMonsters调用内，按需收集一次公共世界持久建筑引用并交给原筛选逻辑；每只怪物仍按自己坐标做原80格过滤、覆盖去重和generated查询。阶段结束即丢弃，没有跨tick缓存或长期索引，不改客户端、DB格式、地图、资源、AI/移动/伤害参数。全世界仅一只怪物时沿用原路径；无有效NPC查询时不枚举。

**事实与取舍:** 当前源88f744a，manual7039/13212/39156仍在线且尚无result，不重开。用户新确认“少量起步，高产出放在危险据点”，采石已试调1份符合方向，数值1并非用户逐字指定，风险点需按实际门禁/守卫核验。服务器buildingsFor每只NPC都Object.keys全部持久建筑；旧循环替换微测已证明无益，长期空间索引又涉及公开可变字典及rollback失效，因此选择同步阶段内复用。该改动不声称浏览器卡顿、GPU、总内存或16人承载已通过。

## 检查点

- [x] 阅读buildingsFor、simulateMonsters、damage/tick/Undo及直接字典插删/替换和NPC现有测试。
- [x] 9例回归：首次1红6绿，16NPC原读取16次而非1；当前常规路径0/1/16读数0/1/1，远处/未到重生期0。覆盖两地点closed/dead public覆盖、继承/错图、直接开门/字典替换/敏感删除、shared-save失败完整undo重试、同phase公共/床复活/真实fixture物品掉落一次/出生碰撞/后续远NPC跳过。死亡会另走原bed与clearSpawn查询，不能说整个致死tick全局只扫一次。
- [x] 仅server/worldState.ts默认source参数与阶段内引用字典改动，保留key顺序、HP0覆盖、原引用/门状态和每NPC半径/生成定义合并；定向4文件180绿。
- [x] 首全量58文件857绿；新增致死2例后新测试错误导入house函数，改navigation，失败日志留存。首types TS18048临时字典可undefined，改明确类型local candidates再赋值；首次types观察超10秒仍live而build随后开始，重叠与失败均披露。最终58文件859绿、types-final2零错误且确认进程终态后build-final零退出，n4x6Auw2/旧Vite警告及插件timing备注保留。未做大型负载/墙钟速度比较；检查窗口记录，未来manual样本若重叠须披露其它主机工作，不能当独占CPU/GPU。
- [x] 最终独立只读复核无P1/P2，32项哈希、Git88 baseline、致死与敏感删除断言及859终态吻合；68项manual客户端/图片绑定保持，review未用浏览器/DB/复跑。普通提交推送并加入master检查点。原始完整目标继续active，manual服务仅在结果已保存或明确终态后收尾。

公报2026-10-26-npc-building-phase-results.json绑定14当前source与18证据。结构读取减少不是速度/容量承诺；全state多monster但仅一条有效查询仍会分配投影，移动/snapshot/core/死亡/防御等默认路径全局扫描未被本轮消除，不能将整个空间查询要求勾完。manual仍是7039/PID13212/39156，68项客户端/图片hash保持，无浏览器输出时不伪造结果。
