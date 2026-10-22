# Survival State Commits Implementation Plan

> **For agentic workers:** Continue the approved game/world performance scope, test before implementation, independently review persistence boundaries and verify actual native behavior before push.

**Goal:** Remove complete-world writes and shared snapshot rebuilds triggered solely by hunger/regeneration/acid-shield status while retaining atomic deaths/drops, NPC state, offline defenses, shared refresh and five-second full persistence.

**Architecture:** Reuse the version3 latest-player commit table with one atomic multi-row batch for changed players. Tick keeps its boolean API and exposes a read-only shared-change flag. A pure survival tick sends negotiated player-only state; shared dirty mutations or survival updates alongside nearby NPC simulation retain full persistence. NPC movement alone retains full shared visibility without increasing disk-write frequency. Periodic2s shared checks plus5s full checkpoints remain. Legacy clients keep full replies. Failed private batches restore affected player state and do not broadcast success.

**Evidence:** HEAD54ca079 removed per-shot shared work and passed439 tests. The unchanged dense two-native gate still had39/42 cooldown refusals, while median replies8ms improved. Independent15s stage diagnosis still showed33 complete persists/P95~48ms and event-loopP99~101ms. This change attacks frequent survival-triggered full writes, without claiming it alone fixes all jitter.

**Boundaries:** New or moving nearby monsters retain the old full paths; NPC cooldown/animation state must not be silently excluded from a survival checkpoint. Conservatively preserve full behavior for hunger damage even if not lethal. Defense ammunition, traps, death inventory drops/map changes and drop expiration stay complete atomic world state. Keep existing5s full checkpoint for shared mutations created by snapshots and other unsaved movement. No new format/migration, no async early acknowledgement, no rate relaxation, no client throttling.

## Tasks

- [x] `server/db.test.ts`: batch latest rows update atomically, preserve pre-existing rows when a later upsert is rejected, then consolidate correctly with a full checkpoint. Implement narrow batch operation in SQLite and memory in `server/db.ts`.
- [x] `server/worldState.test.ts`: fail-first zero-full-serialization test for multiple players' pure survival state; restart restores status and handled guard. Batch failure restores status/time and retry charges elapsed survival once.
- [x] Add boundary tests for starvation death/drop, offline turret ammunition, drop expiration and nearby NPC progression retaining full shared state. Existing combat/acid/durability regressions remain.
- [x] `server/worldState.ts`: track affected player copies and conservative shared changes during tick. Use batch rows only if the tick is private; retain boolean return and expose shared-change result for server transport.
- [x] `server.ts`: dirty shared tick → full; pure changed tick → negotiated player state, with legacy full fallback;2s shared timer wins when due. Preserve five-second save.
- [x] Focused checks and independent static review. Forced process termination/SQLite backup recovery after a pure survival batch and later shared action; real-server periodic/legacy synchronization test.
- [x] Full tests/typecheck/build/diff; isolated same two-native benchmark on fresh5675-building fixture. Extra six protocol actors only if native zero-rejection gate passes. Record failures and remaining causes honestly.
- [x] Native shared change/restart/replay and read-only checkpoint+row ammunition/world audit, sanitized evidence and world-plan checkpoint.
- [ ] Push authorized sdh/main and verify remote/clean state. Keep broad game goal active.

## Outcome and next evidence

449 tests across30 files, production build and final typecheck passed. Added IPC widened child-process typing; explicit assertions for configured pipe streams resolved the test-only typecheck failure. Static correctness review found no remaining P1/P2. The prototype NPC-changed design was corrected before implementation so roaming alone does not add disk commits.

The unchanged two-native gate improved39/42→3/4 cooldown rejections, median7.8/8.5ms and P95~22/20ms;390/389 requests all acknowledged, no corrections/diagnostics/long tasks. It still FAILED zero-rejection acceptance, so no extra six protocol actors. Native shared door/restart/replay and read-only world audit passed:387/385 rounds paid,1613/1615 remaining, all5675 structures, storage and540 defensive rounds unchanged.

Separate15s diagnosis reduced complete persists33→3, complete snapshot/encode64→19 and loopP99~101→28ms. Two sampled rejects had legal131/121ms outbound gaps but94/83ms processing gaps, near full snapshot/encode spans and45–47ms loop lags. These samples support burst timing as the next problem; do not claim all residual errors have this cause. Details in `docs/verification/2026-10-23-survival-state-commits-results.json`.

Next design should compare reducing complete-baseline work with bounded delayed admission of early fire at the SAME actual authoritative rate. A delayed request must not execute early, acknowledge before commit, retain an unbounded queue, ignore replay/disconnect/equipment/map changes, or bypass fresh hit validation. Keep targeted combat in scope rather than accepting only the friendly empty-space benchmark. No scheduler is implemented in this checkpoint.
