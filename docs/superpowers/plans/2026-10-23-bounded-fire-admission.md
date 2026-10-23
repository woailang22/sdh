# Bounded Fire Admission Implementation Plan

> **For agentic workers:** Continue the approved game performance/combat scope; use fail-first business tests and an independent lifecycle/rate/durability review before delivery.

**Goal:** Stop legitimate compressed fire receipts being refused, without faster actual damage, weaker validation, unlimited input buffering or acknowledgement before durable commit.

**Evidence:** HEAD24036f2 improved the same two-native dense gate to3/4 refusals and replyP95~20–22ms, but it still fails. Separate samples paired legal131/121ms outbound gaps with94/83ms processing gaps near full-baseline work/45–47ms loop pauses. Further reducing baseline work helps CPU but cannot remove arbitrary network jitter; compare against a bounded waiting slot instead of enlarging instant-fire grace.

**Architecture:** One pending fire per connection, with planned delay at most one authoritative weapon interval, using a monotonic queue deadline. Event-loop blockage can still delay actual execution beyond that deadline. Flush an already-due slot before processing another game action, then calculate a fresh server-owned fire window. Existing20ms debt/timing validator remains unchanged; ready/replayed/invalid actions use the normal path. A duplicate pending ID waits for the original result; another new fire while the slot is occupied receives an error. Both targeted and untargeted fire use this admission, then existing validation/persistence/reply/broadcast paths.

**Lifecycle:** Context is server-owned map+weapon value+ephemeral respawn generation. Check pending contexts after every immediate action and simulation tick, so switching away and back cannot revive old input. Recheck context and connection ownership at execution; otherwise report cancellation without spending or marking handled. Death generation must roll back when a shared action's commit fails; timers/generation are not durable across a process restart. Fresh GameWorld.action checks ammo, target availability, range, walls, friendliness and cooldown at execution. Close/replacement cancels pending timers. Catch timer callback errors through the same safe execution boundary as incoming actions; post-commit reply failure must not undo data.

**Limits and choices:** No queue beyond one slot, no client timestamps, no extra rate grace, no firing early to catch up. A delayed shot can be invalidated by later equipment/map/life changes; it is not a cached hit. Other actions remain immediate, with due shots drained first. Input that has not committed is not promised after disconnect/restart. Keep original rate limits and new-request replay guards,2s/5s state synchronization and all durable transaction paths.

## Tasks

- [x] `server/fireQueue.test.ts`: monotonic waiting, no early execution, single slot, due flush, callback error clears slot, cancellation and maximum wait. Implement minimal `server/fireQueue.ts`.
- [x] `server/worldState.test.ts`: server-owned fire window for rifle/crude/default intervals, invalid/replayed requests bypass, live map/weapon/death context, failed death persistence restores generation. Implement narrow helpers and ephemeral generation in `server/worldState.ts`; keep validator interval source shared.
- [x] `server.ts`: extract existing action execution unchanged, add guarded admission and cancellation feedback, cancel on close/replacement. No timer should run stale client actions or throw uncaught.
- [x] End-to-end real server socket tests: compressed legitimate targeted/untargeted shots execute at normal interval, no acknowledgement/spend before due, duplicate once, extra new requests bounded, live hit revalidation, replacement/disconnect and context cancellation. Verify legacy and negotiated replies.
- [x] Forced termination/reopen test proves only committed queued shots survive and replay once; pending ones grant nothing. Independent review and full tests/typecheck/build/diff.
- [x] Original isolated two-native60s benchmark on fresh5675-building copy, original client input cadence/quality. Extra6 protocol actors only after native zero-error gate passes; do not call protocol peers native browsers. Record all failures honestly and verify shared updates, restart/replay, paid ammo and no asset changes.
- [ ] Sanitized evidence/world-plan checkpoint, authorized commit/push sdh/main and remote/clean verification. Full game goal stays active unless its entire scope is proven complete.

## Outcome and limits

Implemented the single pending slot for both targeted and untargeted fire, preserving the original timing validator and durable action/replay paths. Independent review added immediate context cancellation after actions/ticks, plus first-input request-ID reservation across action types. Death generation rolls back with failed shared actions. A timer-side reply failure is caught without undoing its commit.

32 files /474 tests, typecheck and production build passed. The13 real-server socket/SQLite tests explicitly control clocks for deterministic lifecycle assertions; queue unit tests separately cover monotonic deadlines, and the native benchmark retains actual clocks. Client bundle stays `index-Ci3C41xg.js`.

The original5675-building benchmark passed its two-native60-second zero-refusal gate:390/390 shots per browser,780 real paid rounds, no pending actions, position corrections, diagnostics or long tasks. Reply P95 was35.3/26.7ms versus22.4/20.3ms before; correct waiting can increase reply latency and this is not a latency improvement claim.

The later30-second two-native plus six-protocol stage FAILED: each native sent192 actions,191 committed and1 was refused because the slot was occupied. Native reply P95 rose to116.9/127.1ms. No render errors/corrections/long tasks; protocol actors had no errors, with3 final replies still in flight at phase sampling. Final durable audit found149/149/149/148/148/148 protocol rounds spent. Do not call the full benchmark passed or these six peers native browsers.

Read-only audit merged8 player commit rows and confirmed5675 buildings,540 defensive rounds and all shared collections/inventory/equipment/blueprints unchanged; native balances1419/1419 equal581 successful shots each across both phases. Same database native restart/shared-door/replay checks passed and preserved those balances. Final guard for a changed-action duplicate was added after timing; it affects duplicate IDs only, and final code passed the full checks and native shared/restart verification without repeating the benchmark to discard failure.

Evidence: `docs/verification/2026-10-23-bounded-fire-admission-results.json`. Remaining eight-connection bursts require a separate diagnosis of shared baseline/encoding/checkpoint and loop work; these are hypotheses, not a proven root cause in this run. Preserve the one-slot/rate bounds and original native cadence. Full game goal remains active.
