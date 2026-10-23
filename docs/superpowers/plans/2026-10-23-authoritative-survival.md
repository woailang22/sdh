# Authoritative survival regression plan

**Goal:** Stop online client-only hunger/health drift when authoritative snapshots are absent, preserving offline survival and actual server consequences.

**Architecture:** Reuse callbacks.onGameAction, the same online boundary as shield and local death handling. Do not add another connection-state cache. Server state continues through existing App.applyGameState. Approved parent design already requires server authority; this is a regression repair within that scope.

**Files:** src/game/IsometricEngine.ts (survival block only), src/game/IsometricEngine.test.ts (business regression cases). Evidence/spec/checkpoint documents only otherwise. No storage/network cadence/map/balance edits.

- [x] Add six business cases: online HP1/satiety0, high-food, low-food, newly received values, offline hunger/decay and offline healing.
- [x] Focused first run: four expected online assertion failures (including HP1 becoming-24),121 passed. Raw failure retained.
- [x] Guard only satiety/health simulation; gatherCooldown remains outside.125 focused cases pass. Negative control removing guard produces four expected failures, restored in finally. First exact-LF control anchor rejected before mutation/test on CRLF file; corrected QA regex, not a successful control on that initial attempt.
- [x] Independent read-only code/test/evidence review, all37 hashes verified, no confirmed P1/P2. Reviewer did not open databases or run loads.
- [x] Full43 files/622 tests, type check and build pass; existing Vite native-config/chunk warnings retained. Newly added QA audit had two implicit-any parameters, annotated only in ignored QA file; failed log retained and final whole-project type check passed.
- [x] Actual IAB client on a new owned SQLite copy with explicit normal HP100/zero-satiety preparation (not low HP): receive state then owned server stops6s after connect. HUD100/90/0 remains after116.789s; initial stored AX is a diff omitting HP, so initial screenshot/visible AX plus later full snapshot bound that observation. Same DB resumes unedited40s then20s: actual starvation first drains vest-protected shield, then HP76/shield0/food0; after next disconnect the full AX values remain identical76.847s later. Local held movement proves updates continue, not accepted offline movement. All owned server handles terminal and tabs closed.
- [x] Original mixed run audit:2884 paid rounds, unchanged5675 buildings/4000 floors/540 defense rounds/stock and other assets, consistency/backup/core replays. Fixed fixture independently preserves all assets/handled and nine other roles' vitals; zero shots, actual normal server starvation only, backup restore passes.
- [x] Publish sanitized evidence and parent checkpoint. Keep full game/performance goal active.

Evidence: docs/verification/2026-10-23-cua-native-input-results.json and2026-10-23-authoritative-survival-results.json. Actual fixed assetindex-D-lv6nhw.js. No frame/performance acceptance: fixed-client diagnostic still includes startup draw66.9ms and callback gap111.4ms. Original a12 refusal, world/walking stalls, long memory, multiplayer siege/economy remain open. Ordinary sdh/main push and remote/clean verification follow commit creation; report that delivered SHA separately.
