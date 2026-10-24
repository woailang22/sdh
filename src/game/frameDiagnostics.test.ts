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

describe('bounded full-frame walking capture', () => {
  it('keeps pre-existing slow-frame continuity while the new capture uses independent first gaps', () => {
    const frames=new FrameDiagnostics();frames.observe(0,true,1,0,1);(frames as any).startCapture(10);
    expect(frames.observe(100,true,1,null,null)).toMatchObject({rafGapMs:100,drawGapMs:null});
    expect(frames.observe(110,true,1,110,1)).toMatchObject({rafGapMs:10,drawGapMs:110});
    const capture=(frames.snapshot() as any).capture;
    expect(capture.rows[0].slice(0,6)).toEqual([90,1,null,null,null,null]);
    expect(capture.rows[1].slice(0,6)).toEqual([100,1,1,10,null,null]);
    expect(capture.firstCallbackDelayMs).toBe(90);
  });
  it('records ordinary frames too so a minority of stalls cannot replace the full P95 distribution', () => {
    const frames = new FrameDiagnostics(); expect((frames.snapshot() as any).capture).toBeNull();
    (frames as any).startCapture(1000);
    for(let i=0;i<=3600;i++) frames.observe(1000+i*1000/60,true,1,1000+i*1000/60,i<3500?1:70);
    const report=(frames.snapshot() as any).capture;
    expect(report.status).toBe('completed'); expect(report.reason).toBe('duration'); expect(report.rows).toHaveLength(3601);
    expect(report.metrics.drawMs).toMatchObject({count:3601,p50:1,p95:1,max:70,over50:101});
    expect(frames.snapshot().samples).toHaveLength(20); expect(frames.snapshot().samples.every(s=>s.drawMs===70)).toBe(true);
  });
  it('includes the first callback beyond60seconds rather than silently dropping a stall across the deadline', () => {
    const frames=new FrameDiagnostics();(frames as any).startCapture(1000);
    frames.observe(1000,true,1,1000,1);frames.observe(1010,true,1,1010,1);frames.observe(91000,true,2,91000,3);
    const report=(frames.snapshot() as any).capture;
    expect(report.status).toBe('completed');expect(report.observedMs).toBe(90000);expect(report.overrunMs).toBe(30000);
    expect(report.metrics.rafGapMs).toMatchObject({count:2,max:89990});expect(report.rows.at(-1)[0]).toBe(90000);
    frames.observe(92000,true,99,92000,99);expect((frames.snapshot() as any).capture.rows).toHaveLength(3);
  });
  it('stops at16384 rows without overwriting early evidence or claiming the requested duration', () => {
    const frames=new FrameDiagnostics();(frames as any).startCapture(1000);
    for(let i=0;i<16500;i++)frames.observe(1000+i,true,1,1000+i,1);
    const report=(frames.snapshot() as any).capture;
    expect(report).toMatchObject({status:'stopped',reason:'capacity',capacity:16384,storageBytes:16384*9*8});
    expect(report.rows).toHaveLength(16384);expect(report.rows[0][0]).toBe(0);expect(report.rows.at(-1)[0]).toBe(16383);
    expect(report.observedMs).toBeLessThan(60000);
  });
  it('preserves missing draw timings on update-only callbacks and detaches raw and summary snapshots', () => {
    const frames=new FrameDiagnostics();(frames as any).startCapture(1000);
    frames.observe(1000,true,1,1000,2);frames.observe(1006,true,3,null,null);
    const report=(frames.snapshot() as any).capture;
    expect(report.rows[0].slice(0,6)).toEqual([0,1,2,null,null,null]);expect(report.rows[1].slice(0,6)).toEqual([6,3,null,6,null,null]);
    expect(report.metrics.drawMs.count).toBe(1);expect(report.metrics.drawGapMs.count).toBe(0);
    report.rows[0][2]=999;report.metrics.drawMs.max=999;report.columns[0]='changed';
    expect((frames.snapshot() as any).capture.rows[0][2]).toBe(2);expect((frames.snapshot() as any).capture.metrics.drawMs.max).toBe(2);
  });
  it('marks resets and hidden callbacks interrupted, keeps old slow evidence, and starts a new independent run', () => {
    const frames=new FrameDiagnostics();frames.observe(0,true,60,0,1);(frames as any).startCapture(1000);
    frames.observe(1010,true,1,1010,1);frames.resetContinuity();frames.observe(2000,true,1,2000,1);
    expect((frames.snapshot() as any).capture).toMatchObject({status:'stopped',reason:'interrupted'});expect((frames.snapshot() as any).capture.rows).toHaveLength(1);
    (frames as any).startCapture(3000);frames.observe(3010,true,1,3010,1);frames.observe(3020,false,0,null,null);
    expect((frames.snapshot() as any).capture).toMatchObject({status:'stopped',reason:'interrupted'});expect((frames.snapshot() as any).capture.rows[0][3]).toBeNull();
    expect(frames.snapshot().totalSlowFrames).toBe(3);
  });
});
