# 有界行走帧记录实施计划

> **For agentic workers:** 按已批准性能诊断范围继续现checkout；TDD、systematic-debugging、verification-before-completion与requesting-code-review。普通sdh/main推送已有授权。正式sdc.sqlite禁止打开。

**Goal:** 允许玩家主动记录实际整段行走的全回调与绘制分布，固定内存上限并如实保留长暂停/中断/容量限制，为卡顿修复提供有效P95证据。

**Architecture:** 扩展现FrameDiagnostics有界主动capture、Engine原循环传递原始计时/位移/地面标志，原SettingsModal按钮启动并关闭设置；查看原诊断导出包含统计和可独立重算的原始行。无输入/模拟/渲染/资源规则改动。

**Tech Stack:** TypeScript/Vitest、原生CUA、独立owned QA一致存档和被动观察器。

- [ ] 阅读现诊断/引擎循环/设置与既有60秒限制，确认设计取舍并保存。
- [ ] 为FrameDiagnostics的全样本P95、末尾长gap、16384容量、null/中断/重启/快照写真实回归；Engine start-loop捕获普通/跳绘与stage/移动及异常中断，设置按钮静态验证。先红。
- [ ] 实施固定16384×9列Float64数据，仅主动capture收集。只在snapshot复制/排序。截止首回调入样后停止，连续性重置标中断，旧20异常不改。
- [ ] Engine每帧用原始位置前后差/现计时接线，原设置记录按钮调用并关闭；用户帮助说明正常走动和稍后查看记录。
- [ ] 聚焦绿、撤新接线负控后恢复、完整测试/全部QA类型/生产构建。独立只读源码复核。
- [ ] 同实赚角色一致性backup到新QA，1920×1080正常补给/出营/主动录制/实际两段30秒，明确间隙与真实移动量；原生导出capture原始行与最终错误/慢帧，独立重算P95/截止跨度/样本数，核资产保存恢复。
- [ ] 清理服务/页面/视口，公开去身份报告和限制，最终独立复核后普通推送核对。性能整体和全地图玩法总目标不标完成。
