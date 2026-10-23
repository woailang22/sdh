# Resource renewal implementation plan

**Goal:** Implement approved world design section 4.3: persist depletion, prevent nearby respawn and preserve unclaimed loot without changing authored density/yields/respawn durations.

**Architecture:** Resource snapshots become read-only. The existing authoritative tick checks stored depleted nodes at most every five seconds, using the same 45-unit radius as node visibility. A due empty node renews only if no active public-world player/body is within that radius; private-camp coordinates do not block it. Refreshes join the existing shared checkpoint and TickUndo rollback. No new timer, table or whole-world clone.

**Tradeoff:** A complete pass over stored node states every five seconds is simpler than maintaining a separate deadline index across all action rollbacks. Definition lookup occurs only for due empty nodes. This is not a scalability claim; measure a large saved-node pass and retain evidence before considering an index. The check can postpone renewal by up to one pass plus event-loop delay. A stopped server performs the first check after resuming; admission itself does not refill nodes.

- [x] Add failing tests in server/resourceRefresh.test.ts: snapshots/rejected attempts cannot renew; nearby players, exact boundary, offline bodies and unclaimed loot block renewal; distant/other-map roles allow renewal; restart preserves state; failed checkpoint rolls back nodes and permits same-frame retry without losing private commits.
- [x] Modify server/worldState.ts: remove lazy renewal from node(), read state directly in snapshot(), add gated resource pass to tick with preimages and clock rollback. Preserve original maxStock fallback, action costs and pickup semantics. Share the original visibility radius through src/game/world.ts and server/worldQueries.ts.
- [x] Exercise real production server/WebSocket/SQLite using authored world resources, controlled authority time for deadline boundaries, actual socket movement and actual timers; verify depletion/restart/persisted renewal/reharvest and failure containment. Do not open the real save.
- [x] Review and run all tests, type check and build. Record scope/limits. Authorized sdh/main push follows the final staged review.

No new artwork is needed: this change uses existing depleted/full node appearances. Map variety, crowded combat and long-term capacity still need their own acceptance evidence.

## Verified result and remaining boundary

Ten unit cases and one production integration pass. The initial eight unit cases failed against the old lazy renewal. A later test exposed a short-circuit bug where an expired drop skipped resource checks; fixed and covered. Removing only nearby-observer protection makes the real integration fail with stock3 instead of stock0. Two old exploration tests assumed instant camping refresh; they now preserve original 1800/3600-second minimum deadlines and payouts while requiring an unobserved server pass.

Final suite: 38 files / 517 passing tests, tsc and production build pass; client bundle remains index-BRl8LPRa.js. Read-only independent review found no P1/P2. Evidence: docs/verification/2026-10-23-resource-renewal-results.json.

Five isolated memory-DB tick samples: 10000 future nodes 2.278–5.456ms; 50000 future nodes 15.077–32.709ms; 10000 future plus 1000 real due definitions 37.643–63.639ms including checkpoint serialization. This is a known synchronous burst, not native FPS or accepted capacity. A bounded index/batch would need separate fairness, retry and save guarantees; it is not silently introduced here. Busy public areas intentionally stay depleted while observed, so spawn-area availability and route alternatives still need population/balance validation.
