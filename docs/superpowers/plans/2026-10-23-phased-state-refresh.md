# Phased complete-state refresh plan

**Goal:** Remove avoidable clusters of full refresh work while retaining the existing complete/delta protocol, five-second full-refresh target, immediate shared changes, two-second shared checks, authoritative action persistence and bounded fire admission.

**Evidence:** After the fresh-query improvement at926b4a6, eight-connection acceptance still failed2/1 refusals. The worst diagnostic delayed-timer window was212.91ms:4 full snapshot/encode/wire fallbacks at-204,-167,-131,-94ms,12 moves and2ticks. Instrumented union accounted for158.66ms, with remaining time unattributed. Query and average-loop improvements alone did not remove this burst.

**Choice:** Give each connection a server-owned absolute phase within the existing5000ms refresh cycle. Rotate phases by600ms across25 distinct200ms slots, preferring slots not occupied by active connections and reusing the identity phase on replacement. After capacity is exhausted, reuse slots in rotation. StateEncoder's default remains relative5000ms for existing callers. Server negotiated encoders use their connection's phase; the next full deadline is the next occurrence of that phase, always within5000ms. Earlier first refresh is the cost; subsequent deadlines remain five seconds apart without accumulating late-arrival drift. If the loop stalls, actual sends can still be late, as before; this does not promise hard real-time deadlines or capacity beyond tested connections.

**Preserved:** Full initial/map-change/recovery snapshots. Private reply fields, shared comparisons, action durability/replay, legacy complete replies, immediate door/damage/loot updates, original2s shared checks and5s disk checkpoints. Phases control complete-baseline work only. They never defer an authoritative action or changed shared list. No image/quality/input-cadence changes, no extra fire queue.

## Tasks

- [x] StateEncoder fail-first tests:8 phase streams spread full refreshes, each deadline within5000ms; full payload/decoding exact; private feedback preserved; map change/reset complete; fallback failure does not advance the deadline; default exact5000ms behavior unchanged.
- [x] Minimal StateEncoder optional phase + computed next-full deadline. Server assigns a connection phase and reuses it on negotiation/reset. No other timing policy changes.
- [x] Actual server8-socket regression with controlled encoder clock and real transport proves wiring spreads complete refreshes while all clients still receive updates; old unphased server must fail.
- [x] Independent review, full tests/typecheck/build; isolated original two-native then six-protocol acceptance on fresh dense fixture. Retain any failure and distinguish protocol peers from native browsers.
- [x] Separate same eight-connection stage diagnosis, shared-door/restart/replay and asset audit. Sanitized evidence, world-plan checkpoint, authorized push and remote/clean verification. Full game objective stays active until all requirements are proven.

## Outcome and next architecture question

479 tests/typecheck/build passed. Full-refresh unit/socket wiring tests were fail-first; adding18 identity replacements exposed a phase collision, fixed by phase reuse and free-slot preference. The2s timer regression now freezes encoder time only, and the original unconditional-private-clock-reset mutant still fails. Default relative5000ms encoding, private feedback, immediate shared changes and full map recovery remain covered.

Separate diagnostic loopP99 was68.55→68.88ms (unchanged), sampled max208.54→136.84ms. This removes a measured four-full-refresh wave, but does not prove reliable tail latency. Formal run9 FAILED3/2 refusals; final-code run10 FAILED2/1. Both two-native stages passed780 paid shots, and six protocol peers each149 successful shots. These failures are retained. Final ledger1416/1419=584/581 native paid shots, all shared/inventory/equipment/blueprint assets and540 defensive rounds unchanged; shared-door/restart/replay passed.

Five paired pre-phase samples show legal current/previous outbound gaps121–134ms but next input finds the slot occupied with approximately3–49ms planned wait left. The single-slot bound is a design choice, not the authoritative weapon interval. Next work must reassess finite input buffering and latency versus actual execution rate, rather than assume average CPU work alone can make every compressed burst fit. No FIFO expansion is implemented in this checkpoint. Evidence: docs/verification/2026-10-23-phased-state-refresh-results.json. Authorized commit/push verification follows; complete game goal remains active.
