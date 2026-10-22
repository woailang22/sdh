# Private Shot Persistence Implementation Plan

> **For agentic workers:** Use the existing approved world/camp specification. Execute the checked tasks in order with independent persistence review before commit.

**Goal:** Remove full-world serialization/writes from accepted untargeted fire while retaining durable acknowledgement, replay protection, failure rollback, shared transaction consistency and legacy saves.

**Architecture:** Keep the complete world checkpoint for shared actions and regular ticks. Store each shooter's complete current player and bounded replay ledger together in one latest-per-player SQLite row for untargeted fire. Load those rows before startup migrations; full checkpoints atomically replace the world and clear these rows. WAL/FULL remains. Bump the internal world version to3 so older code refuses a save whose private commits it cannot recover; accept and migrate v2 after a consistent pre-migration backup based on the actual saved version. Public network formats remain unchanged.

**Tech Stack:** Existing TypeScript, better-sqlite3, Vitest and native Chrome QA harness.

## Decisions and boundaries

- Evidence: the previous three local optimizations reduced native P95 reply latency from18–35s to137–145ms, but continuous native fire still failed41/49 cooldown checks. Every accepted shot still serializes/writes~2MB.
- Selected: bounded latest-player commit plus atomic full checkpoint. This avoids a growing event log and confines the fast path to the already-proven private `perform(fire)` branch.
- Alternative: normalize every world entity into separate transactional tables. This can improve shared combat and periodic saves too, but broadens the current change considerably; defer until measurements require it.
- A shot commit contains the whole current shooter and their handled list in the same JSON row, not only ammo, so recovery cannot pair old equipment/inventory with new ammunition or lose the replay guard.
- Other players' unsaved movement is not forced to disk by a private shot; their survival ticks and all shared/economic actions retain full durable checkpoints. Existing movement acknowledgement is not a durable transaction guarantee.
- Full checkpoint write and commit-row deletion must be one transaction, including on disk errors. Never delete first or acknowledge before commit. No new async write queue, relaxed cooldown, free ammo or client fire throttling.
- Migration must preserve equipment, camps and inventories. Raw `meta` checkpoint queries exclude pending player commits until consolidation; recovery/audits must read both or use GameWorld. Older code must refuse v3 instead of ignoring commit rows. No real database may be opened for QA.

## Task1: database and recovery contract

Files: `server/db.ts`, `server/db.test.ts`, `server/worldState.ts`, `server/worldState.test.ts`, `server.ts`.

- [x] Add failing tests proving a shot writes no full camp, survives a reopen with its replay ledger, and multiple players' latest commits recover together.
- [x] Add database transaction-failure tests: full checkpoint cannot clear player commits unless checkpoint succeeds; commit write failure leaves the previous player record intact; legacy rows unchanged.
- [x] Implement three narrow DbHandle operations: list latest world-player commits, save one row, atomic full checkpoint; mirror in memory implementation.
- [x] Recover player rows before migrations; reject orphan/mismatched records rather than silently granting/removing progress; bump saved version3, accept version2 migration; back up before migration based on actual version, including an already-updated layout2 save.
- [x] Keep targeted fire and all shared actions on existing full checkpoint; route only untargeted fire through the new durable row. Update failure-injection tests to the corresponding write boundary.
- [x] Run focused database/world tests and typecheck; inspect rollback, stale-overlay and existing128-entry ledger cases.

## Task2: process death and native load

Files: `server/persistence.test.ts`, ignored uniquely named QA scripts/databases, `docs/verification/2026-10-23-private-shot-persistence-results.json`.

- [x] Force-kill a real SQLite writer immediately after acknowledged shots, verify latest rows and backup recover both ammo and replay once; then shared transfer/checkpoint, reopen and verify no stale record revives prior inventory/ammo.
- [x] Independently review persistence/migration/rollback, resolve P1/P2 before delivery.
- [x] Prepare a fresh synthetic camp copy with the same5675 structures and baseline settings; run the same isolated two-native idle/walk/fire gate. Record any failure honestly; six protocol actors run only after the native gate passes.
- [x] Verify actual shared change propagation and paid ammunition totals after shutdown/restart. Do not claim real PvP or eight native browsers from friendly empty-space fire/protocol actors.
- [x] Run full tests/typecheck/build/diff check; archive sanitized evidence, update world plan.
- [x] Commit and push to authorized sdh/main. Remote and local SHA both verified as9f89b41ca275196236422fb65ebd1792106c1284 with a clean tree at that checkpoint; broad game goal remains active.

## Outcome and next evidence

432 tests across29 files, typecheck and production build pass. The zero-rejection native gate still fails:56/52 rejections, P95 replies99/89ms (prior145/137ms), median29/29.5ms. Six protocol actors were not started. Independent review found and resolved committed-response rollback, backup-version and inherited-key validation risks. Startup failure/retry, true forced termination, backup recovery, two-native shared door changes and replayed committed request IDs were verified. See `docs/verification/2026-10-23-private-shot-persistence-results.json`.

A separate15s diagnostic paired195 native requests with server action receipts: all21 sampled rejections had outbound gaps>=120ms but receipt/processing gaps38–99ms. This proves endpoint timing compression, not whether it originates in socket queues or event-loop blockage. Next investigate event-loop delay, snapshot/encoding cost and periodic checkpoints, then design cadence handling that preserves the authoritative sustained rate. Do not mark the full game goal or the zero-error performance gate complete.
