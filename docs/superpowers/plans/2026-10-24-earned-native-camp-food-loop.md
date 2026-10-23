# Earned Native Camp Food Loop Verification

> **For agentic workers:** 使用executing-plans执行只读调查与原生玩法验证；发现问题后按systematic-debugging/TDD最小修复。最终requesting-code-review独立只读复核。沿用当前checkout，普通sdh/main推送已授权。

**Goal:** 用已有实际赚取物资的角色，从无营地推进到建营、种植田、正常付费播种、等待/领取土豆并实际食用，核对种子/材料/产出/存档守恒。

**Architecture:** 当前生产1e69e9d/CVuLyfU-不预设修改。用owned上一轮cadence QA存档的一致性SQLite backup复制到独立新QA路径，保留身份/真实资产；normal server clock/rules、原生CUA输入，不注入坐标/HP/时间/物资。观察器只记录正常请求前后及checkpoint；源码不变时已有722测试只标hash绑定，不冒称新跑。

**Tech Stack:** 现有Canvas/React、SQLite backup API、TypeScript readonly静态路线读取、CUA、被动服务观察器。

- [x] 阅读当前配方/设施UI/服务器production/gather/build与相关现有测试；暂未发现材料来源断点，不改成本和收益。确认旧first-camp不是全原生且其cookie可能已被新QA身份替换，避免强行恢复或修改身份。
- [ ] 验证source QA已停，以backup API一致备份复制到data/cua-camp-food-loop-20261024-a1.sqlite；新服务39138，单角色身份/原始2食2水1种/零资源/无camp应与来源终态一致。不打开正式data/sdc.sqlite。
- [ ] 原生正常吃/搜口粮，采木石、制造装备工具，获得实际建营/种植所需材料。静态world定义仅用于已知坐标路线规划，不当实际移动证据。按实际资源/耗尽/怪物处理，不预置。
- [ ] 在合法野外实际付20木10石建营进入；进入不回血不送设施。在营地实际付8木4石建种植田；付木2废2种1播种土豆，正常等待60秒，领取4份并食用1份按原定义+25饱食/+3生命上限结算。
- [ ] 确认种植任务开始/成熟/领取/无法再次领取的正常UI状态、资产守恒、动作幂等/错误/存档/backup恢复/绘图与slow；有未完成步骤就明确保留并继续，不用模型结果补齐实际流程。
- [ ] 若真实路径失败，先保存失败checkpoint/错误，再定位并写回归、最小修复/负控/全测类型构建，继续同一角色，不伪造成功或清档。
- [ ] 公开去凭据证据与总checkpoint、源码/最终证据独立只读复核、所有自有服务/页清理/视口恢复，普通提交推送sdh/main并核对。完整工业/研究/攻防/长期经济与性能仍待后续。

优先工具策略只是初始材料估算：石斧10木4石使伐木每次3，石镐8木6石使采石每次3；建营20木10石、田8木4石、播种2木2废。最终完全按正常请求前后核实际成本/收益，捡枯枝、搜屋及节点采空可能改变实际hit数。不能把估算当原生记录。当前nearby物资柜stock3/300s正常刷新，具体以源定义/存档实际readyAt为准，不改刷新时间。身体离线仍沿用原规则，不靠重启回满饱食。
