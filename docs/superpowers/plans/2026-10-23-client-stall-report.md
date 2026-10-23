# Local client stall report implementation

**Goal:** Actual affected clients can copy a bounded, anonymous timing report from settings while the underlying intermittent stall remains under investigation.

**Files:** Add frameDiagnostics.ts and business tests; minimally integrate actual loop in IsometricEngine.ts plus engine tests; reuse report overlay in App.tsx and add settings callback/button in SettingsModal.tsx. Reuse clipboard handling, with focused fallback test. No server/persistence/game-rule change.

- [x] Fail-first recorder tests: exact50 boundary, RAF/draw/update gaps, latest20, disabled/continuity reset and snapshots.
- [x] Implement scalar fast path and engine timing; fail-first actual loop tests for durations, hidden/context/start lifecycle and anonymous report. No normal-frame allocations/storage/React notifications.
- [x] Wire settings into existing report dialog, snapshot/copy/selectable fallback, preserve fatal error precedence. Verify copy helper behavior.
- [x] Focused/full tests, effective negative controls, type/build and actual owned settings/report UI verification. No benchmark improvement claim from forced test delays.
- [x] Audit/report diagnostic runs separately including failed a2 ring trace; independent read-only review and checkpoint. Commit/pushsdh/main and remote verification performed at delivery. Keep broad goal active.

Recorder minimal stub first failed four business assertions after preserving the initial missing-module collection error. Engine integration/clipboard first failed missing behavior. Independent review found P2: rAF parameter is a frame timestamp, not actual callback entry; actual1020→1100ms with rAF1020→1036 previously reported16ms. Regression failed on16/1036, then passed on80/1100 after using one loop-entry performance.now exclusively for diagnostics. Game dt/render throttling/retry scheduling retain original time source. No remaining review P1/P2.

Final125 focused tests,43files615 full tests, type check/build passed; existing>500kB warning retained. Production assetsindex-YmyAV4oR.js/index-AS2096_h.css. Owned independent SQLite/IAB1280×720/DPR1.5 actual settings→report→copy displays已复制记录 without closing, continue closes it, old error report shows[] rather than stale performance snapshot. Screenshot and raw report ignored; sanitized verification in2026-10-23-client-stall-report-results.json. Three actual observed samples include initial loading/automation; they are not a steady-state benchmark or user reproduction. Missing/denied clipboard fallback tested; actual local clipboard succeeded. UI fatal-error precedence reviewed in source plus existing engine error recovery tests, not forced in browser. Owned tab/server closed, real save untouched.
