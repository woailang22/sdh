# 营地作物状态可读性实施计划

> **For agentic workers:** 按executing-plans实施此已批准大设计内的小项；test-driven-development先红后绿，requesting-code-review最终独立只读复核。沿用当前checkout和已授权sdh/main普通推送；不访问正式data/sdc.sqlite。

**Goal:** 玩家靠近营地种植田即可从形态和提示识别未播种、生长、成熟、损坏，并保留真实生产规则。

**Architecture:** 新增小型farmRenderer.ts，复用现有BuildingEntity.production与ITEM_DEFS；Engine的farm_plot分支画等距形态，现有renderInteractionHUD牌第三行显示状态，避免实体阶段的文字被人物或交互牌覆盖。绘图读取Date.now，不增加timer/图片/缓存/网络；授权/耗料/成熟/领取仍原服务器处理。

**Tech Stack:** Canvas2D、TypeScript、现有Vitest、原生CUA、独立owned earned QA SQLite与被动观察器。

- [x] 检查已批准设计、上轮真实截图、Engine分支、服务器DTO授权和领取路径、既有绘图测试；证实当前readyAt不影响绘图，根因在客户端表现。
- [x] 在src/game/IsometricEngine.test.ts用真实drawBuilding/HUD入口补边界、领取清田、损坏/权限/距离与不改任务/请求的回归，原实现5红；后补最近目标/作物名2红、HUD遮挡1红、完整人物层级与牌内状态2红，最终10新项/聚焦182通过。首版fixture漏radialGradient及测试production字段未按可选类型声明的失败日志保留并修正。
- [x] 新增src/game/farmRenderer.ts，接入Engine农田绘图及已有HUD牌状态行，保留其他设施/阴影/生命条/排序；撤回Engine接线负控8红174绿并原字节恢复。最初原生截图确认文字被交互牌挡住，后移到田下又在真实东南站位(5.1,27.0)被人物挡住，均保留；最终改HUD层，不能将这两个中间版本当最终成功。
- [x] 最终完整45文件732项、全部QA类型检查、生产构建CDVz-sSl通过；旧730/731与fixture错误/错误负控runner/遮挡失败均保留。HUD底色最后只将获授权田状态牌改为不透明，最终732再次通过；旧其他建筑牌不变。
- [x] 上轮已停的真实QA存档一致备份39139，同一角色正常离营获得3木2废、返回付2木2废1种播种，原生见空田/幼苗/60秒生长提示/成熟植株和4份领取/领取后清田。生长60秒和最早成熟截图在sRvRlhzj，不透明底色微调后的CDVz-sSl再实际东南站位验证成熟/领取/清田；没有用已成熟任务伪装成最后构建重新播种。首次重进CDVz的north截图为早期纯背景，后续原生画面正常，首图原因未单独确认，不据此声称黑屏问题修复。损坏/其他作物/成员/距离由回归覆盖，不冒充原生全覆盖。
- [x] 正常收支、请求/存档/backup恢复审计通过；最终页错误[]/6慢帧完整保留，不作性能验收。自有45696终态/39139释放、页与视口清理；独立只读源及88来源证据复核无P1/P2，公开脱敏报告，按授权路径普通推送核对。全目标保持进行。

本轮为种植经营的可读性完善，保留上一轮全部失败与证据。种子再供给、工作台/仓库/防御衔接、完整地图/长期经济/冷地面/连续60秒/GPU/内存仍属于总目标，不因局部完成而删去。

收支核对发现独立既有规则缺陷：pickaxe_stone被未锚定/axe_stone|stone_axe/命中，实际一次gather得3木，与开山镐“伐木无加成”描述不符。当前3木为正常原生请求实际发放，不修改历史资产；此显示改动未修改equipmentRules，后续独立修复该匹配与服务端工具收益回归，不把这一结果当作工具平衡正确的证据。
