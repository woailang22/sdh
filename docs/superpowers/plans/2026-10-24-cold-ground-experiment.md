# Cold Ground Experiment Implementation Plan

> **For agentic workers:** 使用superpowers:executing-plans逐项执行；最终requesting-code-review独立只读复核。已授权sdh/main普通推送，不复问实现许可。

**Goal:** 用真实Canvas的受控实验将冷地面粗段拆成可验证的候选成本，只有因果证据与质量守恒通过才改生产。

**Architecture:** ignored data内专用HTML/浏览器ESM harness打包当前Engine；owned loopback静态server只读public/art与harness，不接游戏/DB。四组交替新实例/新画布，统一已解码实际图片；单独profile不混入主对照。

**Tech Stack:** TypeScript/esbuild/Canvas2D/CUA/NodeHTTP；后续如需生产改动用既有Vitest。

- [x] 阅读当前ffb540b、stage原始记录、artImage/tileImage/tilePatch/drawTileTexture/renderGround及测试，明确单因实验与限制，保留未验收门槛。
- [ ] 实验页先运行现有生产路径/提前图集/去纹理/去details四组，保存每次提交/读回及独立profile、真实素材/环境；对照顺序交替，首次样本保留。
- [ ] 根据结果选单个假设；若局部替代值得验证，先失败的正确性/工作量业务回归，再最小实现、实Canvas像素/顺序/计时对照；否则保留否定结果并继续定位，不提交降质消融。
- [ ] 对任何最终生产修改做负控、适配测试/类型/构建及普通游客取证；无生产修改时只验证实际实验源码和结论，不重复无关全测。
- [ ] 去凭据结果与总checkpoint、独立只读复核、自有服务/临时页清理、普通提交推送并核对远端；目标保持原范围。
