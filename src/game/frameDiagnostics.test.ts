import { describe, expect, it } from 'vitest';
import { FrameDiagnostics } from './frameDiagnostics';

describe('bounded local frame diagnostics', () => {
  it('keeps exactly50ms ordinary and records longer update, draw and callback gaps separately', () => {
    const frames = new FrameDiagnostics();
    expect(frames.observe(0, true, 50, 0, 50)).toBeNull();
    expect(frames.observe(50, true, 0, 50, 0)).toBeNull();
    expect(frames.observe(100, true, 50.1, 100, 0)).toMatchObject({ updateMs: 50.1, rafGapMs: 50, drawGapMs: 50 });
    expect(frames.observe(116, true, 0, 116, 51)).toMatchObject({ drawMs: 51, rafGapMs: 16, drawGapMs: 16 });
    expect(frames.observe(180, true, 0, 180, 0)).toMatchObject({ rafGapMs: 64, drawGapMs: 64, drawMs: 0 });
  });
  it('detects draw starvation even when update-only callbacks continue normally', () => {
    const frames = new FrameDiagnostics(); frames.observe(0, true, 1, 0, 1);
    for (const time of [16, 32, 48, 64]) expect(frames.observe(time, true, 1, null, null)).toBeNull();
    expect(frames.observe(80, true, 1, 80, 1)).toMatchObject({ rafGapMs: 16, drawGapMs: 80 });
  });
  it('retains the newest20 samples and returns detached snapshots', () => {
    const frames = new FrameDiagnostics();
    for (let i = 0; i < 30; i++) frames.observe(i * 16, true, 51 + i, i * 16, 1);
    const report = frames.snapshot(); expect(report.samples).toHaveLength(20);
    expect(report.samples[0].updateMs).toBe(61); expect(report.samples.at(-1)?.updateMs).toBe(80);
    expect(report.totalSlowFrames).toBe(30);
    report.samples[0].updateMs = 999; report.samples.pop();
    expect(frames.snapshot().samples).toHaveLength(20); expect(frames.snapshot().samples[0].updateMs).toBe(61);
  });
  it('excludes background gaps and explicit continuity resets without deleting prior evidence', () => {
    const frames = new FrameDiagnostics(); frames.observe(0, true, 60, 0, 1);
    frames.observe(1000, false, 0, null, null); expect(frames.observe(2000, true, 1, 2000, 1)).toBeNull();
    frames.resetContinuity(); expect(frames.observe(4000, true, 1, 4000, 1)).toBeNull();
    expect(frames.snapshot().samples).toHaveLength(1);
  });
  it('detaches each slow sample stage record as well as its scene metadata', () => {
    const frames = new FrameDiagnostics();
    const sample = frames.observe(0, true, 1, 0, 60)! as any;
    sample.renderStagesMs = { setup: 2, ground: 50, queue: 2, entities: 4, overlays: 2 };
    const copy = frames.snapshot() as any;
    copy.samples[0].renderStagesMs.ground = 999;
    expect((frames.snapshot() as any).samples[0].renderStagesMs.ground).toBe(50);
  });
});
