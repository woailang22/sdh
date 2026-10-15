# 坍界行者：裂隙边缘 — 策划完善方案设计稿

日期：2026-10-15
状态：已确认（用户回“认”）
目标：P0活下来 → P1打起来 → P2留得久，三期独立上线

## 0. 现状诊断（证据）

- 无存档：`server.ts:46-47` 内存 `clients Map + worldBuildings[]`，重启全清，无账号/读档。
- 死亡无惩罚：`src/game/IsometricEngine.ts` 死亡满血回 `camp_plaza` 保装备只清备弹，红区EV过高。
- 新手弱：`src/game/quests.ts:10-18` ACT1 8步纯文字无奖励字段，无强制引导/箭头。
- 经济断裂：只有NPC店 `src/components/MarketModal.tsx`，无玩家交易/税；`server.ts:111-114` 保险箱2500币有通胀风险；`storedLoot` 多为 name/icon 字符串难进背包闭环。
- 物品半成品：约117物，`src/types/game.ts:7` durability 空置；蓝图只换500币；护甲减伤只写文案未进 `ARMOR_REDUCTION`。
- 战斗浅：`src/game/combat.ts` 仅2把枪有射速/散布/暴击手感，7枪只有伤害；无PvP修正、无穿甲克制。
- 长线缺失：无日常/成就/排行/赛季/公会/私聊/邮件；音频 `src/audio/soundManager.ts` 无BGM/环境/脚步/怪吼。

在线验证：`GET /api/health` ok，onlineCount=1（2026-10-15）。

## 1. 一期：活下来（1-2周，首做）

### 1.1 持久化存档
- 架构：`server.ts` 引入 `better-sqlite3`，表 `players(id,name,level,stats,pos,updatedAt)` + `buildings(id,type,mapId,x,y,hp,ownerId,storedLootJson)`。
- 数据流：连接发 `init` 前读档；`player_sync/building_placed/raid_result` 后节流写（5s批量）；启动读档恢复 `worldBuildings` + 天气计时。DB文件：`data/sdc.sqlite`，gitignore。
- 错误处理：DB写失败只打日志不踢人；重启无DB文件则用5个种子建筑重建；DB schema版本字段 `meta(version)`，升级只做加列。
- 测试：`vitest` 加 `server persistence` 用例：建门→重启→门还在。

### 1.2 死亡惩罚
- 规则：野外（非营地3图）死亡按背包非空格数随机掉20%格（向上取整，装备栏不掉）+ 备弹全清，掉落包在死亡点生成全图可见30s（本人/他人均可捡，超时销毁）；营地死亡保装备只掉50%备弹。
- 改动点：`IsometricEngine.ts` 死亡分支 + `App.tsx grantXp/onPlayerDamage` 联动飘字。
- 测试：营地死/野外死各1例。

### 1.3 强制新手
- `quests.ts` 加 `reward: {xp,credits,items}` 字段，ACT1每步发奖。
- `QuestPanel.tsx` + 引擎加指引箭头：未做出开山镐（`pickaxeCrafted=false`）经过营地出境waypoint时弹窗提示并传送回工作台，不硬锁移动。
- 成功标准：新号30分钟完成到 kill 首杀。

### 1.4 每日回流
- 签到 + 3每日（杀10/采20/raid1次），奖励走现有 `grantXp` + `addItemToHotbar`。
- `TopMenuBar` 加红点，断线重连补发。
- 测试：跨天重置用例。

## 2. 二期：打起来（2-3周）

- 交易行：`MarketModal` 加玩家摊位页，5%税，卖单进DB；前置修 `storedLoot` 统一为 `itemId+count`。
- 宣战/悬赏：`diplomacy.ts` 加队伍白名单 + 悬赏令（赏金托管）；营地3图永中立不变。
- 组队副本：`OnlinePlayersModal` 加组队，裂隙前线2人本掉 `dark_core`。
- 耐久/维修：启用 `durability`，工作台按材料修，红区EV回落。
- 测试：交易税、悬赏发放、副本掉落各1例。

## 3. 三期：留得久（持续迭代）

- 赛季+排行（击杀/财富/raid榜）、成就称号（复用 `collection.ts` 套装逻辑）。
- 音频：`soundManager` 加BGM/环境循环/脚步/怪吼分层。
- 新Boss变体 + 掉落权重化（`maps.ts` 从必给改权重表）。
- 一/二期跑完看留存再排细项。

## 4. 非目标

- 不重写渲染管线（5866行引擎不动结构，只改分支）。
- 不做换皮/新地图大扩张，三期内只复用14图。
- 中立区规则不变：`camp_plaza/camp_workshop/camp_outskirts` 禁PvP/禁拆。

## 5. 验收口径

- 一期：重启不丢档、野外死掉东西、30分钟新手走完、次日有日常红点。
- 二期：玩家单可成交、悬赏可领取、2人本可通关。
- 三期：赛季榜有数据、BGM不断连。
