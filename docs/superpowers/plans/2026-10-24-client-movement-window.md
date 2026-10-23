# 客户端移动碰撞范围实施计划

**Goal:** 客户端大列表移动时只把本帧可能碰到的建筑交给原精确检查，服务器路径保持原样。

**Architecture:** IsometricEngine.update移动分支新鲜筛选一次，半径来自共享navigation常量与此帧最大行程；无跨帧缓存。TypeScript/Vitest，现有CUA接口验证。

- [x] 调查与两个被拒共享navigation实验完整保留；24000点/20000视线/4路径对比只属被拒候选，不充当最终Engine等价证据。
- [x] 新增8实际Engine业务用例：4距离/远方floor读取先红、宽门普通/冲刺与开门、插入/移动/损坏、沿墙滑动；既有普通/转角冲刺→服务器150包用例双方加入70远方地板实际进入新分支。最终焦点133通过。
- [x] 仅Engine import+移动候选范围及两调用改变，server/navigation无改动。移除候选负控4失败，去掉此帧行程padding负控2失败并finally恢复（执行时132焦点，后补slide和放大原yard；最终生产代码同负控版本）。最后全44文件651测试/type/build通过，index-D2IaO3Aa.js。首全测IPC channel closed无终态汇总、QA副本inline type相对路径错误均保留；只修QA路径且esbuild运行时byte-identical，未改生产来掩盖失败。
- [x] 旧Engine完整源反向绑定a12a208通过。40个完整update内存trial，home_benchmark/camp128防止chunk变动，public388仅公共几何数组；无render/NPC/interactable，共享构造音效noop，160warm+1600measured、5轮交错。大列表均5/5更快，小25保留3快2慢；各对最终player深相等。首harness AudioCtx构造失败保留。CUA正常新空游客30s按键走114.26格返出生附近，1906包=554移动+1352静止全接受，累计纠正1，5慢帧/36cache；159.511s含空闲，非FPS/GPU/长内存或旧native验收。资源/HP100与共享资产守恒、一致性backup经GameWorld恢复通过。所属服务和页面终态关闭。
- [x] 公开docs/verification/2026-10-24-client-movement-window-results.json；独立只读复核43hash、源码/测试/计数/40trials及隐私无P1/P2或夸大。按授权普通推送main，交付SHA以Git远端回执及最终回复为准。完整目标保持进行中。
