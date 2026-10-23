# Connection Gameplay Readiness Implementation Plan

> 使用既有调试、writing-plans、先失败后实现和executing-plans流程执行；交付前独立只读复核。当前main普通推送已有用户授权，复用当前干净checkout。

**Goal:** 初始化、断线和基线恢复时真实暂停输入，显示真实连接状态，恢复后从权威坐标继续。

**Architecture:** NetworkManager沿用isConnected并在完整状态应用后置真；App将其接入既有inputBlocked；Engine在blocked update收掉残留控制和待提交搜索。现有TopMenuBar/RadioChat/OnlinePlayersModal显示同一状态，无依赖或新状态机。

**Tech Stack:** TypeScript/React/Canvas/Vitest；CUA原生操作；独立owned SQLite QA。

- [x] 读NetworkManager及所有直接调用、App连接/快照/输入、Engine事件/update、三个状态组件和既有测试；定义范围/取舍/成功标准。
- [ ] NetworkManager.test先新增实际socket发送/回调顺序用例，Engine.test先新增真实update blocked控制/待提交搜索回归，组件SSR覆盖三态，运行并保留失败。
- [ ] NetworkManager open/close重置ping:null与lastPingSent；收到完整快照应用回调后仅首次就绪通知；decode gap置未就绪并保留一次state_sync；pong仅在就绪计RTT；send中仅game_action/player_sync在未就绪拒绝，控制包仍正常。
- [ ] App在断开回调即时阻塞/清键/清目标，init快照强制correction；初建/后续inputBlocked加入连接，Dpad回调尊重屏蔽。Engine blocked update清掉输入、movePath和待提交搜索，保留update/draw。
- [ ] ping类型贯通null；顶部/聊天/名录未就绪显示等待、隐藏旧在线/延迟，正常连接未测显示测量中，聊天离线不假发送。场景增加小状态卡。
- [ ] 跑焦点/有效撤关键guard负控并finally恢复/全测/类型/构建；不放宽既有timeout，失败保留并定位。
- [ ] 独立新空owned QA正常CUA行走→停所属服务→离线多输入/面板切换→同DB重启→恢复移动；无资产/位置/HP编辑，保存实际画面/状态/错误/慢帧，审计及一致性备份恢复。
- [ ] 公开去凭据证据、更新总checkpoint、独立只读复核，关闭所属服务/页/恢复视口，普通提交推送sdh/main并核对远端；完整目标保持进行中。

Network测试通过现有fake WebSocket的onopen/onmessage/onclose、StateEncoder与GameWorld.createMemoryDb，比较真实socket.send消息类型，回调内断言isConnected仍false、其后为true。Engine测试用既有setup/真实update，设置blocked前实际keyboard/path/joystick/火力和搜索计时，断言坐标/弹药/动作及解锁无回放；再新输入可行走。UI测试用已有renderToStaticMarkup约定，未就绪断言没有ping/旧人数、可见等待；已连接null/有效ping分开验证。运行npx vitest run对应文件、npx tsc --noEmit、npm test、npm run build；受影响源码只包含本规格链路，不顺带格式化或重构。
