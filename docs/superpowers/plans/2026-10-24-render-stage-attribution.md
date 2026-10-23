# Render Stage Attribution Implementation Plan

> 复用调试、先失败后实现、执行与完成验证流程；交付前独立只读复核，已授权普通推送sdh/main。完整世界、玩法/经济、性能与多人目标保持不变。

**Goal:** 让当前原生行走慢帧给出真实、当前帧的粗粒度阶段及地面cache刷新证据，进而据证定位。

**Architecture:** Engine复用五段时间和地面状态对象；仅在既有慢样本实际draw时复制阶段，primitive cache字段进入scene。FrameDiagnostics.snapshot深复制可选阶段，无新依赖/诊断UI/上传。

**Tech Stack:** TypeScript/Canvas2D/Vitest/原生CUA；隔离owned SQLite QA。

- [x] 读取当前2afb02a、原62.2ms/旧trace限制、render/ground/cache/FrameDiagnostics及测试，定义本阶段取舍和证明范围。
- [ ] 测试先行：真实start/受控分段耗时、update-only不沿用、失败不入成功；真实cache初建/复用/scroll/texture组合与字段重置；snapshot嵌套隔离及20上限。运行npx vitest run对应文件看红。
- [ ] frameDiagnostics.ts新增可选renderStagesMs并深复制；Engine固定对象/五边界计时与地面真实路径元数据，readFrameDiagnostics说明墙钟语义；不加入全帧对象分配或新缓存。
- [ ] 焦点通过，分项负控撤阶段采集/元数据重置/深复制并finally按字节恢复，全部测试/类型/构建验证。
- [ ] 隔离新空普通游客原生正常搜食和行走，记录真实路线/活动时间/阶段/缓存/天气/纠正、错误与慢帧，审计资产和一致性backup恢复；只对证据支持的热点进入后续修复。
- [ ] 更新公开去凭据证据与总checkpoint、独立只读复核、关闭所属服务/临时页并恢复视口，普通提交推送并核对远端；不把诊断或单路线测试说成整体性能通过。

测试使用既有Engine.setup、真实render排队/主循环，仅各绘制子方法增加确定的模型时钟开销；断言五段总和与外部draw计时一致并显示到最终JSON，而非仅断言被调用。下次update-only RAF慢样本不含旧分段；渲染throw保留既有错误记录。地面标志由实际cache路径设置，借既有artImage load与renderMapGround测试验证组合；snapshot修改嵌套字段不影响后续读取。运行npx vitest run src/game/frameDiagnostics.test.ts src/game/IsometricEngine.test.ts，再npm test、npx tsc --noEmit、npm run build；原生只用可见页面输入/现有设置面板导出，禁止注入engine/模拟输入或CDP替代。
