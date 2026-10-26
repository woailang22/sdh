import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
import { writeFileSync, readFileSync } from 'node:fs';
import { validateReport } from './qa-ground-profile.mjs';
const built = await build({ entryPoints: ['scripts/qa-ground-profile.browser.ts'], bundle: true, format: 'iife', platform: 'browser', write: false, plugins: [{ name: 'explicit-synthetic-engine', setup(builder) {
  if (process.argv.includes('--fault-timestamp')) builder.onLoad({ filter: /qa-ground-profile\.browser\.ts$/ }, () => { const original = readFileSync('scripts/qa-ground-profile.browser.ts', 'utf8'); assert.equal(original.split('callbackAt: performance.now()').length, 2); return { contents: original.replace('callbackAt: performance.now()', 'callbackAt: rafAt'), loader: 'ts' }; });
  builder.onResolve({ filter: /IsometricEngine$/ }, () => ({ path: 'fake-engine', namespace: 'synthetic' }));
  builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: `export class IsometricEngine {
    constructor(canvas) { state.constructed++; this.ctx=canvas.getContext('2d'); this.camera={x:0,y:0}; this.artImages=new Map(); this.surface=makeCanvas(); this.overlay=makeCanvas(); }
    warpToMap() {} dispose() { state.disposed++; }
    renderMapGroundUncached() {} renderGroundDetails() {}
    renderMapGround() { this.surface.width=2176; this.surface.height=1336; this.groundCache={canvas:this.surface,overlay:this.overlay,x:this.camera.x,y:this.camera.y}; this.groundFrame={full:false,scroll:true,fallback:false,texture:false,regions:1}; this.renderMapGroundUncached(false,{width:129,height:1336}); this.renderGroundDetails();
      if(state.raf===960) { if(state.mode==='main-loss') this.contextLost=true; if(state.mode==='cache-loss') this.surface.lost=true; if(state.mode==='overlay-loss') this.overlay.lost=true; }
    }
  }` }));
} }] });
const binding = { runId: 'synthetic-orchestration-only', fingerprint: 'synthetic-source-only' };
const summaries = [];
for (const mode of ['normal', 'longtask-queue', 'hidden', 'override', 'main-loss', 'cache-loss', 'overlay-loss']) {
  const state = { mode, raf: 0, clock: 1000, timestamp: 1000, constructed: 0, disposed: 0, posted: null };
  const holder = { style: {}, replaceChildren() {} }, status = {}, button = {};
  const document = { hidden: false, querySelector: value => value === '#holder' ? holder : value === '#status' ? status : button, addEventListener() {}, removeEventListener() {}, createElement: () => makeCanvas() };
  function makeCanvas() { const canvas = { width: 1920, height: 1080, lost: false }; const ctx = { isContextLost: () => canvas.lost, getImageData() {} }; canvas.getContext = () => ctx; return canvas; }
  const context = vm.createContext({ state, makeCanvas, document, window: { addEventListener() {} }, innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1, navigator: { userAgent: 'SYNTHETIC-NOT-A-BROWSER' }, performance: { now: () => state.clock }, setTimeout, localStorage: { getItem: () => mode === 'override' ? '{}' : null }, requestAnimationFrame: callback => queueMicrotask(() => { state.raf++; state.timestamp += 16; state.clock += state.raf === 2 ? 80 : 16; if (mode === 'hidden' && state.raf === 7) document.hidden = true; callback(state.timestamp); }), fetch: async (url, options) => {
    if (url === '/manifest.json') return { ok: true, json: async () => binding };
    assert.equal(url, '/result'); state.posted = JSON.parse(options.body); return { ok: true, status: 201 };
  } });
  if (mode === 'longtask-queue') context.PerformanceObserver = class { static supportedEntryTypes=['longtask']; observe() {} takeRecords() { return [{ startTime: 1001, duration: 55 }]; } disconnect() { state.observerDisconnected=true; } };
  vm.runInContext(built.outputFiles[0].text, context);
  await button.onclick();
  assert.ok(state.posted); validateReport(state.posted, binding);
  assert.equal(state.disposed, state.constructed);
  assert.equal(state.posted.environment.longTaskSupported, mode === 'longtask-queue');
  if (mode === 'longtask-queue') { assert.equal(state.posted.longTasks.length, 1); assert.deepEqual(state.posted.longTasks[0], { at: 1001, duration: 55 }); assert.equal(state.observerDisconnected,true); }
  if (mode === 'normal' || mode === 'longtask-queue') {
    assert.equal(state.posted.failure, null); assert.equal(state.posted.rows.length, 960);
    assert.equal(state.posted.rows[1].callbackIntervalMs, 80);
    assert.equal(state.posted.rows[1].rafTimestampIntervalMs, 16);
    for (const index of [0, 240, 480, 720]) assert.equal(state.posted.rows[index].callbackIntervalMs, null);
    assert.equal(state.constructed, 4);
  } else {
    assert.ok(state.posted.failure); assert.ok(state.posted.rows.length < 960);
    if (mode === 'override') assert.equal(state.constructed, 0);
    if (mode.endsWith('loss')) { assert.equal(state.posted.rows.length, 959); assert.match(state.posted.failure, /画布资源丢失/); }
    if (mode === 'hidden') assert.equal(state.posted.rows.length, 6);
  }
  summaries.push({ mode, synthetic: true, rows: state.posted.rows.length, failed: state.posted.failure !== null, enginesDisposed: state.disposed });
}
const result = { kind: 'synthetic-compiled-browser-orchestration', actualBrowserCanvasOrPerformance: false, pendingPerformanceObserverCompatible: true, delayedArrival: { synthetic: true, callbackIntervalMs: 80, rafTimestampIntervalMs: 16 }, scenarios: summaries };
writeFileSync(`data/manual-ground-orchestration-check-${Date.now()}-${process.pid}.json`, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(result));
