# Current dense-server work diagnosis

Previous goal turn93a30da was progress: two actual northern resource targets and an earned offline-raid ledger. Its pending HTTPS push recovered this turn; ordinary push and remote SHA verified93a30da. Full game/render/memory/multiplayer economics goals remain active.

The original two-native/six-protocol a12 gate still contains one occupied-slot rejection. The withdrawn two-entry FIFO increased delay/expiry and must not be retried as a fix without new evidence. More recent player-hit projections and per-player survival commits changed server work; the old profiles are insufficient to select today's bottleneck.

Use a new owned consistent copy of the known synthetic5675-building/4000-floor/540-defense-round camp. Explicit synthetic actors start with normal rifle/vest,2000ammo and100satiety to keep this an input/server-work diagnosis, not earned growth. No building/loot/cadence/rule changes. Real server/SQLite/clock, two response-independent shooters with nominal150ms timers and100ms small valid corridor movements; add six200ms response-paced protocol shooters with small ordinary movement. All are authorized camp members; empty shots only. These are protocol roles, not browsers/native gates or actual attack/balance acceptance. Results cannot overwrite original native failure.

Capture bounded20000 method-duration events and loop delay; report overflow and fail if saturated. Keep ordinary server action/queue/checkpoint logic, inspect current move/buildingsFor/snapshot/encode/private-shot/tick/persist work. Context/JSON hooks add overhead; nested durations cannot be summed. No concurrent builds/tests/browsers/other QA during measured run. Audit actual paid shots/ammo/replay/storage/structures, then choose a production change only if supported. No realdata/sdc.sqlite access or OS/GPU/network preference changes.

- [x] Prepare new owned fixture/driver with explicit synthetic scope and capped observations; type/literal checks before running.
- [x] Run current two/eight-connection phases, inspect counts/refusals/stage/loop evidence; preserve failures and live handles correctly.
- [x] Form a specific hypothesis and isolate it before production changes. Both alternative dictionary loops were slower in this microbenchmark; retain production code. This does not establish a globally optimal loop or solve native stalls.
- [x] Audit resources/SQLite backup/restore; publish sanitized evidence and checkpoint. Independent final review and authorizedsdh/main push/remote verification are delivery steps below. Keep full objective active.

## Results and next boundary

The20.012s two-role phase acknowledged128 paid shots per actor. The30.012s eight-role phase acknowledged193 per main actor and145 per response-paced bot, zero observed errors/corrections/pending in both phases. Actual main rate is about6.4/s; nominal150ms timers do not establish a fixed offered load, and bot load falls when responses slow. Runner success means completion; the later audit separately asserts these zero-error and acknowledgement conditions. All1512 rounds reconcile, shared5675 buildings/4000 floors/540 turret rounds and other assets remain unchanged, consistent backup restores, and8 last-committed replays do not charge again.

In the eight-role phase, buildingsFor accumulated2553.1122ms/1587calls and move2380.4341ms/1444calls; snapshot1223.1242ms/143calls and encode1102.0586ms/143calls. These are hooked synchronous wall durations including nested work, scheduling/GC/SQLite/probe effects, not exclusive CPU. There are no event timestamps for attributing the65.732607ms loop maximum to a single method. Observation counts1842/8623 stayed below20000. No recorded persist/whole-world checkpoint or rollback JSON event supports assuming the old full-save bottleneck still dominates this friendly empty-fire path; private commits still use SQLite.

Five rotated400-call rounds on this fixture made Object.values and own-key for-in slower than the current Object.keys in every round. The equivalence check covers96 corridor scenarios and one inherited-key case only; it is not proof about arbitrary world queries, mutations, getters or engine behavior. No production change is justified by this trial. A spatial cache would additionally require explicit mutation/rollback invalidation because the authoritative dictionary remains mutable.

The original native a12 refusal remains unresolved. Next useful evidence is a current real-client input/presentation reproduction under documented browser conditions, rather than a bigger fire queue or another protocol-only claim of a fix. Public evidence: docs/verification/2026-10-23-dense-server-work-results.json. Raw scripts/logs/owned databases remain ignored. Final audit-inclusive type check passed; no production tests/build were repeated for this diagnostic-only delivery.

- [x] Independent final read-only review of audit,11 hashes and disclosure limits: no confirmed P1/P2. Reviewer did not run loads or open databases.
Delivery procedure: commit/push only this diagnostic documentation to sdh/main; verify remote SHA and clean tracked worktree after the commit. The final delivered SHA is reported separately because it does not exist until commit creation.
