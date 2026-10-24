export interface SlowFrame {
  atMs: number;
  updateMs: number;
  drawMs: number | null;
  rafGapMs: number | null;
  drawGapMs: number | null;
  renderStagesMs?: Record<string, number>;
  scene?: Record<string, string | number | boolean>;
}

export class FrameDiagnostics {
  private previousRaf: number | null = null;
  private previousDraw: number | null = null;
  private samples: SlowFrame[] = [];
  private totalSlowFrames = 0;
  private capture: { startAt: number; status: 'recording' | 'completed' | 'stopped'; reason: 'duration' | 'capacity' | 'interrupted' | null; count: number; observedMs: number; drew: boolean; values: Float64Array } | null = null;

  get capturing() { return this.capture?.status === 'recording'; }

  startCapture(atMs: number) {
    this.capture = { startAt: atMs, status: 'recording', reason: null, count: 0, observedMs: 0, drew: false, values: new Float64Array(16384 * 9) };
  }

  observe(rafAt: number, active: boolean, updateMs: number, drawAt: number | null, drawMs: number | null, localUpdateMoved = false, inputBlocked = false, groundMs: number | null = null, groundFlags = 0): SlowFrame | null {
    if (!active) { this.resetContinuity(); return null; }
    const rafGapMs = this.previousRaf === null ? null : Math.max(0, rafAt - this.previousRaf);
    const drawGapMs = drawAt === null || this.previousDraw === null ? null : Math.max(0, drawAt - this.previousDraw);
    this.previousRaf = rafAt;
    if (drawAt !== null) this.previousDraw = drawAt;
    const capture = this.capture;
    if (capture?.status === 'recording' && rafAt >= capture.startAt) {
      const offset = capture.count * 9;
      capture.observedMs = rafAt - capture.startAt;
      capture.values[offset] = capture.observedMs;
      capture.values[offset + 1] = updateMs;
      capture.values[offset + 2] = drawMs ?? NaN;
      capture.values[offset + 3] = capture.count === 0 ? NaN : rafGapMs ?? NaN;
      capture.values[offset + 4] = capture.drew ? drawGapMs ?? NaN : NaN;
      capture.values[offset + 5] = drawAt === null ? NaN : groundMs ?? NaN;
      capture.values[offset + 6] = localUpdateMoved ? 1 : 0;
      capture.values[offset + 7] = inputBlocked ? 1 : 0;
      capture.values[offset + 8] = drawAt === null ? 0 : groundFlags;
      if (drawAt !== null) capture.drew = true;
      capture.count++;
      if (capture.observedMs >= 60000) { capture.status = 'completed'; capture.reason = 'duration'; }
      else if (capture.count === 16384) { capture.status = 'stopped'; capture.reason = 'capacity'; }
    }
    if (updateMs <= 50 && (drawMs ?? 0) <= 50 && (rafGapMs ?? 0) <= 50 && (drawGapMs ?? 0) <= 50) return null;
    const sample: SlowFrame = { atMs: rafAt, updateMs, drawMs, rafGapMs, drawGapMs };
    this.totalSlowFrames++;
    if (this.samples.length === 20) this.samples.shift();
    this.samples.push(sample);
    return sample;
  }

  resetContinuity() {
    this.previousRaf = null; this.previousDraw = null;
    if (this.capture?.status === 'recording') { this.capture.status = 'stopped'; this.capture.reason = 'interrupted'; }
  }

  private captureSnapshot(includeRows: boolean) {
    const capture = this.capture;
    if (!capture) return null;
    const rows: (number | null)[][] = [];
    let localUpdateMovedFrames = 0, inputBlockedFrames = 0;
    for (let i = 0; i < capture.count; i++) {
      const row = Array.from(capture.values.subarray(i * 9, i * 9 + 9), value => Number.isFinite(value) ? value : null);
      rows.push(row); localUpdateMovedFrames += row[6] ?? 0; inputBlockedFrames += row[7] ?? 0;
    }
    const summarize = (column: number) => {
      const values = rows.map(row => row[column]).filter((value): value is number => value !== null).sort((a, b) => a - b);
      const percentile = (p: number) => values.length ? values[Math.ceil(p * values.length) - 1] : null;
      return { count: values.length, p50: percentile(.5), p95: percentile(.95), max: values.at(-1) ?? null, over22: values.filter(value => value > 22).length, over50: values.filter(value => value > 50).length };
    };
    return {
      status: capture.status, reason: capture.reason, requestedMs: 60000, observedMs: capture.observedMs,
      overrunMs: Math.max(0, capture.observedMs - 60000), capacity: 16384, storageBytes: capture.values.byteLength,
      firstCallbackDelayMs: rows[0]?.[0] ?? null,
      percentileMethod: 'nearest rank: sorted[ceil(p * count)-1], null timings excluded; all successful visible callbacks, not only slow frames',
      columns: ['elapsedMs', 'updateMs', 'drawMs', 'rafGapMs', 'drawGapMs', 'groundMs', 'localUpdateMoved', 'inputBlocked', 'groundFlags'],
      groundFlagBits: { full: 1, scroll: 2, texture: 4, fallback: 8 },
      localUpdateMovedFrames, inputBlockedFrames,
      metrics: { updateMs: summarize(1), drawMs: summarize(2), rafGapMs: summarize(3), drawGapMs: summarize(4), groundMs: summarize(5) },
      rowCount: capture.count, ...(includeRows ? { rows } : {}),
    };
  }

  snapshot(includeCaptureRows = true) {
    return { totalSlowFrames: this.totalSlowFrames, samples: this.samples.map(sample => ({ ...sample, ...(sample.scene ? { scene: { ...sample.scene } } : {}), ...(sample.renderStagesMs ? { renderStagesMs: { ...sample.renderStagesMs } } : {}) })), capture: this.captureSnapshot(includeCaptureRows) };
  }
}
