# Stationary synchronization implementation plan

**Goal:** Avoid repeated building scans for exact unchanged authoritative coordinates while preserving validation for every actual displacement.

**Files:** server/worldState.ts (move only); server/worldState.test.ts (business/budget/collision regressions); diagnostic/spec/checkpoint documents. Parent approved movement/security rules apply.

- [x] Save e296463 exact source as ignored baseline; only relative server imports adjusted. Audit compares reverse-adjusted bytes/hash and normalized source to that actual Git revision.
- [x] Initial9 business cases:3 expected red/145 pass, then148 focused green. Add3 invalid-source-coordinate cases, all fail on draft travelled>0; final direct X/Y inequality restores old rejection,151 focused green.
- [x] Original geometry block now runs unless both actual coordinates strictly match; all other move logic/order remains. No epsilon exemptions/cache/queue/client-send/rules changes.
- [x] Valid negative control on draft and final each produces3 expected business failures; source restored in finally. Independent static review finds no confirmed P1/P2.
- [x] Isolated rotated microbenchmarks and actual real-clock/SQLite protocol before/draft-after/return-before/final-after-exact, each20s two idle,30s mixed,20s all moving. All events bounded, recorded moves accepted and error/correction/pending0; final skips exactly stationary query counts. Preserve asymmetric micro and rerun with both own-instance methods after review identified shape difference. Balanced final all-moving still4/5 slower5–18%; no claim moving regression excluded, or overall performance accepted.
- [x] Final43files634 tests/type/build pass. Initial concurrent build+suite had tickRecovery server-start timeout before WS input; isolated case and independent full suite pass, no threshold changes or precise-cause claim. Initial micro clock/audit absent-actor/type-path QA failures retained and fixed only in QA. Four owned fixtures total9392 paid rounds,5675buildings/4000floors/540defense rounds and other assets unchanged, integrity/consistent backup restore plus8 core replays each pass. No realdata/sdc.sqlite.
- [x] Sanitized evidence in docs/verification/2026-10-23-stationary-sync-results.json and parent checkpoint. Full objective remains active.

Independent final data/hash/privacy review completed:50 hashes and all12 phases match, no confirmed P1/P2 blocking this local idle-work reduction. Reviewer did not open DBs or run loads. Ordinary sdh/main delivery follows commit creation; report delivered SHA separately. No native/physical presentation/GPU/long-memory/earned-economy or multicamp siege acceptance. Final protocol all-moving loopmax95.354879ms remains a failure signal for broad smoothness, despite zero protocol rejections. Keep this limitation and unresolved micro moving-cost risk explicit.
