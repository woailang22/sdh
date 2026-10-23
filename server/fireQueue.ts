interface PendingFire {
  requestId: string;
  context: string;
  due: number;
  execute: () => void;
  timer?: ReturnType<typeof setTimeout>;
}

/** One connection-owned input slot; deadlines do not follow wall-clock changes. */
export class FireQueue {
  private pending?: PendingFire;
  constructor(private now: () => number = () => performance.now()) {}
  get requestId() { return this.pending?.requestId; }
  get context() { return this.pending?.context; }

  schedule(input: { requestId: string; context: string; delayMs: number; maxDelayMs: number; execute: () => void }) {
    if (this.pending || !Number.isFinite(input.delayMs) || !Number.isFinite(input.maxDelayMs) || input.delayMs <= 0 || input.delayMs > input.maxDelayMs) return false;
    const pending = { requestId: input.requestId, context: input.context, due: this.now() + input.delayMs, execute: input.execute };
    this.pending = pending; this.arm(pending); return true;
  }
  private arm(pending: PendingFire) {
    pending.timer = setTimeout(() => {
      if (this.pending !== pending) return;
      if (!this.flushDue()) this.arm(pending);
    }, Math.max(1, Math.ceil(pending.due - this.now())));
  }
  flushDue() {
    const pending = this.pending;
    if (!pending || this.now() < pending.due) return false;
    this.cancel(); pending.execute(); return true;
  }
  cancel() {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = undefined;
  }
}
