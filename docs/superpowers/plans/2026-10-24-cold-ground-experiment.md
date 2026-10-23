# Cold Ground Experiment Implementation Plan

> **For agentic workers:** 使用superpowers:executing-plans逐项执行；最终requesting-code-review独立只读复核。已授权sdh/main普通推送，不复问实现许可。

**Goal:** 用真实Canvas的受控实验将冷地面粗段拆成可验证的候选成本，只有因果证据与质量守恒通过才改生产。

**Architecture:** ignored data内专用HTML/浏览器ESM harness打包当前Engine；owned loopback静态server只读public/art与harness，不接游戏/DB。四组交替新实例/新画布，统一已解码实际图片；单独profile不混入主对照。

**Tech Stack:** TypeScript/esbuild/Canvas2D/CUA/NodeHTTP；后续如需生产改动用既有Vitest。

- [x] 阅读当前ffb540b、stage原始记录、artImage/tileImage/tilePatch/drawTileTexture/renderGround及测试，明确单因实验与限制，保留未验收门槛。
- [x] 实验页运行4组消融48次与3个候选各24次，共120次。每组12次正反顺序交替，全部首次/离群样本保留；真实11张素材均成功解码，1254噪点和512地砖尺寸核对PNG头。页面1280×720/DPR1.5，固定canvas1920×1080，单独profile有额外时钟开销。
- [x] 四个方案都不进生产：预热计入准备后中位38.95ms较baseline29.8ms更慢；直接图集44.35/37.8ms且每张337通道字节差1；额外可见扫描35/32ms、复用失效扫描37.5/34.9ms虽逐字节相同，但均只在强制读回总时间变快，不能作为实际绘制/物理呈现收益。不触发生产实现/TDD分支，保留否定结果而不改质量标准。
- [x] 无生产代码改动。esbuild依赖图21个src均与ffb540b无diff，原698测试仅源码hash绑定、未重跑，不冒称新一轮全测/生产Vite构建。实验esm构建与全部新增QA类型检查通过；metadata重编bundle与运行a4归档字节相同。各阶段源码/html/bundle/原始JSON保留，公开清单65hash验证。
- [x] 去凭据结果与总checkpoint完成，独立只读复核65hash/120计数/逐项加和/正反顺序/派生中位数/图片与来源，未发现P1/P2；按建议把CPU submit改称API包围墙钟，仍不作纯CPU/GPU归因。自有服务/临时页已清理，按已有授权普通提交sdh/main后核对远端，完整目标保持原范围。

原harness对于偶数12个样本输出lower-ranked P50，公开派生中位数改用两个中间值的平均，并完整保留原summary。a1像素验证只是32bit checksum重复/预热相同，a2～a4增加全RGBA逐字节比较。每个页面第一试次都是baseline，不能将首次离群值与后面候选比作冷启动收益；素材已解码、fixture准备/两帧等待/像素检查/回收在计时外，强制读回会改变同步和GPU状态，不是原生完整冷启动或物理呈现。

without-details只跳过独立renderGroundDetails，drawWorldGroundDetail仍在逐地砖函数中，不足以排除所有装饰成本。原77/72.6ms地面、57.6ms实体与62.2ms移动draw仍未解决。未接游戏服务/DB/账号、未改真实坐标/生命/资源/时钟；自有静态39134/PID38984已关闭、tabs[]、视口未改。下一步保留正式renderer、补有代表性的真实持续行走/呈现证据，并继续原地图资源玩法验证，不重复盲加预热或缓存。
