# Connection Gameplay Readiness Implementation Plan

> 使用既有调试、writing-plans、先失败后实现和executing-plans流程执行；交付前独立只读复核。当前main普通推送已有用户授权，复用当前干净checkout。

**Goal:** 初始化、断线和基线恢复时真实暂停输入，显示真实连接状态，恢复后从权威坐标继续。

**Architecture:** NetworkManager沿用isConnected并在完整状态应用后置真；App将其接入既有inputBlocked；Engine在blocked update收掉残留控制和待提交搜索。现有TopMenuBar/RadioChat/OnlinePlayersModal显示同一状态，无依赖或新状态机。

**Tech Stack:** TypeScript/React/Canvas/Vitest；CUA原生操作；独立owned SQLite QA。

- [x] 读NetworkManager及所有直接调用、App连接/快照/输入、Engine事件/update、三个状态组件和既有测试；定义范围/取舍/成功标准。
- [x] NetworkManager.test先新增实际socket发送/回调顺序用例，Engine.test先新增真实update blocked控制/待提交搜索回归，组件SSR覆盖三态，运行并保留失败。
- [x] NetworkManager open/close重置ping:null与lastPingSent；收到完整快照应用回调后仅首次就绪通知；decode gap置未就绪并保留一次state_sync；pong仅在就绪计RTT；send中仅game_action/player_sync在未就绪拒绝，控制包仍正常。
- [x] App在断开回调即时阻塞/清键/清目标，init快照强制correction；初建/后续inputBlocked加入连接，Dpad回调尊重屏蔽。Engine blocked update清掉输入、movePath和待提交搜索，保留update/draw。
- [x] ping类型贯通null；顶部/聊天/名录未就绪显示等待、隐藏旧在线/延迟，正常连接未测显示测量中，聊天离线不假发送。场景增加小状态卡。
- [x] 跑焦点/有效撤关键guard负控并finally恢复/全测/类型/构建；不放宽既有timeout，失败保留并定位。
- [x] 独立新空owned QA正常CUA行走→停所属服务→离线多输入/面板切换→同DB重启→恢复移动；无资产/位置/HP编辑，保存实际画面/状态/错误/慢帧，审计及一致性备份恢复。
- [x] 公开去凭据证据、更新总checkpoint、独立只读复核，关闭所属服务/页/恢复视口；普通提交推送sdh/main与本记录同批交付，推送后现场核对远端；完整目标保持进行中。

Network测试通过现有fake WebSocket的onopen/onmessage/onclose、StateEncoder与GameWorld.createMemoryDb，比较真实socket.send消息类型，回调内断言isConnected仍false、其后为true。Engine测试用既有setup/真实update，设置blocked前实际keyboard/path/joystick/火力和搜索计时，断言坐标/弹药/动作及解锁无回放；再新输入可行走。UI测试用已有renderToStaticMarkup约定，未就绪断言没有ping/旧人数、可见等待；已连接null/有效ping分开验证。运行npx vitest run对应文件、npx tsc --noEmit、npm test、npm run build；受影响源码只包含本规格链路，不顺带格式化或重构。

## 执行记录与验收界限

新增23回归（Network10、Engine6、UI7）初22失败/160通过；UI测试另先改用可见文本比较以免SVG数字污染断言，重跑仍6失败/1通过。修后焦点182通过；单独撤Engine blocked update产生6失败，撤底层send guard产生1失败，finally均按原字节恢复。默认全45文件690通过，构建index-CeH3_Iu3.js与最终包含QA脚本的类型检查通过。初类型检查发现OnlinePlayer.ping现有DTO要求number，先用undefined不合法；改兼容投影0，展示仍从独立nullable连接ping取值、不显示该回退。初失败日志保留，既有Vite警告不改。

旧构建普通新空owned a1/39132，CUA在线S2秒实际38移动包/7.8983格，停服务后界面仍0ms/信号强，D2秒本地显示(5.6,6.6)→(11,1.2)，约7.6368格是四舍五入UI距离，存档仍(5.584941,6.584941)。旧页未采浏览器帧环境，只有实际1920×1080截图及当时尚未重建的旧包，不推断旧DPR或性能对比。全部普通真实规则/时钟，无玩家状态修改。

同DB重起新版，恢复原权威坐标；在线D2和右键寻路1056包/160移动/32.6554格全接受。此次右键路径在停服前已经抵达，保留这一限制，不称原生途中断路验证；已排队路径/开火/搜索取消由真实Engine回归和撤guard负控支持。停服后D2秒、Dpad原生按住1.5秒、地面右键/E0.5秒、开/关背包后S2秒，AX坐标始终(25.6,-11.5)，显示等待同步/等待连接，聊天输入不可用，不误显0ms/强信号。

