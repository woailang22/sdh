# Render Cadence Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans逐项执行。交付前requesting-code-review独立只读复核；复用当前clean main，已授权普通sdh/main推送。

**Goal:** 修复已复现的60Hz浮点边界漏绘，同时保留60次绘制上限与全部游戏行为。

**Architecture:** 仅修改IsometricEngine.start的elapsed阈值及lastRenderTime整数周期推进，不改FrameDiagnostics/素材/地图/服务器规则。Engine真实start-loop测试覆盖固定/高频/量化时钟、延迟、隐藏恢复。

**Tech Stack:** TypeScript/Vitest/现有Canvas引擎、独立esbuild QA页/原生CUA、owned隔离QA数据库。

- [x] 阅读当前start/FrameDiagnostics/慢帧/总规格和247224b；受控当前Engine60秒60Hz3600回调→2983绘/615长间隔，明确非实机结论；选择0.1ms数值容差+整数周期推进，写设计与取舍。
- [x] 在src/game/IsometricEngine.test.ts新增真实start循环调度回归，先看到3600绘业务断言红；源码1处实现后焦点绿。
- [x] 负控恢复旧阈值与取模、确认新增回归失败并字节恢复；必要全测、全部QA类型、最终生产构建。
- [x] 独立浏览器采集真实RAF，再把原始timestamp输入旧/新实际Engine.start同一受控循环回放，保存时钟/计数/间隔及最终生产bundle；轻量浏览器页本身仅为公式对照，不冒称页面运行真实Engine或物理呈现。
- [x] 最终生产包1920×1080普通新游客正常搜食，完成两个方向各两段30秒跨块试玩，保存真实段间间隙、资产/存档/备份恢复/错误/slow；单次60秒工具拒绝事实留档。
- [ ] 严格连续单次60秒及完整性能验收仍未完成。当前CUA单次输入上限30秒且无按下/松开接口，不能把分段试玩提升为此门槛通过；整体目标继续。
- [x] 公开去凭据报告/总checkpoint、源码与最终65来源证据独立只读复核无P1/P2、自有进程和页清理；普通提交sdh/main推送及远端核对作为最后交付动作。整体目标继续。

实施核心（验证红后再写）：
```ts
const frameInterval = 1000 / 60;
const renderEpsilon = 0.1;
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

原生环境检查点：最终CVuLyfU-正常1920×1080普通新客进入，初5slow已单独导出。60000ms按键被原生工具参数校验拒绝，未发送输入。能力清单没有keydown/up，故改记录两次30秒回归试玩及明确间隙；严格单次60秒验收未通过并继续保留，不升级为自动跑/注入输入规避工具上限。

## 交付验证

11新增实际start闭包回归，先7红/165绿，改elapsed+.1ms与整数周期后172绿；去阈值和相位改动负控7红finally字节恢复。45文件722完整测试（2workers）一次通过，最终全部QA类型检查通过，构建CVuLyfU-通过并保留既有大包提示。旧受控60Hz3600回调2983绘、615间隔>25ms，修后3600绘/无>25ms，实际源码回放对其他59.94/75/120/144/165/240Hz保持正确上限。这里是无绘图成本的确定模型；75Hz下P95仍26.667ms是刷新周期量化，不凭模型宣称GPU改变。

独立原生轻页面20秒3301时钟，median6.1ms，旧/新实际Engine.start回放都是1200绘/P9518.3/max18.6ms；没有本机提速证据。最初0.001ms仅解决浮点模型，0.1ms量化仍2400绘；在生产实现前修正为0.1ms。1ms更粗/任意抖动/任意初始相位与长期会话未完整验证。

原生最终包A30+A30从0,1到-161.2789,162.2789，228.08284格，1101移动包/12块；D30+D30回0.01505,0.98495，228.10412格，1097移动包/12块。两段间最大移动包间隔270.7904/275.0461ms，首末移动60.3014/60.3017秒，严格不是单次持续60秒。7548同步包全接受，2336移动/5212静止，error/reject/overflow0、纠正1（初始）。正常搜农舍3食2水1种、吃1份+35，5唯一动作账本一致；最终9.4194,9.4557/HP100盾50饱食29.2435，2食2水1种，资源0/空装备/无营地，共享资产未动，保存状态与一致性backup经GameWorld恢复通过。没有GM/改生命/时钟/坐标/物资。

初5slow/最终10slow全部保留，画面错误[]；cold draw123.7/ground121.6ms、最大RAF186.9ms仍在。新增5条的位置在去程终点或回到农舍后，单点坐标不能独立证明是否仍移动；没有全帧P95，不把slow过滤后的短绘制当分布。新旧原生分辨率/DPR/场景不同，不混为性能对照；此次没有修复冷地面和长期内存问题。observer有开销，JS heap单点不是800MB浏览器总占用。源代码独立只读复核无P1/P2，最终公开报告及证据复核完成后普通推送；总目标保持。

证据复核精度补充：Node/Vitest实际Engine回放把捕获timestamp整体平移到首帧1000ms，保留原始相对间隔，不能说实际Engine按未变换的绝对时钟起始。浏览器轻页公式直接使用其原始时钟，两个环节区分。最终bundle/index归档因文件名不含日期曾被自动清单筛掉，已显式加入最终65来源SHA清单；不重跑或改数据。
