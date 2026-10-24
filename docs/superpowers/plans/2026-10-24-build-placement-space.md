# 建造摆放空间修复实施计划

> **For agentic workers:** 按已批准营地建设范围执行此必要连带修复，systematic-debugging/TDD/verification-before-completion/requesting-code-review。复用当前checkout及实赚owned存档，不打开正式sdc.sqlite。

**Goal:** 在1280×720正常选择建筑后，人物周边地面可以点击摆放；保留原费用和服务端规则。

**Architecture:** BuildingBar增加本地展开状态，仅卡片选择收起；compact显示共享recipe的选中名/费用/不足与重选/退出。App底部父容器不截空白点击，子面板仍可操作。

**Tech Stack:** React/TypeScript/Vitest、现有构建和原生CUA。

- [x] 用原生点击、DOM命中与被动服务器流水定位，保存设计，确认与实赚建造目标直接相关。
- [ ] 保留旧版原生截图、组件选择/重选/费用与不足回归先红；仅改BuildingBar展开状态和App父子pointer规则。
- [ ] 修后聚焦/撤改负控、完整测试、全部QA类型和Vite构建；独立只读源码复核。
- [ ] 同owned DB继续1280×720原生正常建设/制造/仓储/重连，由实赚工作台计划统一核对收支、持久化和清理；提交验证结果并普通推送。
