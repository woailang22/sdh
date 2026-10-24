# 建造摆放空间修复实施计划

> **For agentic workers:** 按已批准营地建设范围执行此必要连带修复，systematic-debugging/TDD/verification-before-completion/requesting-code-review。复用当前checkout及实赚owned存档，不打开正式sdc.sqlite。

**Goal:** 在1280×720正常选择建筑后，人物周边地面可以点击摆放；保留原费用和服务端规则。

**Architecture:** BuildingBar增加本地展开状态，仅卡片选择收起；compact显示共享recipe的选中名/费用/不足与重选/退出。App底部父容器不截空白点击，子面板仍可操作。

**Tech Stack:** React/TypeScript/Vitest、现有构建和原生CUA。

- [x] 用原生点击、DOM命中与被动服务器流水定位，保存设计，确认与实赚建造目标直接相关。
- [x] 旧版1280×720原生截图和(608,280)命中DIV/未发build保留；3组件回归先红，局部增加paletteExpanded及App父子pointer规则。一次绿测失败是测试取按钮未考虑aria-label，修测试名解析后3绿，初失败日志保留。
- [x] 撤原BuildingBar负控3红、原字节恢复；完整47文件750项、全部QA类型及h4IZsC18构建通过。独立只读源复核无P1/P2，明确元素树测试不代替浏览器命中。
- [x] 同存档/位置/素材/1280×720，选择后收起、重选不退出、耗尽提示和两次真实支付建造通过。(608,280)新命中CANVAS但拟建(-3,26)距3.6超服务器3格，正常拒绝不扣费；另在合法(544,312)展开时命中菜单SPAN且不建，选卡收起后同点实际建(-3,28)。箱(3,28)也正常付费；不能把初无效点说成合法建造成功。工作台制造/仓库存取/服务重启后恢复与资产守恒详见实赚计划。最后独立证据复核、报告与普通推送由该计划收尾。
