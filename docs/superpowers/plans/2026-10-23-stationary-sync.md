# Stationary synchronization implementation plan

**Goal:** Avoid repeated building scans for exact unchanged authoritative coordinates while preserving validation for every actual displacement.

**Files:** server/worldState.ts (move only); server/worldState.test.ts (business/budget/collision regressions); diagnostic/spec/checkpoint documents. Parent approved movement/security rules apply.

- [ ] Save current exact source as an ignored baseline; only adjust relative server imports for loading from data/. Keep source binding hash.
- [ ] Add failing tests: closed door at current position still permits idle aim/firing sync; displacement remains blocked until open; invalid/map/bounds rejection; idle budget cap and tiny nonzero collision; dense geometry reads remain absent only for idle.
- [ ] Run focused tests, confirm expected business failures, then wrap original geometry block with travelled>0. Keep all other move logic/order unchanged.
- [ ] Focused green and valid negative control with restored source. Independent read-only review of code, tests and limits.
- [ ] Compare old/new same-fixture cases in isolated rotated microbenchmark and current real-clock/SQLite protocol workload with explicit synthetic preparation. Capture actual input counts, action/refusal/ammo and method timing boundaries; retain failures, do not repeat rejected FIFO/cache experiments.
- [ ] Full tests, type check and build. Audit owned fixtures and restore using consistent backup; no realdata/sdc.sqlite. Complete raw/public evidence review and privacy/hash checks.
- [ ] Record final results/checkpoint, ordinary push to sdh/main and verify SHA/clean worktree after commit. Keep full game/performance goal active.
