# 野外地形判定重复计算实施计划

> **For agentic workers:** 使用executing-plans按检查点执行，候选和最终结果用requesting-code-review独立只读复核；复用当前checkout与已授权sdh/main普通推送。正式data/sdc.sqlite禁止打开。

**Goal:** 保持地图和全部画面不变，确认并移除野外地形计算中可避免的重复遍历；若无真实Canvas收益，不交付未经证实的性能改动。

**Architecture:** ignored data下固定旧函数oracle与局部变量候选，先做全坐标语义/交替微测；两个同源Engine bundle仅替换该函数，在独立Canvas页比较同样素材、位置和像素。证据支持后生产只修改src/game/world.ts中的worldThemeAt，旧资源函数保持。

**Tech Stack:** TypeScript/Vitest/esbuild、真实Canvas和原生CUA，无DB的隔离实验页。

- [x] 阅读worldThemeAt、originalWorldThemeAt、worldLocationAt/worldIsRoad、实际地面调用及此前否定实验，保存设计与实施标准。
- [ ] 独立原型按旧优先级实现，全部整数/浮点边界与原oracle比较；固定混合样本交替完整微测，保留所有轮次。
- [ ] 独立Canvas页两个Engine共用实际已解码图像，原地/远处/地貌交界固定相机，交替新实例和冷图集，API包围墙钟与强制读回分别报告；全RGBA逐字节对照，不混为原生游戏性能。
- [ ] 若整段真实Canvas证据支持，src/game/world.test.ts先添加等价回归与确定性查询工作预算，在旧版预算红测；只改worldThemeAt，绿测/撤改负控并恢复字节。
- [ ] 完整npm test -- --maxWorkers=2、npm run lint、npm run build与新增QA类型检查；原生同实赚角色验证合法操作/诊断、保存和清理，未覆盖项目明确保留。
- [ ] 更新总计划与去凭据来源hash报告，独立只读复核后普通提交/推送并核对远端；不标完整目标完成。
