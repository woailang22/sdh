# 早期口粮提示实施计划

> 执行方式：本会话按 executing-plans 顺序完成，并按 requesting-code-review 进行独立只读复核。

**Goal:** 修复新玩家低饱食时缺少可执行补给指引的问题，保持生存规则和物资成本。

**Architecture:** CharacterHUD根据已有stats显示补给文字，通过可选onOpenInventory回调调用已有背包弹窗；App木材引导补全真实农舍位置与食用步骤。React/TypeScript/Vitest，不增加依赖或服务端逻辑。

- [ ] 在 `src/components/CharacterHUD.test.tsx` 用实际SSR输出断言100/20.001无提示、20/1有低饱食提示、0说明真实伤害、死亡不提示、回调缺席无无效按钮、不同maxSatiety按比例判断。先运行确认断言失败。
- [ ] 在 `src/components/CharacterHUD.tsx` 增加可选回调；仅alive且satietyRatio<=.2显示静态role=status区，饥饿与低饱食文字区分，按钮使用已有App inventory入口。App木材引导说明两座已有农舍位置、南门和E/F→背包使用。修改不改变完成标记/奖励/规则。
- [ ] 通过定向测试、全测试、类型检查、生产构建；负控删除提示时业务断言应失败，finally恢复源码。
- [ ] 当前同一owned存档一致性备份后重启真实客户端，截图低饱食提示与点击背包后的界面；不喂给物资、不重置生命、不以无探针FPS声称优化。关闭所属页面/进程。
- [ ] 审计实际路线/存档/恢复与资源；发布去凭据证据，独立只读复核；普通提交推送已授权sdh/main并核对远端SHA。
