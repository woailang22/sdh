export interface SlowFrame {
  atMs: number;
  updateMs: number;
  drawMs: number | null;
  rafGapMs: number | null;
  drawGapMs: number | null;
  scene?: Record<string, string | number | boolean>;
}

export class FrameDiagnostics {
  private previousRaf: number | null = null;
  private previousDraw: number | null = null;
  private samples: SlowFrame[] = [];
  private totalSlowFrames = 0;

  observe(rafAt: number, active: boolean, updateMs: number, drawAt: number | null, drawMs: number | null): SlowFrame | null {
    if (!active) { this.resetContinuity(); return null; }
    const rafGapMs = this.previousRaf === null ? null : Math.max(0, rafAt - this.previousRaf);
    const drawGapMs = drawAt === null || this.previousDraw === null ? null : Math.max(0, drawAt - this.previousDraw);
    this.previousRaf = rafAt;
    if (drawAt !== null) this.previousDraw = drawAt;
    if (updateMs <= 50 && (drawMs ?? 0) <= 50 && (rafGapMs ?? 0) <= 50 && (drawGapMs ?? 0) <= 50) return null;
    const sample: SlowFrame = { atMs: rafAt, updateMs, drawMs, rafGapMs, drawGapMs };
    this.totalSlowFrames++;
    if (this.samples.length === 20) this.samples.shift();
    this.samples.push(sample);
    return sample;
  }

  resetContinuity() { this.previousRaf = null; this.previousDraw = null; }

  snapshot() {
    return { totalSlowFrames: this.totalSlowFrames, samples: this.samples.map(sample => ({ ...sample, ...(sample.scene ? { scene: { ...sample.scene } } : {}) })) };
  }
}
