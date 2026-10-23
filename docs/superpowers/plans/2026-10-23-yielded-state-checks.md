# Yield periodic shared checks between connections

Goal: reduce synchronous work bursts without increasing input buffering or weakening freshness, durability or hit validation. The two-input FIFO experiment failed the unchanged eight-connection gate and was withdrawn; original one-slot admission remains.

Evidence: profilea10 still spent6809ms in1855 moves, including3888ms in fresh building queries, and2967ms in146 snapshot/encode pairs over30s. The200ms server loop performs every due2s shared check in the same callback, independently of5s full-refresh phases. Sight testing computes center distances even for4000 nonblocking floors. Times overlap; these are diagnostic samples, not independent CPU totals.

Selected changes:

- Queue only periodic2s shared checks in a connection-owned Set and execute one per chained setImmediate, allowing timers/network between callbacks. Do not schedule all callbacks at once. Coalesce duplicates; remove disconnected/replaced clients. At execution recheck connection ownership and whether a more recent full/shared snapshot already satisfied the check; build a fresh snapshot then. The2s threshold remains, but backlog/event-loop work can delay actual delivery; no hard deadline promise.
- Shared action broadcasts and dirty shared simulation ticks stay immediate. Pure survival/live state still sends immediately while a periodic check is pending. Existing5s baseline phases and durable checkpoint behavior remain.
- In hasLineOfSight, reject nonblocking building bounds before distance work; optionally reject bounds outside the segment's bounding rectangle before exact intersection. Keep center/ignored-ID exceptions, strict edge behavior, facing/wide doors, dead/open/floor rules and malformed point rejection. No spatial cache or mutation tracking.

Proof:

- [x] Queue unit tests: one immediate callback at a time, FIFO/coalescing/cancel/replacement/error continuation and fresh callback state.
- [x] Real server eight-socket test observes each periodic snapshot on a different independent immediate-heartbeat epoch; original synchronous loop failed8-at-once. A wrong implementation queuing every callback independently also failed7-at-once. Restored correct chain passed. Existing2s/private-fire, door broadcast, legacy, full phase and fire durability regressions remain.
- [x] Collision/sight regression and10000 deterministic old/new differential cases agree. Five3000-operation rounds compare old/new separately from native timing; operation cost fell roughly two thirds, not a frame-rate claim.
- [x] Full490 tests/34files, typecheck/build and independent review passed. Fresh a12 native gate still FAILS: two-native780/780 success, eight-connection native1/0 refusals. Exact resources/shared-door/restart/replay passed; all failed samples retained.
- [x] Evidence recorded in docs/verification/2026-10-23-yielded-state-checks-results.json. Broader game goal remains active. Authorized push is the final integration step.
