# Defense cooldown recovery implementation plan

**Goal:** A server restart must not grant an extra defense attack inside the existing1000ms interval. This implements the approved camp design's restart/consumption continuity; it does not expand raid rules or fix all multiplayer performance.

**Evidence:** Two fail-first tests at baseline7f0ff5c show same-time reload changes turret target HP88→76 and spikes target92→84. Ammunition/HP/durability persist, but private GameWorld.defenseAt Map is recreated empty. Existing restart tests checked inventory/body lifetime, not remaining defense cooldown.

**Chosen design:** Add server-only defenseAt Record<string,number> to the existing world checkpoint. Default absent legacy2/3 saves to empty because past attack time cannot be reconstructed. Read/write the record in the original tick, which already checkpoints real defense damage. Keep one attack per current tick after a long pause, never replay missed attacks. Do not expose metadata in client snapshots. Remove timestamps when their building is removed and discard invalid/orphan entries during load. No new database table, asynchronous writer, timer, save interval, damage or resource cost.

Alternatives: a building field would enter existing public building snapshots and shared comparisons unless separately filtered; a new table/commit path would add transaction ordering. The world-owned record reuses existing atomic checkpoints and complete action rollback.

**Files:** server/worldState.ts (state shape/load/tick/building removal), server/worldState.test.ts (cadence/legacy/privacy/removal rollback), server/persistence.test.ts (actual production-server child, forced termination, WAL/consistent backup and restart). Documentation and sanitized evidence only otherwise.

- [x] Reproduce same-time restart extra attacks for turret/spikes; tests fail on original memory Map.
- [x] Replace private Map with checkpoint metadata, retain exact1000ms boundary. Add legacy default, orphan cleanup and deletion cleanup.
- [x] Verify repeated restart,999ms/1000ms boundary, long-pause single attack, blocked attack without cooldown consumption, no client metadata, deletion rollback and retained HP/ammo/durability. Existing friendly/empty/range/body-expiry rules remain green.
- [x] Force-kill actual synthetic production server after both defenses commit, restart at same controlled authoritative time, then restore from original WAL and consistent backup; no duplicate damage/spend, next legal attack exactly once. Temporarily restoring old production code made this test fail with HP60/ammo1/spikes280 instead of80/2/290; fixed source restored and passed.
- [x] Full496 tests/34files, final typecheck and build passed; client index-BRl8LPRa.js unchanged. Independent review found no P1/P2; its invalid-ID test blind spot was corrected using a real spikes ID. Sanitized proof and world-plan checkpoint recorded. Authorized commit/push is the final integration step.

No real data/sdc.sqlite access. Controlled clocks test recovery semantics, not throughput or gameplay latency. Previous native eight-connection gate still has1 refusal; it remains a separate unresolved item. Existing shared-tick disk-failure/in-memory rollback policy is outside this cooldown change and must not be described as newly solved.
