# Shared simulation failure rollback

Goal: a rejected simulation checkpoint must not publish or retain uncommitted HP, ammunition, defense cooldown, drops, survival or NPC changes, and must not crash the server. Keep successful earlier/later player commits and exact retry semantics.

Evidence atc7f54d7: two fail-first tests show a rejected defense death still spends a round, respawns the target, creates a new drop and deletes an expired drop; a rejected NPC tick still damages the player, advances windup/cooldown and adds a discovered monster. The200ms server callback does not catch tick errors. Existing pure-survival rollback only restores player status after its batch path.

Chosen design: a per-tick undo journal records preimages only for affected entities and keys. Capture players before damage/survival, nearby simulated monsters before mutation, new monster/drop entries and expired drop deletions, defense ammo/timestamps/spikes HP, respawn-generation and expired-active Map entries. Restore npcTickAt on failure. Reverse undo preserves live player references and exact optional fields. Normal success keeps original private batch/full checkpoint/NPC-movement-only behavior. Never clone the whole world or thousands of untouched buildings per tick. Shared database checkpoints remain one synchronous atomic transaction; no new writer/table/protocol.

At the server loop boundary catch a failed tick, report it and return before visibility/state publication; later ticks can retry. A successful private shot between failed ticks must remain committed when a later defense tick succeeds and consolidates its row.

Alternatives: whole-world rollback copies each200ms would regress dense-camp performance; leaving mutations and merely catching the error risks later persistence of uncommitted effects. A staged immutable world would require a broader rewrite. The local undo journal is selected for the known writes in this simulation path.

Files: server/tickUndo.ts, server/worldState.ts and tests; server.ts; a production-server SQLite-trigger socket recovery regression. Documentation/evidence only otherwise.

- [x] Reproduce defense death/drop/life-context and NPC windup/new-monster corruption with a rejected checkpoint.
- [x] Implement journal coverage and server exception boundary; independent review of every simulation write found no P1/P2.
- [x] Preserve earlier private shot/handled, death drops, NPC frame clock and new-entry absence through failure/retry. Starvation, spikes, expired drops, previous accepted unsaved NPC frame and pure-player failure pass.600 untouched floor entries retain their references; failed full tick serializes the world exactly once for its attempted checkpoint, never for rollback. Existing private survival tick still serializes no full world.
- [x] Actual production server: SQLite trigger rejects only shared checkpoints after startup; health/socket remain live with no failed defense broadcast. A private empty shot commits10→9 ammo; another failed tick retains it. Removing trigger commits defense100→80HP, then next legal interval80→60, turret3→1 ammo and spikes300→280; force-kill/reload retains all and replay spends nothing. Removing the server catch actually makes the regression fail with a stopped production server; source restored.
- [x] Full501 tests/35files, typecheck/build and final independent review passed; client index-BRl8LPRa.js unchanged. Evidence recorded; authorized push is the final integration step. Controlled-clock fault recovery is not a new multiplayer performance result.

No real data/sdc.sqlite access. Original eight-connection native gate still has1 refusal. Broader game goal remains active.

The exception boundary tested here is the simulation tick only. Existing connect/disconnect and other lifecycle save-failure policies are not covered by this claim and require separate audit. The initial guard-mutation script did not match CRLF and made no changes; normalized matching then removed the guard, observed the expected stopped-server failure, and restored the exact original source.