背包保持打开，同页自动重连同DB：首667包全部静止，键盘D2秒仍不越过面板。关闭背包后新S2秒38个移动包/7.69082格全接受；最终恢复阶段1822包（包含前667，不能重复相加）。三阶段705/1056/1822共3583包/236移动/3347静止，全接受、动作错误/拒绝/overflow0，各累计纠正1，未逐次捕获时序，不归因或称0纠正。新页面1920×1080/DPR约1，浏览器确认bundle；错误历史[]，8个慢帧全留：6起动、2后续阻塞，最大draw91ms/RAF112.2ms，未测完整P95/GPU/长期内存。在线实际有效pong偶有0ms，来自毫秒时钟粒度；只禁止未测/断开时假0ms。

最终(31.073187,-6.110207)、HP100/盾50/饱食42.1235，全部材料/背包装备/营地/节点/请求0，共享状态不变；盾0→50自然恢复、饱食正常扣减，重启前后逐字段一致、SQLite完整性/一致性backup经GameWorld恢复通过。恢复截图拍摄早于最终饱食。初审计误把按钮Help“打开背包与装备”当成弹窗仍打开，改为精确heading断言，保留初脚本/失败log，不改游戏规避。一次只读状态采集命令停服时发起、正常重起后才收终态，所存值与前检查点及后连接基线一致，不虚构其完成先后。

390×844断线状态卡x16/y281.323/w358/h81.333在屏内；视口切换首个过渡缩放帧被观察但不是最终图，既有整个手机HUD拥挤未改、不宣称手机全布局通过。三自有服务PID终态、39132无listener、临时页清空/视口恢复，正式data/sdc.sqlite未打开。公开证据docs/verification/2026-10-24-connection-readiness-results.json，完整目标保持进行中。

## 最终修正与第二份原生复测（上述690/CeH3是中间版本）

复核发现ping每3秒覆盖未应答计时会把4秒RTT低报成1秒，重复pong也把5ms改105ms；两例先红，再限制只保留一个未应答ping、有效pong后清pending。独立审查另报P2：gap与恢复若都早于下一rAF，旧搜索会绕过每帧清理。实际true→false→update(.1)回归先红（提交1次search），最终保持public inputBlocked同名接口改getter/setter，置true同步cancelPendingInput；每帧仍清防Dpad重写，App删除重复clear。没有放宽规格。

最终共26新增用例，Engine156/Network22/UI7焦点185通过，默认45文件693通过，包含全部QA脚本的最终类型检查/新构建index-nEVhS7Dn.js通过。最终负控分别只移除setter同步取消、每帧清理、低层send门禁、未应答ping保护，各对应1失败并finally原字节恢复。原Engine6/send1负控属于中间版本且原脚本保留；复跑旧控制使用同名log替换两份更早日志，最终清单只绑定现存复跑日志。data内初75来源公开草稿仅作时序存档，其可变旧路径哈希不能当成当前完整可重放归档；最终公开清单重新绑定所有实际文件。旧CeH3 bundle/index、旧Network源码另存并匹配草稿原哈希，原生a1证据明确标中间版本，不混充最终版。

最终版另起新空owned a2、同一a2存档完成真实停服/同页自动重连。第一段S1.5秒28移动包/5.95232格；停服后D1.5/Dpad0.5坐标仍4.2/5.2，小卡等待且无假延迟；背包开着重起后499包全静止，新D1秒仍不越过面板；关背包后D1.5秒28移动包/5.75662格接受。两段357/7029共7386包（56移动/7330静止）全接受、每段纠正1/error拒绝overflow0，499是7029前缀。最终浏览器帧记录绑定nEVhS7Dn、1920×1080/DPR约1，错误历史[]；9慢帧全部保留，其中4条坐标在移动，包括重连后draw62.2ms/回调63.8ms，不能归为全冷起动或宣称走动流畅。初始2条慢帧与首段移动重叠；仍未测P95/GPU/长期内存。

a2空资产/无营地/无节点/0请求与重起字段、backup恢复均通过；验证/思考空闲较长，正常酸雨/饥饿继续。末原生图是HP100/盾19/饱食0，浏览器关闭后正常身体留场使最终HP69.9925/盾0/饱食0、坐标8.279471/1.138381；位置包观察时HP全100，不把这些包当终态生命。未送食物、改位置/生命或暂停时间。五自有PID全终态、39132无监听、页清空/视口恢复；最终版无后续生产源码更改，独立复核后随授权普通推送交付。下一性能线索保留实际移动draw62.2ms，不提前归因贴图/网络或宣称全目标完成。

最终独立只读复核确认短gap搜索P2关闭，无其它P1/P2或隐私/夸大阻塞；118来源hash、最终185/693及原生计数/截图与版本界限匹配，未运行任何负载或打开SQLite。按已有授权普通推送sdh/main。
