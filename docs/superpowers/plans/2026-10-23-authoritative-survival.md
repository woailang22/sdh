# Authoritative survival regression plan

**Goal:** Stop online client-only hunger/health drift when authoritative snapshots are absent, preserving offline survival and actual server consequences.

**Architecture:** Reuse callbacks.onGameAction, the same online boundary as shield and local death handling. Do not add another connection-state cache. Server state continues through existing App.applyGameState. Approved parent design already requires server authority; this is a regression repair within that scope.

**Files:** src/game/IsometricEngine.ts (survival block only), src/game/IsometricEngine.test.ts (business regression cases). Evidence/spec/checkpoint documents only otherwise. No storage/network cadence/map/balance edits.

- [ ] Add failing tests with onGameAction and HP1/satiety0 over repeated update(.1); require exact HP1/satiety0, no invented death or hunger particles. Add high-food and received-new-value cases plus offline controls.
- [ ] Run `npm test -- src/game/IsometricEngine.test.ts` and retain expected business assertion failures.
- [ ] Guard only satiety/health simulation with `if (!this.callbacks.onGameAction)`. Keep gatherCooldown outside. Run focused tests and a meaningful negative control reverting the guard, restoring source in finally.
- [ ] Independent read-only code/test/evidence review; address confirmed issues.
- [ ] Run full tests, npm run lint, npm run build; inspect outputs and preserve existing build warnings.
- [ ] Actual IAB client on a new owned SQLite copy with explicit low-HP/zero-satiety preparation: receive normal state, stop owned server, inspect visible HUD twice separated by actual browser operations/time. No browser JS state mutation or cookie injection. Preserve startup failures and dispose only owned tabs/processes.
- [ ] Audit original mixed native/protocol run and fixed-client fixture separately: paid ammo, unchanged structures/stock/other assets, integrity and consistent backup restore. Clearly separate prepared synthetic changes and real actions, core replay from WS restart, measured event spans from requested held-input durations.
- [ ] Publish sanitized evidence and checkpoint, commit and ordinary push sdh/main; verify remote SHA and clean worktree. Keep full game/performance goal active.
