# 手动地面缓存诊断实施计划

> **For agentic workers:** Use executing-plans to implement this existing approved performance design task-by-task; only the final readonly review is delegated under requesting-code-review.

**Goal:** 让用户手动打开本地页面取得当前源码、同实例预热后的地面滚动数据，补上现有首次绘制诊断与真实行走之间的缺口。

**Architecture:** 复用既有warm-ground缓存扫描，固定1920×1080、4地点×240浏览器回调、每步camera3/1.5像素。只调用地面绘图，不启动engine update/RAF循环，不连接游戏、不读DB、不加载账号；用户手动点开始，采集与保存由本地测试页执行。该测试不代替原生60秒行走、实体绘制、物理GPU或三轮全浏览器内存验收，不改变渲染行为。

**Tech Stack:** 现有IsometricEngine、esbuild、Node loopback HTTP、Canvas/RAF/可用的longtask与JS heap观测。无新依赖。

## 事实、方案与边界

上一轮6d0dc85为实质进展，采石新C4试调完成。原始性能验收仍未证明；已有首次绘制慢样本与96次独立engine的ready样本不能推出同实例稳定行走达标。自动原生浏览器因URL辨识保护停止，不能换浏览器自动化绕过。此处采用用户手动打开、仅本项目诊断代码记录的途径，不再调用浏览器工具。

候选一为无证据直接改缓存，无法判断收益与画面损失；候选二为继续重复既有新实例微测，缺少同实例滚动；选择复用既有同实例诊断并将来源/保存/中断做实。与已批准spec§9相同，属于诊断补全，不新增游戏功能或更换渲染框架。

## 检查点

- [x] 阅读engine地面缓存/resize/dispose、旧profile/来源绑定与frame diagnostics。
- [x] 新增scripts/qa-ground-profile.mjs（构建/25输入与43资源指纹/只读静态服务/一次结果保存）与.browser.ts、.html；不改src/server/package配置。输出只写新命名data目录，已有目录拒绝覆盖；POST仅本机同源、5MiB限制，校验run/source绑定/4×240次序/计数与有限数/phase/两个时钟差值；部分失败保留，绝不将测试payload保存为用户浏览器结果。
- [x] 2正22负内存校验、实际HTTP静态/大小/同源/来源/重复目录检查通过。CLI71950的ready→quit→exit0→39156独占绑定释放；只有预备接口检查，无浏览器。初TS2454保留，nullable修正后最终types0。a1/a2/a3旧版与a4最新构建均保留、指纹分开，未重跑不涉及的游戏850/Vite检查。
- [x] 最终独立只读复核无剩余P1/P2，105项哈希和两份a4来源/输出bundle绑定一致，未运行浏览器或读DB；编排合成标签、旧版失败与未验证范围清楚。普通提交推送诊断工具，不部署。
- [ ] 以新目录启动当前HEAD，验证本机就绪后提供URL，等待真实用户执行。唯一服务句柄保留，不能因观察超时重开。手动使用：`node scripts/qa-ground-profile.mjs --run=manual-ground-user-20261026-a1 --port=39156`，目录已用则换新后缀；只手动打开输出的127.0.0.1地址，点开始并保持前台，完成后读取该run/result.json，向owned CLI输入quit退出。服务存活为本次运行的工具凭据，不能用仓库勾选代替当前状态。
- [ ] 用户手动完成后读取同一服务保存的数据，先校验来源和完整性，再分析cold/tile-ready/warm-scroll/RAF/longtask/heap；确认真实慢点后另做最小渲染修改与同环境像素/性能对比。此项需要实际浏览器数据，不能用合成样本勾选。

复核关闭一处计时P2：rAF传入时间戳不冒充实际callback arrival；next内performance.now采callbackAt，callbackIntervalMs与rafTimestampIntervalMs分开并在接收端复算。只在合成编译插件中替换callbackAt为rafAt，故障注入16≠80预期失败1；恢复后7场景通过。世界编辑器覆盖只检查拒绝，不删除；主/ground-cache/overlay context丢失于最后绘制/读回仍中断；PO缺失兼容，导出前takeRecords后disconnect。

可复现的编排检查：`node scripts/qa-ground-profile.check.mjs`。它用Node VM及明确stub Engine检查normal960、PO队列记录、隐藏6、override0、三种末行loss959/全dispose，只写新命名合成摘要；不启动真实浏览器、Canvas、游戏或DB，不输出真实性能。`--fault-timestamp`应返回1且断言16不等于80，不把这个失败写成旧浏览器基线。实际用户测量仍待完成。
