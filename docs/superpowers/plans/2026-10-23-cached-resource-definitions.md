# Cached resource definition lookup plan

**Goal:** Reduce repeated world-chunk generation during actual gathering and resource renewal without changing refresh timing, rewards or persistent depletion.

**Evidence:** Previous renewal microtest includes 1000 simultaneous real definitions and takes 37.643–63.639ms per full tick. Production nodeAt still calls getWorldInteractable, which regenerates a whole chunk per ID, even for nodes in a chunk already held by server/worldQueries.ts.

**Choice:** Reuse the existing 192-entry LRU chunk cache through a shared chunk reader and expose nodeAt on createWorldQueries. Keep the existing 32-region nearby cache and immutable-definition/mutable-GameWorld-state boundary. This avoids a second cache or a new renewal scheduler/index. It does not solve the five-second O(stored nodes) scan or synchronous checkpoint cost.

- [x] Fail-first tests in server/worldQueries.test.ts: multiple IDs in one chunk generate once, nearby warm-up shares the cache, exact ID/invalid input behavior, bounded LRU eviction, and real world-state depletion/restart stay independent of cached definitions.
- [x] Extract the existing chunk reader, expose cached nodeAt, and wire production rules explicitly through createWorldQueries; remove the redundant uncached nodeAt assignment/import from server.ts.
- [x] Differential-check authored IDs over the world, repeat paired cold/warm renewal measurements against the original lookup with identical worlds, then run real production renewal/recovery integration.
- [x] Independent review, full tests/type check/build and sanitized evidence. Authorized sdh/main push follows staged review.

No new art or game mechanics. Microtest results are not FPS, a native crowded-combat pass or whole-game capacity acceptance. Remote main and working tree were clean at baseline 548b392.

## Result

Three new unit cases failed against the baseline and pass after implementation. Existing nearby-query tests remain green. Resource recovery and exploration fixtures now use the production cached rules. The production recovery fixture observes original lookup return references without changing returned values, proving reuse within its small working set. Restoring only server.ts to uncached wiring makes that integration fail even though all game-state conservation assertions pass; temporary mutation restored before final checks. This instrumented fixture is not a memory/performance measurement.

All 32525 authored resources from 4096 in-world chunks and six invalid-ID variants match the original lookup. Five alternating paired memory-DB rounds with 10000 future plus 1000 simultaneous due nodes: original cold35.595–56.101ms / second pass33.782–48.052ms,1000 chunk generations each; cached cold10.577–15.052ms,137 generations / second pass6.107–7.035ms,zero generations. Both paths include the same resource undo/full checkpoint and award identical stock. Future-only scans do not benefit; the 50000-node case still has approximately15ms ordinary samples and a29.907ms outlier. No claim of a stable hard deadline.

Final38 files /520 tests, type check and production build passed; client index-BRl8LPRa.js unchanged. Independent read-only reviews found no P1/P2. Results: docs/verification/2026-10-23-cached-resource-definitions-results.json. Synchronous full-world saves, O(stored nodes) scans, crowded combat and long-term/native performance remain separate acceptance gaps.
