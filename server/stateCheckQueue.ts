/** Coalesced periodic checks, yielding between connections rather than batches. */
export class StateCheckQueue<T> {
  private pending = new Set<T>();
  private timer?: ReturnType<typeof setImmediate>;
  constructor(private run: (client: T) => void) {}
  enqueue(client: T) { this.pending.add(client); this.arm(); }
  cancel(client: T) {
    this.pending.delete(client);
    if (!this.pending.size) { clearImmediate(this.timer); this.timer = undefined; }
  }
  private arm() {
    if (this.timer || !this.pending.size) return;
    this.timer = setImmediate(() => {
      this.timer = undefined;
      const next = this.pending.values().next();
      if (next.done) return;
      this.pending.delete(next.value);
      try { this.run(next.value); } finally { this.arm(); }
    });
  }
}
