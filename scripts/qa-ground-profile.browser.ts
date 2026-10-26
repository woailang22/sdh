import { IsometricEngine, type GameCallbacks } from '../src/game/IsometricEngine';

const holder = document.querySelector<HTMLDivElement>('#holder')!;
const status = document.querySelector<HTMLElement>('#status')!;
const button = document.querySelector<HTMLButtonElement>('#run')!;
const fixtures = [{ id: 'spawn', x: 0, y: 1 }, { id: 'camp-entrance', x: -60, y: 20 }, { id: 'forest-farm', x: -304, y: -112 }, { id: 'factory', x: 622, y: -80 }];
const next = () => new Promise<{ rafAt: number; callbackAt: number }>(resolve => requestAnimationFrame(rafAt => resolve({ rafAt, callbackAt: performance.now() })));
const heap = () => {
  const value = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  return value ? { used: value.usedJSHeapSize, total: value.totalJSHeapSize } : null;
};
const scale = () => { holder.style.transform = `scale(${Math.min(1, Math.max(.1, (innerWidth - 48) / 1920))})`; };
scale(); window.addEventListener('resize', scale);

button.onclick = async () => {
  button.disabled = true;
  const rows: any[] = [], starts: any[] = [], assets: any[] = [], memory: any[] = [], longTasks: any[] = [];
  let interrupted = document.hidden, failure: string | null = null, observer: PerformanceObserver | undefined;
  const supportsLongTasks = typeof PerformanceObserver !== 'undefined' && (PerformanceObserver.supportedEntryTypes?.includes('longtask') ?? false);
  const visibility = () => { if (document.hidden) interrupted = true; };
  document.addEventListener('visibilitychange', visibility);
  let manifest: { runId: string; fingerprint: string } | null = null;
  const startedAt = performance.now();
  try {
    const response = await fetch('/manifest.json'); if (!response.ok) throw Error('来源记录不可用'); manifest = await response.json();
    if (localStorage.getItem('sdc_map_override_world') !== null) throw Error('此本地地址存在编辑器覆盖，诊断停止；保留原数据并换空闲端口重新准备');
    if (supportsLongTasks) {
      observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push({ at: entry.startTime, duration: entry.duration }); });
      observer.observe({ type: 'longtask', buffered: false });
    }
    const callbacks = new Proxy({}, { get: () => () => {} }) as GameCallbacks;
    for (const fixture of fixtures) {
      if (interrupted) throw Error('页面曾离开前台，诊断中断');
      const canvas = document.createElement('canvas'); holder.replaceChildren(canvas);
      // Diagnostic fixture only. No network, database, update(), start(), or gameplay actor.
      const engine: any = new IsometricEngine(canvas, callbacks);
      try {
        const assertCanvasHealthy = () => {
          if (engine.contextLost) throw Error('画布资源丢失，诊断中断');
          for (const surface of [canvas, engine.groundCache?.canvas, engine.groundCache?.overlay]) {
            if (!surface) continue;
            const context = surface.getContext('2d');
            if (!context || context.isContextLost?.()) throw Error('画布资源丢失，诊断中断');
          }
        };
        engine.warpToMap('world', fixture.x, fixture.y); engine.gameTime = 12;
        if (canvas.width !== 1920 || canvas.height !== 1080) throw Error('诊断画布尺寸改变');
        memory.push({ fixture: fixture.id, phase: 'before', jsHeap: heap() });
        const loadingAt = performance.now(); engine.renderMapGround();
        starts.push({ fixture: fixture.id, phase: 'loading', at: loadingAt, ms: performance.now() - loadingAt, flags: { ...engine.groundFrame } });
        await Promise.all([...engine.artImages.values()].map((image: HTMLImageElement) => image.decode()));
        const readyAt = performance.now(); engine.renderMapGround();
        starts.push({ fixture: fixture.id, phase: 'tile-ready', at: readyAt, ms: performance.now() - readyAt, flags: { ...engine.groundFrame } });
        assets.push({ fixture: fixture.id, files: [...engine.artImages].map(([file, image]: [string, HTMLImageElement]) => ({ file, width: image.naturalWidth, height: image.naturalHeight, complete: image.complete })) });
        let terrainMs = 0, detailsMs = 0, area = 0, terrainCalls = 0, detailsCalls = 0, previous: { rafAt: number; callbackAt: number } | null = null;
        const terrain = engine.renderMapGroundUncached, details = engine.renderGroundDetails;
        engine.renderMapGroundUncached = function (...args: any[]) { const region = args[1]; area += region ? region.width * region.height : this.width * this.height; terrainCalls++; const at = performance.now(); try { return terrain.apply(this, args); } finally { terrainMs += performance.now() - at; } };
        engine.renderGroundDetails = function (...args: any[]) { detailsCalls++; const at = performance.now(); try { return details.apply(this, args); } finally { detailsMs += performance.now() - at; } };
        for (let step = 0; step < 240; step++) {
          status.textContent = `场景 ${fixtures.indexOf(fixture) + 1}/4 · ${step + 1}/240`;
          const timing = await next();
          if (interrupted || document.hidden) throw Error('页面曾离开前台，诊断中断');
          assertCanvasHealthy();
          terrainMs = detailsMs = area = terrainCalls = detailsCalls = 0;
          engine.camera.x += 3; engine.camera.y += 1.5;
          const at = performance.now(); engine.renderMapGround(); const end = performance.now();
          assertCanvasHealthy();
          rows.push({ fixture: fixture.id, step, at, ...timing, callbackIntervalMs: previous === null ? null : timing.callbackAt - previous.callbackAt, rafTimestampIntervalMs: previous === null ? null : timing.rafAt - previous.rafAt, submitMs: end - at, terrainMs, detailsMs, terrainCalls, detailsCalls, repaintArea: area, flags: { ...engine.groundFrame }, cache: { x: engine.groundCache.x, y: engine.groundCache.y, width: engine.groundCache.canvas.width, height: engine.groundCache.canvas.height } });
          previous = timing;
        }
        const at = performance.now(); canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
        assertCanvasHealthy();
        starts.push({ fixture: fixture.id, phase: 'final-forced-readback', at, ms: performance.now() - at });
      } finally { engine.dispose(); canvas.width = canvas.height = 0; holder.replaceChildren(); memory.push({ fixture: fixture.id, phase: 'after-dispose', jsHeap: heap() }); }
    }
  } catch (error) { failure = error instanceof Error ? error.stack ?? error.message : String(error); }
  finally { document.removeEventListener('visibilitychange', visibility); }
  const measuredEndAt = performance.now();
  // Allow delivery, then drain the queue explicitly; a timer does not guarantee observer delivery.
  await new Promise(resolve => setTimeout(resolve, 0));
  if (observer) {
    for (const entry of observer.takeRecords()) longTasks.push({ at: entry.startTime, duration: entry.duration });
    observer.disconnect();
  }
  const report = { kind: 'same-instance-ground-camera-diagnostic', runId: manifest?.runId, fingerprint: manifest?.fingerprint, startedAt, measuredEndAt, environment: { viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio, canvas: { width: 1920, height: 1080 }, cssTransform: holder.style.transform, userAgent: navigator.userAgent, longTaskSupported: supportsLongTasks }, starts, assets, rows, memory, longTasks, failure, limitations: ['Isolated ground-only camera sweep after requested images decode; no engine update or gameplay/server/database. Existing local editor overrides are rejected without changing them.', '3/1.5px camera increment per browser callback; neither native walking nor production60Hz cadence.', 'Method spans include instrumentation, scheduling and potential driver waits; RAF intervals are callback cadence, not physical displayed frames.', 'Final artificial readback per fixture; scaled diagnostic presentation differs from the full game.', 'Optional JS heap is not whole-browser/GPU memory and disposal does not force garbage collection. Four fixtures share module caches.'] };
  try {
    const response = await fetch('/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
    if (!response.ok) throw Error(`保存返回${response.status}`);
    status.textContent = failure ? '诊断中断，已有数据已保存。请回复“诊断中断”。' : '诊断完成，数据已自动保存。可以关闭此页，并回复“已完成”。';
  } catch (error) { status.textContent = '诊断保存失败：' + String(error); }
};
