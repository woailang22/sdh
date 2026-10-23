# Render Stage Attribution Implementation Plan

> 复用调试、先失败后实现、执行与完成验证流程；交付前独立只读复核，已授权普通推送sdh/main。完整世界、玩法/经济、性能与多人目标保持不变。

**Goal:** 让当前原生行走慢帧给出真实、当前帧的粗粒度阶段及地面cache刷新证据，进而据证定位。

**Architecture:** Engine复用五段时间和地面状态对象；仅在既有慢样本实际draw时复制阶段，primitive cache字段进入scene。FrameDiagnostics.snapshot深复制可选阶段，无新依赖/诊断UI/上传。

**Tech Stack:** TypeScript/Canvas2D/Vitest/原生CUA；隔离owned SQLite QA。

- [x] 读取当前2afb02a、原62.2ms/旧trace限制、render/ground/cache/FrameDiagnostics及测试，定义本阶段取舍和证明范围。
- [x] 测试先行：真实start/受控分段耗时、update-only不沿用、失败不入成功；真实cache初建/复用/scroll/texture组合与字段重置；snapshot嵌套隔离及20上限。5新增/1强化，初红6项，旧159项通过。
- [x] frameDiagnostics.ts新增可选renderStagesMs并深复制；Engine固定对象/六个时钟边界测五段与地面真实路径元数据，readFrameDiagnostics说明墙钟语义；不加入全帧对象分配或新缓存。
- [x] 焦点165通过，分项负控撤阶段采集2红/元数据重置1红/深复制1红并finally按字节恢复；最终全45文件698、含QA的类型/构建DPOSKexH通过。初全测5项server-start等待超时，相关20项及完整重跑通过，未改超时、根因未确认；新测试spy返回void类型失败改合法诊断对象，保留原日志。
- [x] 隔离新空普通游客原生正常搜食和行走，记录路线/阶段/天气/纠正，审计资产与一致性backup恢复。A30+A30、D30+D30各约228格/12数据块，实际段间4.914秒/6.122秒，因此是四段30秒而非连续60秒验收；初错误连续时长审计失败保留，改为验证真实分段并保留停顿。6条慢帧全在页面前8.1秒，含2早期移动位置；长腿未新增、错误[]，不代表渲染问题解决。
- [x] 公开去凭据证据66来源、总checkpoint与独立只读源码/最终证据复核完成，无P1/P2；审核者独立重算分段、hash与动作账目，只认可诊断范围。owned39133服务/临时页关闭、视口恢复。按已授权sdh/main普通交付流程，在提交后核对远端；不把诊断或单路线测试说成整体性能通过。

测试使用既有Engine.setup、真实render排队/主循环，仅各绘制子方法增加确定的模型时钟开销；断言五段总和与外部draw计时一致并显示到最终JSON，而非仅断言被调用。下次update-only RAF慢样本不含旧分段；渲染throw保留既有错误记录。地面标志由实际cache路径设置，借既有artImage load与renderMapGround测试验证组合；snapshot修改嵌套字段不影响后续读取。运行npx vitest run src/game/frameDiagnostics.test.ts src/game/IsometricEngine.test.ts，再npm test、npx tsc --noEmit、npm run build；原生只用可见页面输入/现有设置面板导出，禁止注入engine/模拟输入或CDP替代。

原生共8612接受包（2478移动/6134静止）、拒绝/错误/overflow0、累计纠正1（初连基线，未捕获逐次时间，不称零纠正）。正常农舍搜3食2水1种、吃2食每份35，6唯一动作，末1食2水1种/资源全0/空装备/无营地，HP100/盾50/饱食50.52725，SQLite一致性与backup经GameWorld恢复均通过。终图早于最终checkpoint，饱食自然递减，不逐项当作终态。

新原生已确定慢段为早期地面77/72.6ms（texture pending）及一帧实体57.6ms，总draw最大130.7ms；粗段可能含GC/调度/图像上传等待，尚无单因证据。本阶段未降低画质/扩缓存或做渲染优化；上轮62.2ms移动draw与完整P95/GPU/物理呈现/长期内存/多人经济仍未解决。下一阶段针对纹理就绪做有因果对照的缩小定位，不能凭一个粗段盲改。
