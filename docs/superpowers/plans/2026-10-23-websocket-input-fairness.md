# Coalesced WebSocket input experiment — rejected

> **For agentic workers:** Execute with executing-plans; preserve the full approved game/map/economy scope and previous failed samples.

**Decision:** Rejected after the original formal workload failed. Production receiver settings restored to2434b0e. Exact experimental code/test/original plan archived in ignored local data. This records a failed hypothesis, not a shipped performance fix.

**Goal:** Test whether yielding between coalesced frames improves native latency without changing fire cadence/slot capacity, validation, ordering, rate limits or durability.

**Evidence and hypothesis:** Current installed ws8 receiver defaults allowSynchronousEvents=true. Its uncompressed text path loops through coalesced frames and emits multiple game message callbacks synchronously. Withfalse it uses chained setImmediate events while retaining receiver order/backpressure. Prior diagnostic captures many movement callbacks and delayed queued fire. This code proves a possible monopolizing path, not that it exclusively caused every native refusal.

**Design:** Use the installed WebSocketServer option allowSynchronousEvents:false, preserving existing path/maxPayload and all game handlers. No new application queue, sleeps, client changes, larger fire buffer or relaxed timing. Compression is not enabled on this server. The installed library's bounded stream buffering remains in charge. Existing raw/protocol clients continue to send the same messages in the same order.

**Alternatives:** Wrapping each handler in a separate independent immediate would enqueue whole batches and add connection/cancellation/memory ownership. Flushing only one timer before movement changes relative action semantics without addressing other work. Increasing shot slots or reducing client input hides the scheduling problem. Prefer the existing receiver's ordered deferred path.

- [x] Real modern/legacy server/WS/temp SQLite tests: independent pulse sees8 callbacks in one epoch before versus max1 after; accepted movement/order and original pending/replay/ammo/rate rules preserved. Fake game clocks isolate semantics, not performance.
- [x] Release real buffered old frames after real replacement admission; existing stale socket guard blocks contamination. Removing guard fails both cases; removing option fails epoch assertion. Mutations restored in finally. Actual force-kill restore covered, but not specifically an unabsorbed journal after replacement/close.
- [x] Experimental42 files/564 tests, typecheck/build and read-only review passed. Behavior checks do not qualify latency.
- [x] Separate40s diagnostic profile-a20→a21:3→0 native refusals. Original formal-a17→a18:0→21, crowded reply P95 roughly50/62→524/510ms. Startup/timing variation prevents sole causal attribution. Diagnostic cannot replace failed formal; no retry discards failure.
- [x] Formal-a18 audit: native559/556 paid rounds,1441/1444 remaining; six peers141/140/140/140/140/139 paid, final in-flight requests accounted for. All5675 buildings/540 defensive rounds/shared collections/non-ammo assets preserved. No new restart/door or ordinary-world duel for this rejected tree.
- [x] Archive rejected source/test/plan, restore only experiment production setting, remove experiment-dependent tests from final tree; retain sanitized evidence/checkpoint and recheck final tree before commit.
- [x] Rejection record prepared and reviewed for authorized sdh/main commit/push. Overall goal remains active: no new runtime improvement claimed; world/memory/siege/economy acceptance unfinished.
