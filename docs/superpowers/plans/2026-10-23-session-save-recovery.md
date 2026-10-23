# Session save failure recovery

Scope: make WebSocket admission and physical disconnection survive checkpoint failures without corrupting player progress or body expiry. Reuse the existing preimage journal; no new retry queue or storage format.

1. Admission: capture the player entry, player fields, newly discovered monsters and active deadline. If initialization/checkpoint fails, restore these and reject only the new socket with 1011. Keep any existing connection and private action commits. Construct the public response after the checkpoint rollback boundary.
2. Disconnection: retain the real finite disconnect deadline even if saving fails. Contain the exception at the socket close boundary and continue visibility cleanup. The existing five-second checkpoint retries persistence without calling disconnect again or extending the deadline.
3. Verify failed existing/new admissions with fail-first unit tests; protect the deliberate non-rollback disconnect behavior. Exercise actual production WebSocket replacement, private shots, SQLite rejection, periodic save and restart using only a disposable synthetic database.
4. Independently review, run the full suite/type check/build, document evidence and push to the already authorized sdh/main remote.

Limits: a permanent disk failure followed by process loss cannot preserve an uncommitted disconnect fact. This task does not claim to eliminate arbitrary post-commit snapshot/transport failures or the previously measured crowded-combat rejection.

Initial evidence: the new session unit tests fail for both existing admission modes and first admission; the disconnect deadline test already passes. Failed admission currently retains spawn relocation, discovered monsters and cleared body expiry.
