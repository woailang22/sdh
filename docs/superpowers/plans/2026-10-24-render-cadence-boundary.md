# Render Cadence Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans逐项执行。交付前requesting-code-review独立只读复核；复用当前clean main，已授权普通sdh/main推送。

**Goal:** 修复已复现的60Hz浮点边界漏绘，同时保留60次绘制上限与全部游戏行为。

**Architecture:** 仅修改IsometricEngine.start的elapsed阈值及lastRenderTime整数周期推进，不改FrameDiagnostics/素材/地图/服务器规则。Engine真实start-loop测试覆盖固定/高频/量化时钟、延迟、隐藏恢复。

**Tech Stack:** TypeScript/Vitest/现有Canvas引擎、独立esbuild QA页/原生CUA、owned隔离QA数据库。

- [x] 阅读当前start/FrameDiagnostics/慢帧/总规格和247224b；受控当前Engine60秒60Hz3600回调→2983绘/615长间隔，明确非实机结论；选择0.001ms数值容差+整数周期推进，写设计与取舍。
- [ ] 在src/game/IsometricEngine.test.ts新增真实start循环调度回归，先看到3600绘业务断言红；源码1处实现后焦点绿。
- [ ] 负控恢复旧阈值与取模、确认新增回归失败并字节恢复；必要全测、全部QA类型、最终生产构建。
- [ ] 独立浏览器真实RAF→旧/新同输入回放，保存原始时钟/绘制计数/间隔及源码bundle；不在实际游戏页注入引擎或状态，不混称物理呈现。
- [ ] 最终生产包同一受控环境普通新游客正常搜食，实际单次60秒持续行走跨块；保存失败/成功段、资产/存档/备份恢复/错误/slow，限制结论范围。
- [ ] 公开去凭据报告/总checkpoint、源码与最终证据独立只读复核、自有进程和页清理；普通提交sdh/main推送并核对远端。整体目标继续。

实施核心（验证红后再写）：
```ts
const frameInterval = 1000 / 60;
const renderEpsilon = 0.001;
// Each frame: preserve update(dt) and all surrounding error/visibility paths.
const elapsed = time - this.lastRenderTime;
if (elapsed + renderEpsilon >= frameInterval) {
  phase = 'render';
  this.lastRenderTime += Math.floor((elapsed + renderEpsilon) / frameInterval) * frameInterval;
  drawAt = performance.now();
  this.render();
  drawMs = performance.now() - drawAt;
  this.setRenderStatus(null);
}
```

执行验证：`npx vitest run src/game/IsometricEngine.test.ts`、负控脚本finally原Buffer恢复、`npx vitest run --maxWorkers=2`、`npm run lint`、`npm run build`。完整测试数字按最终输出记录，不猜。原始受控实验在data/engine-cadence-investigation-20261024.json，初stub错误日志保留。真实60秒实验期间不同时构建/测试/重负载；新图/数值/新设施均不夹带。
