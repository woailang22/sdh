# 实际行走慢帧的绘制阶段归因

承接已批准的性能验收设计和持续执行授权。2afb02a已完成连接/输入正确性，但最终原生a2仍有移动时draw62.2ms/回调63.8ms，全部9慢帧含4个移动位置。旧追踪只能说明部分主线程/GPU活动重叠，不能把当前这帧归因GC、Canvas、缓存或显卡。

目前FrameDiagnostics记录整次update/draw及回调/绘制起始间隔，最多20条。Engine.render由clear/save、地面、排序队列准备、实体提交、后续覆盖层构成；地面缓存可能复用、滚动补边、贴图就绪刷新或整面重建。选择在既有本地记录中加入互不重叠的粗粒度阶段墙钟，以及该帧真实地面刷新标志。只改诊断仍不足以证明性能提升，但能对实际慢帧给出下一步可验证依据。另两方案为猜测放大缓存/降低画质或再次大体积浏览器追踪；前者缺根因，后者已有丢事件及环境差异，本阶段不采用。

Engine复用一个固定大小的阶段数值对象，每次实际render测量setup/ground/queue/entities/overlays五段；只在出现既有>50ms慢样本且本次实际draw时复制进样本。update-only慢样本不附旧render阶段，failed render继续走已有错误处理而不作为成功样本。FrameDiagnostics.snapshot深复制新增嵌套对象，仍只保留20样本，无持久上传、新UI或全帧明细堆积。阶段是JavaScript包围的墙钟，可能包含GC、调度或浏览器/驱动等待，不等于GPU时间/纯CPU或物理呈现，不能靠阶段重叠推断因果。

地面刷新元数据复用固定字段，renderMapGround每次先重置，记录真实full rebuild、pixel scrolling、texture invalidation及提交局部区域数；同一帧可同时scroll+texture。字段为当前帧，不从上次缓存重建沿用。渲染回退无2d context时如实标识，不把路径猜成成功cache复用。结构兼容原JSON，新增可选renderStagesMs及scene中primitive cache字段。额外时钟读取/赋值有成本，不能宣称零开销。

先写真实Engine.start→render/observe受控时钟回归，验证五段、总时间对应、update-only无旧值、失败不记成功；真实地面cache用例验证初建/复用/滚动/贴图同时刷新的标志。FrameDiagnostics验证深复制和20上限。先看红再实现，负控去记录/去重置/去深复制时对应失败，正常恢复后全测/类型/构建。

隔离新空owned QA普通游客，用正常搜刮食物保证生存，再实际原生跨区走动并观察新字段。地图、生命、资源、坐标、时间及服务器规则不编辑；所有采集/食用正常结算，正式data/sdc.sqlite不打开。保留冷启动/移动/面板/天气各类慢帧、真实纠正和资产持久化，旧62.2ms不因新测试未再出现而抹去。若抓到新热点，依据实测选择局部修复并另外验证；没有因果证据就不盲改画质或宣称渲染/P95/GPU/长期内存验收完成。
