import type { GameStateSnapshot, PlayerActionSnapshot } from '../../server/worldState';

const LISTS = ['camps', 'buildings', 'nodes', 'drops', 'monsters', 'reports'] as const;
export const FULL_STATE_REFRESH_MS = 5000;
type ListKey = typeof LISTS[number];
type LiveState = Pick<GameStateSnapshot, 'player' | 'correction' | 'requestId' | 'error' | 'loot'>;
export interface StatePatch {
  version: 1;
  sequence: number;
  baseSequence: number | null;
  state: LiveState & Partial<Pick<GameStateSnapshot, ListKey>>;
}

/** One bounded comparison set per connection; no world history is retained. */
export class StateEncoder {
  private sequence = 0;
  private mapId = '';
  private nextFullAt = -Infinity;
  private lists = new Map<ListKey, string>();
  private wireLists = new WeakMap<StatePatch, Map<string, { value: unknown; json: string }>>();
  constructor(private readonly fullPhaseMs?: number) {}

  encodePlayer(snapshot: PlayerActionSnapshot, fullSnapshot: () => GameStateSnapshot, now = Date.now()): StatePatch {
    if (!this.sequence || snapshot.player.mapId !== this.mapId || now >= this.nextFullAt) return this.encode(fullSnapshot(), now);
    // Private feedback advances only the stream. Keep shared comparisons and
    // their baseline time intact for the next shared update/full refresh.
    const baseSequence = this.sequence++;
    return { version: 1, sequence: this.sequence, baseSequence, state: snapshot };
  }

  encode(snapshot: GameStateSnapshot, now = Date.now()): StatePatch {
    const full = !this.sequence || snapshot.player.mapId !== this.mapId || now >= this.nextFullAt;
    const { player, correction, requestId, error, loot } = snapshot;
    const state: StatePatch['state'] = { player, correction, requestId, error, loot };
    const wireLists = new Map<string, { value: unknown; json: string }>();
    for (const key of LISTS) {
      const encoded = JSON.stringify(snapshot[key]);
      if (full || this.lists.get(key) !== encoded) {
        Object.assign(state, { [key]: snapshot[key] });
        wireLists.set(key, { value: snapshot[key], json: encoded });
      }
      this.lists.set(key, encoded);
    }
    const baseSequence = full ? null : this.sequence;
    this.sequence++;
    this.mapId = player.mapId;
    if (full) {
      const wait = this.fullPhaseMs === undefined ? FULL_STATE_REFRESH_MS
        : (this.fullPhaseMs - now % FULL_STATE_REFRESH_MS + FULL_STATE_REFRESH_MS) % FULL_STATE_REFRESH_MS || FULL_STATE_REFRESH_MS;
      this.nextFullAt = now + wait;
    }
    const patch: StatePatch = { version: 1, sequence: this.sequence, baseSequence, state };
    this.wireLists.set(patch, wireLists);
    return patch;
  }

  /** Send immediately after encoding; do not mutate an encoded list in place. */
  serialize(patch: StatePatch): string {
    const lists = this.wireLists.get(patch);
    if (!lists) return JSON.stringify(patch);
    const fields: string[] = [];
    for (const [key, value] of Object.entries(patch.state)) {
      const cached = lists.get(key);
      const json = cached && cached.value === value ? cached.json : JSON.stringify(value);
      if (json !== undefined) fields.push(JSON.stringify(key) + ':' + json);
    }
    return JSON.stringify({ ...patch, state: undefined }).slice(0, -1) + ',"state":{' + fields.join(',') + '}}';
  }
}

/** Reconstructs the existing complete game snapshot at the network boundary. */
export class StateDecoder {
  private sequence = 0;
  private snapshot: GameStateSnapshot | null = null;

  reset() { this.sequence = 0; this.snapshot = null; }

  decode(patch: StatePatch): GameStateSnapshot | undefined {
    if (patch?.version !== 1 || !Number.isSafeInteger(patch.sequence) || patch.sequence <= 0 || !patch.state?.player) return;
    if (patch.baseSequence === null) {
      if (LISTS.some(key => !Array.isArray(patch.state[key]))) return;
      this.snapshot = patch.state as GameStateSnapshot;
    } else {
      if (!this.snapshot || patch.baseSequence !== this.sequence || patch.sequence !== this.sequence + 1
        || patch.state.player.id !== this.snapshot.player.id || patch.state.player.mapId !== this.snapshot.player.mapId) return;
      // Action feedback is single-use. Missing error/loot/requestId must clear it.
      const { requestId: _request, error: _error, loot: _loot, ...previous } = this.snapshot;
      this.snapshot = { ...previous, ...patch.state };
    }
    this.sequence = patch.sequence;
    return this.snapshot;
  }
}
