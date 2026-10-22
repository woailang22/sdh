# Private Action State Patches Implementation Plan

> **For agentic workers:** Follow the existing approved game/world performance scope. Execute focused tests before implementation and obtain an independent correctness review before push.

**Goal:** Avoid rebuilding/serializing thousands of unchanged shared entities for every untargeted shot acknowledgement, while retaining durable commits, replay/error feedback, full synchronization and authoritative cadence.

**Architecture:** Add a detached player-only action result using the same transaction implementation. Extend the negotiated StateEncoder with a live-only patch that uses its existing sequence/baseline; when a baseline is missing, expired, or from another map, construct a complete snapshot instead. Only the server-selected untargeted fire path may use this. Shared mutations/targeted fire, old clients and periodic synchronization keep full snapshots. No new retained world cache or protocol version.

**Evidence:** Prior private persistence turn9f89b41 passed432 tests but dense native fire failed56/52 cooldown requests. A new isolated15s diagnostic measured256 snapshot calls P95~13.9ms and256 encode calls P95~13.5ms,33 full persists P95~46.7ms, event-loop P99~168.8ms/max209.5ms. Inclusive spans overlap. This change addresses needless per-shot shared work, not periodic persistence or all jitter.

**Alternatives:** Immutable revision caching would require correctly invalidating every building, production, permission and movement change; broader persistence normalization/off-thread writes affects transaction ordering. Use the existing delta protocol's live-state mechanism first, without weakening the snapshot/recovery contract for actual shared changes.

## Tasks

- [x] `src/game/stateSync.test.ts`: fail-first tests for player-only delta reconstruction, one-use feedback clearing, complete fallback on first/expired/map-changing baseline, preservation of shared changes between private replies, and no shared-list serialization on the private delta.
- [x] `server/worldState.test.ts`: player-only action uses the same durable transaction, ammo/replay/error/rollback semantics, detached mutable player data; shared entity snapshot construction is not invoked. Non-private action rejected by this entry point.
- [x] `server/worldState.ts`: extract existing player-view assembly; share action transaction through a typed reply callback. Keep old action return and full snapshot behavior unchanged. New restricted entry point returns only player/correction/request/error/loot.
- [x] `src/game/stateSync.ts`: player-only patch using current baseline/sequence and complete fallback callback; no client-provided trust flag.
- [x] `server.ts`: use private reply only for negotiated untargeted fire. Actor request is durably committed once; full fallback builds snapshot without running the action again. Keep legacy and all shared broadcasts as before.
- [x] Run focused tests/typecheck, independent review, full suite/build/diff. Preserve post-commit response-failure fix.
- [x] Run isolated same two-native60s benchmark on fresh5675-building copy, without other QA/build/test/profiling. Extra six protocol actors only after the zero-rejection native gate passes. Record failure honestly if any.
- [x] Follow up shared door changes, restart/replay and ammunition/world audit in the same final QA world. Archive sanitized evidence and remaining bottlenecks.
- [ ] Push authorized sdh/main and verify remote state. Keep full game goal active unless all its requirements are achieved.

## Outcome

439 tests across30 files, typecheck and production build pass; client bundle unchanged. Independent static review found no remaining P1/P2. A real-server integration test with survival ticks intentionally disabled proves that private fire does not postpone two-second shared checks, door broadcasts reach peers, and legacy peers retain full replies. Deliberately refreshing the shared-check clock on private deltas made this regression fail; restoring the guard made it pass.

The unchanged two-native gate still failed39/42 cooldown requests, with every390/389 request acknowledged. Reply median8/8.6ms and P95~68/74ms improved from29/29.5ms and99/89ms, but this does not establish acceptable continuous fire. No extra six protocol actors were started. Native restart/door/replay and read-only full-world+commit-row audit passed; actual351/347 rounds were consumed, storage and all5675 structures remain unchanged.

Separate15s diagnostics reduced full snapshot/encode counts256→64; private assembly P95~0.197ms, encodePlayer P95~0.0083ms. Remaining full persist P95~48ms and event-loop P99~101ms require further work. Instrumentation wrapper type errors in the ignored QA folder were corrected with explicit method/this annotations, and final typecheck passed; no production change or benchmark restart was used for that correction. See `docs/verification/2026-10-23-private-action-state-patches-results.json`.
