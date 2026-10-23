# Building query enumeration performance plan

**Goal:** Reduce synchronous movement-validation work under the existing dense eight-connection gate, keeping fresh collision/visibility data, original movement/rate rules, bounded fire input and commit-before-reply.

**Evidence:** HEADaf92170 passed two-native780 paid shots but failed the later six-protocol stage with1 occupied-slot rejection per native. A separate30s eight-connection diagnosis reproduced8/4 refusals:1850 move calls total9350ms/P95~7.48ms;1994 buildingsFor calls total5938ms/P95~4.21ms. These totals overlap.144 full snapshot/encode pairs total1726/1387ms;6 persists total199ms. LoopP99~91.68ms/max155.19ms. Sample legal outbound gaps121–133ms became52–119ms at receipt. Diagnostic overhead means these are not acceptance performance numbers.

**Choice:** Keep a fresh own-key query and replace Object.values+filter with direct keyed traversal into the result. Standalone same-data500-call comparisons showed values~522–539ms and keys~286–492ms (variance retained). This changes a constant factor, not O(n). A cross-call building cache would require complete invalidation for direct dictionary edits, full rollback/replacement, door/HP changes and world overrides; defer that larger design unless measurements justify it. Do not change synchronization cadence, fire queue bounds or validation rules.

## Tasks

- [x] Fresh-query behavior regressions for new/replaced/deleted buildings, door open/destroyed collision, inherited and wrong-map records, and public override deduplication. Existing original dense failure is the fail-first performance case; avoid a test that merely demands a particular loop syntax.
- [x] Minimal implementation in GameWorld.buildingsFor only; preserve Object.keys enumeration order and world radius/public override semantics.
- [x] Full functional checks, independent review and same isolated acceptance benchmark on fresh synthetic data. Six protocol peers only after the two-native gate passes. Preserve any failure.
- [x] Separate before/after eight-connection diagnostic on equivalent fresh data to verify whether move/query work actually improved; do not run during acceptance timing.
- [x] Shared-door/restart/replay and complete asset audit, sanitized evidence and authorized push. Full goal remains active unless every game requirement is proven complete.

## Outcome

476 tests/typecheck/build passed. Query/move diagnostic totals fell5938→3491ms/9350→6005ms; loopP99 fell91.68→68.55ms, but max worsened155.19→208.54ms. The native gate passed390/390 shots each; eight-connection stage still FAILED2/1 refusals (previous1/1). This is a measured constant-factor improvement, not a concurrency fix. Shared door/restart/replay and full asset audit passed: native balances1417/1419,583/581 paid shots, all shared assets and540 defensive rounds unchanged.

The largest after trace contains4 complete baseline fallbacks at-204,-167,-131,-94ms before a delayed timer, plus12 moves/2ticks. Instrumented interval union covers158.66ms of212.91ms; the remainder is not proven GC/OS time. Next work should address these clustered full refreshes without postponing the five-second deadline or weakening immediate updates/rate bounds. Evidence: docs/verification/2026-10-23-building-query-results.json. Authorized push/remote confirmation follows the commit; full game goal stays active.
