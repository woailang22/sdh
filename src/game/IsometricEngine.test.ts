import { afterEach, describe, expect, it, vi } from 'vitest';
import { IsometricEngine, type GameCallbacks } from './IsometricEngine';
import { buildCompoundWalls } from './compound';

vi.mock('../audio/soundManager', () => ({ soundManager: { playLevelUp: vi.fn(), playHit: vi.fn(), playGunshot: vi.fn() } }));

function makeCanvas() {
  const context = new Proxy({
    fillRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(), createPattern: () => null,
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {} });
  return Object.assign(new EventTarget(), {
    width: 640, height: 360, parentElement: { clientWidth: 640, clientHeight: 360 },
    getContext: () => context,
  });
}

function setup() {
  const win = Object.assign(new EventTarget(), { innerWidth: 640, innerHeight: 360, setTimeout: vi.fn(() => 1) });
  const doc = Object.assign(new EventTarget(), { hidden: false, createElement: () => makeCanvas() });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('HTMLInputElement', class {});
  vi.stubGlobal('HTMLTextAreaElement', class {});
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const canvas = makeCanvas();
  const callbacks = { onMapZoneChange: vi.fn(), onWeatherChange: vi.fn(), onMonsterKilled: vi.fn() } as unknown as GameCallbacks;
  const engine = new IsometricEngine(canvas as unknown as HTMLCanvasElement, callbacks);
  return { engine, canvas, context: canvas.getContext(), win, doc };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function stubImageLoading() {
  vi.stubGlobal('Image', class extends EventTarget {
    complete = false; naturalWidth = 512; naturalHeight = 512; src = ''; decoding = '';
  });
}

describe('real-time firing cadence', () => {
  function armed() {
    let time = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => time);
    const { engine } = setup(), fire = vi.fn();
    (engine as any).callbacks.onGameAction = fire;
    engine.hasRangedWeapon = true; engine.player.fireRate = 0.12;
    engine.player.isFiring = true; engine.player.ammo = 30; engine.monsters = []; engine.buildings = [];
    return { engine, fire, at: (now: number, dt: number) => { time = now; (engine as any).update(dt); } };
  }
  it('does not fire early when frame timestamps advance faster than callback execution', () => {
    const { engine, fire, at } = armed();
    at(1000, 0.1); at(1050, 0.1); at(1100, 0.03);
    expect(engine.player.ammo).toBe(29); expect(fire).toHaveBeenCalledTimes(1);
    at(1120, 0.001); expect(engine.player.ammo).toBe(28); expect(fire).toHaveBeenCalledTimes(2);
  });
  it('retains the shot cooldown through release and rapid repress', () => {
    const { engine, fire, at } = armed();
    at(1000, 0.001); engine.player.isFiring = false; at(1020, 0.02);
    engine.player.isFiring = true; at(1040, 0.02);
    expect(engine.player.ammo).toBe(29); expect(fire).toHaveBeenCalledTimes(1);
    at(1120, 0.08); expect(engine.player.ammo).toBe(28);
  });
  it('fires only once on resume without replaying shots accumulated during a pause', () => {
    const { engine, fire, at } = armed();
    at(1000, 0.01); at(5000, 0.1);
    expect(engine.player.ammo).toBe(28); expect(fire).toHaveBeenCalledTimes(2);
  });
});

describe('server weather synchronization', () => {
  it('retains the server countdown instead of resetting it to a client-only duration', () => {
    const { engine } = setup();
    engine.setWeather('acid_rain', 37);
    expect(engine.weatherDurationLeft).toBe(37);
    expect((engine as any).callbacks.onWeatherChange).toHaveBeenLastCalledWith(expect.objectContaining({ current: 'acid_rain', durationLeft: 37 }));
  });

  it('waits for the server at countdown expiry and keeps the displayed seconds current', () => {
    const time = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const { engine } = setup(); (engine as any).callbacks.onGameAction = vi.fn();
    engine.setWeather('clear', 1.01);
    time.mockReturnValue(10_020);
    (engine as any).update(0.02);
    expect((engine as any).callbacks.onWeatherChange).toHaveBeenLastCalledWith(expect.objectContaining({ current: 'clear', durationLeft: 1 }));
    time.mockReturnValue(11_020); (engine as any).update(0.02);
    expect(engine.currentWeather).toBe('clear'); expect(engine.weatherDurationLeft).toBe(0);
    (engine as any).update(0.02); expect(engine.currentWeather).toBe('clear');
  });

  it('includes time spent paused or hidden when updating the online weather countdown', () => {
    const time = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    const { engine } = setup(); (engine as any).callbacks.onGameAction = vi.fn();
    engine.setWeather('clear', 180); time.mockReturnValue(70_000);
    (engine as any).update(0.1); expect(engine.weatherDurationLeft).toBe(120);
    expect(engine.currentWeather).toBe('clear');
  });

  it.each(['acid_rain', 'clear'] as const)('does not locally change authoritative shield values during %s', weather => {
    const { engine } = setup(); (engine as any).callbacks.onGameAction = vi.fn();
    engine.setWeather(weather); engine.player.shield = 20;
    (engine as any).update(0.1); expect(engine.player.shield).toBe(20);
  });

  it('preserves autonomous weather transitions for an offline preview', () => {
    const { engine } = setup(); engine.setWeather('clear'); engine.weatherDurationLeft = 0.01;
    (engine as any).update(0.02); expect(engine.currentWeather).toBe('acid_rain');
  });

  it('keeps personal camps clear while rendering acid rain in the continuous public world', () => {
    const { engine, context } = setup();
    (context as any).createLinearGradient = () => ({ addColorStop: vi.fn() });
    engine.currentWeather = 'acid_rain'; engine.currentMapId = 'home_owner';
    const drops = vi.fn(); (context as any).moveTo = drops;
    (engine as any).renderWeather(); expect(drops).not.toHaveBeenCalled();
    engine.currentMapId = 'world'; (engine as any).renderWeather();
    expect(drops.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('ground rendering cost', () => {
  it('keeps resource models visible without a distant field of floating labels', () => {
    const { engine, context } = setup();
    const chest = vi.spyOn(engine as any, 'drawSupplyChest').mockImplementation(() => {});
    vi.spyOn(engine as any, 'tryInteractableSprite').mockReturnValue(false);
    const badge = vi.fn(); (context as any).roundRect = badge;
    const box = { id: 'box', type: 'box', x: engine.player.x + 20, y: engine.player.y, stock: 1 };
    (engine as any).drawInteractable(box);
    expect(chest).toHaveBeenCalledTimes(1);
    expect(badge).not.toHaveBeenCalled();
    engine.nearestInteractable = box as any;
    (engine as any).drawInteractable(box);
    expect(badge).toHaveBeenCalledTimes(1);
  });
  it('draws visible resources and houses at the screen edge without drawing distant cached content', () => {
    const { engine } = setup();
    const render = (engine as any).render;
    for (const name of Object.getOwnPropertyNames(IsometricEngine.prototype)) {
      if (name !== 'render' && /^(render|draw)/.test(name)) vi.spyOn(engine as any, name).mockImplementation(() => {});
    }
    engine.camera = { x: 0, y: 0 };
    engine.interactables = [
      { id: 'near', type: 'box', x: 0, y: 0 }, { id: 'far', type: 'tree', x: 100, y: 100 },
    ] as any;
    (engine as any).worldScenery = [
      { id: 'fern', kind: 'understory', x: 1, y: 1, scale: 1 },
      { id: 'distant-cliff', kind: 'outcrop', x: 100, y: 100, scale: 1 },
    ];
    const makeHouse = (idPrefix: string, x: number, y: number) => buildCompoundWalls({
      idPrefix, cx: x, cy: y, w: 10, h: 8, wallType: 'wood_wall', wallName: '墙', ownerName: '遗迹', doorSide: 'S', doorType: 'door', doorName: '门',
    });
    const edgeHouse = makeHouse('edge_house', 8, -8);
    engine.buildings = [...edgeHouse, ...makeHouse('far_house', 100, 100)];
    render.call(engine);
    expect((engine as any).drawInteractable.mock.calls.map(([e]: any[]) => e.id)).toEqual(['near']);
    expect((engine as any).drawHouse).toHaveBeenCalledTimes(2);
    expect((engine as any).drawHouse.mock.calls[0][0]).toEqual(edgeHouse);
    expect((engine as any).drawWorldScenery).toHaveBeenCalledTimes(1);
    expect((engine as any).drawWorldScenery.mock.calls[0][0].id).toBe('fern');
    expect(engine.interactables).toHaveLength(2); // Culling affects drawing, not simulation or cache contents.
  });

  it('keeps the noise texture aligned to world coordinates during camera movement', () => {
    const { engine, context } = setup();
    const image = { complete: true, naturalWidth: 1254, naturalHeight: 1254 };
    (engine as any).artImage = () => image;
    (engine as any).renderGroundDetails();
    const first = context.drawImage.mock.calls.find(call => call[0] === image);
    expect(first).toBeDefined();
    context.drawImage.mockClear();
    engine.camera.x += 24;
    (engine as any).renderGroundDetails();
    const moved = context.drawImage.mock.calls.find(call => call[0] === image)!;
    expect(moved[1] - first![1]).toBe(24);
    expect(moved[2]).toBe(first![2]);
  });

  it('reuses static ground while the camera stays inside the cached margin', () => {
    const { engine, context } = setup();
    (engine as any).renderMapGround();
    const cachedContext = context.drawImage.mock.calls.at(-1)![0].getContext('2d');
    const fills = cachedContext.fillRect.mock.calls.length;
    engine.camera.x += 24;
    (engine as any).renderMapGround();
    expect(cachedContext.fillRect.mock.calls.length).toBe(fills);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(context.drawImage.mock.calls[1].slice(1)).toEqual([-104, -128]);
  });

  it('rebuilds cached ground after camera travel, resize, a map change, or floor edits', () => {
    const { engine, context, canvas } = setup();
    const draw = () => { (engine as any).renderMapGround(); return context.drawImage.mock.calls.at(-1)?.[0]; };
    const first = draw();
    expect(first).toBeDefined();
    engine.camera.x += 300;
    draw();
    expect(context.drawImage.mock.calls.at(-1)?.slice(1)).toEqual([-128, -128]);
    canvas.parentElement.clientWidth = 800;
    engine.resize();
    draw();
    expect(first.width).toBe(1056);
    engine.currentMapId = 'mtn_logging';
    draw();
    const cacheContext = first.getContext('2d');
    const fillsBefore = cacheContext.fillRect.mock.calls.length;
    engine.placedFloors.set('0,0', { x: 0, y: 0, type: 'wood_floor' });
    draw();
    expect(cacheContext.fillRect.mock.calls.length).toBeGreaterThan(fillsBefore);
    const fillsAfter = cacheContext.fillRect.mock.calls.length;
    engine.placedFloors.set('0,0', { x: 0, y: 0, type: 'iron_floor' });
    draw();
    expect(cacheContext.fillRect.mock.calls.length).toBeGreaterThan(fillsAfter);
  });

  it('scrolls existing pixels and repaints only non-overlapping exposed edges while walking', () => {
    const { engine } = setup();
    const draw = () => (engine as any).renderMapGround();
    draw();
    const cache = (engine as any).groundCache;
    const paint = vi.spyOn(engine as any, 'renderMapGroundUncached');
    for (const [dx, dy] of [[160, 140], [-160, 140], [-160, -140], [160, -140]]) {
      paint.mockClear();
      engine.camera.x = cache.x + dx;
      engine.camera.y = cache.y + dy;
      draw();
      const regions = paint.mock.calls.map(call => call[1] as { x: number; y: number; width: number; height: number } | undefined);
      expect(regions).toHaveLength(2);
      expect(regions.every(r => r !== undefined)).toBe(true);
      const [a, b] = regions!;
      expect(a!.width * a!.height + b!.width * b!.height).toBe(160 * 616 + (896 - 160) * 140);
      expect(a!.x + a!.width <= b!.x || b!.x + b!.width <= a!.x || a!.y + a!.height <= b!.y || b!.y + b!.height <= a!.y).toBe(true);
      expect(cache.canvas.getContext('2d').drawImage.mock.calls.at(-1)).toEqual([cache.canvas, dx, dy]);
    }
  });

  it('fully repaints on a teleport beyond the cached surface instead of copying stale pixels', () => {
    const { engine } = setup();
    (engine as any).renderMapGround();
    const paint = vi.spyOn(engine as any, 'renderMapGroundUncached');
    engine.camera.x += 2000;
    (engine as any).renderMapGround();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.calls[0][1]).toBeUndefined();
  });

  it('reuses static ground in animated maps while redrawing water and rift effects', () => {
    const { engine, context } = setup();
    for (const mapId of ['marsh_docks', 'marsh_bog', 'marsh_rift']) {
      engine.currentMapId = mapId as any;
      (engine as any).renderMapGround();
      const { canvas: cached, overlay } = (engine as any).groundCache;
      expect(overlay).toBeDefined();
      const fills = cached.getContext('2d').fillRect.mock.calls.length;
      const overlayFills = overlay.getContext('2d').fillRect.mock.calls.length;
      const effects = context.fill.mock.calls.length + context.stroke.mock.calls.length;
      (engine as any).gameTime += 0.5;
      (engine as any).renderMapGround();
      expect(cached.getContext('2d').fillRect.mock.calls.length).toBe(fills);
      expect(overlay.getContext('2d').fillRect.mock.calls.length).toBe(overlayFills);
      expect(context.fill.mock.calls.length + context.stroke.mock.calls.length).toBeGreaterThan(effects);
    }
  });

  it('shows a newly loaded scenery sprite without repainting cached terrain', () => {
    const { engine, context } = setup();
    stubImageLoading();
    (engine as any).renderMapGround();
    const cached = context.drawImage.mock.calls.at(-1)?.[0];
    expect(cached).toBeDefined();
    const fills = cached.getContext('2d').fillRect.mock.calls.length;
    const sprite = (engine as any).artImage('world-environment-v1.png');
    sprite.complete = true; sprite.dispatchEvent(new Event('load'));
    (engine as any).renderMapGround();
    expect(cached.getContext('2d').fillRect.mock.calls.length).toBe(fills);
    expect((engine as any).drawArtFrame('world-environment-v1.png', 'understory', 0, 0, 100, 100)).toBe(true);
    expect(context.drawImage.mock.calls.at(-1)?.[0]).toBe(sprite);
  });

  it('replaces a B tile fallback after loading without discarding other variants or terrains', () => {
    const { engine } = setup(); stubImageLoading();
    const forest = (engine as any).artImage('tile-forest-a.png');
    const quarry = (engine as any).artImage('tile-quarry-a.png');
    for (const image of [forest, quarry]) { image.complete = true; image.dispatchEvent(new Event('load')); }
    const patch = (theme: string, variant: string) => (engine as any).tilePatch(theme, variant, 0, 0);
    const forestA = patch('forest', 'a'), oldForestB = patch('forest', 'b'), quarryA = patch('quarry', 'a');
    expect(oldForestB.getContext('2d').drawImage.mock.calls[0][0]).toBe(forest);
    const forestB = (engine as any).artImage('tile-forest-b.png');
    forestB.complete = true; forestB.dispatchEvent(new Event('load'));
    expect(patch('forest', 'a')).toBe(forestA);
    expect(patch('quarry', 'a')).toBe(quarryA);
    const replaced = patch('forest', 'b');
    expect(replaced).not.toBe(oldForestB);
    expect(replaced.getContext('2d').drawImage.mock.calls[0][0]).toBe(forestB);
    expect(oldForestB.width).toBe(0); expect(oldForestB.height).toBe(0);
  });

  it('refreshes the cached ground texture without discarding valid tile patches', () => {
    const { engine, context } = setup(); stubImageLoading();
    const forest = (engine as any).artImage('tile-forest-a.png');
    forest.complete = true; forest.dispatchEvent(new Event('load'));
    const patch = (engine as any).tilePatch('forest', 'a', 0, 0);
    (engine as any).renderMapGround();
    const cached = context.drawImage.mock.calls.at(-1)?.[0];
    const fills = cached.getContext('2d').fillRect.mock.calls.length;
    const texture = (engine as any).artImage('texture-ground.png');
    texture.complete = true; texture.dispatchEvent(new Event('load'));
    expect((engine as any).tilePatch('forest', 'a', 0, 0)).toBe(patch);
    (engine as any).renderMapGround();
    expect(cached.getContext('2d').fillRect.mock.calls.length).toBeGreaterThan(fills);
  });
});

describe('engine lifetime', () => {
  it('recovers after a failed draw instead of permanently losing the animation loop', () => {
    const { engine } = setup();
    const status = vi.fn(); (engine as any).callbacks.onRenderStatus = status;
    const error = new Error('draw failed');
    const storage = { getItem: () => null, setItem: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const render = vi.spyOn(engine as any, 'render').mockImplementationOnce(() => { throw error; }).mockImplementation(() => {});
    vi.spyOn(engine as any, 'update').mockImplementation(() => {});
    engine.start();
    const start = (engine as any).lastTime;
    expect(() => vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](start + 20)).not.toThrow();
    expect(status).toHaveBeenCalledWith(expect.any(String));
    expect(JSON.parse(storage.setItem.mock.calls.at(-1)![1])[0]).toMatchObject({ source: 'frame', phase: 'render', message: 'draw failed' });
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](start + 600);
    expect(render).toHaveBeenCalledTimes(2);
    expect(status).toHaveBeenLastCalledWith(null);
    engine.stop();
  });

  it('rebuilds lost canvas caches without moving the player or cancelling browser restoration', () => {
    const { engine, canvas } = setup();
    const status = vi.fn(); (engine as any).callbacks.onRenderStatus = status;
    (engine as any).renderMapGround();
    const old = (engine as any).groundCache.canvas;
    const position = { x: engine.player.x, y: engine.player.y };
    const lost = new Event('contextlost', { cancelable: true });
    canvas.dispatchEvent(lost);
    expect(lost.defaultPrevented).toBe(false);
    expect(status).toHaveBeenCalledWith(expect.any(String));
    canvas.dispatchEvent(new Event('contextrestored'));
    expect(old.width).toBe(0);
    expect((engine as any).groundCache).toBeNull();
    expect({ x: engine.player.x, y: engine.player.y }).toEqual(position);
    (engine as any).renderMapGround();
    expect((engine as any).groundCache.canvas).not.toBe(old);
  });

  it('does not preload art from unvisited maps or start duplicate loops', () => {
    const { engine } = setup();
    const loads: string[] = [];
    (engine as any).artImage = (file: string) => { loads.push(file); return null; };
    engine.start();
    engine.start();
    expect(loads).toEqual([]);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });

  it('caps rendering on high refresh displays and skips hidden-page work', () => {
    const { engine, doc } = setup();
    const render = vi.spyOn(engine as any, 'render').mockImplementation(() => {});
    const update = vi.spyOn(engine as any, 'update').mockImplementation(() => {});
    engine.start();
    const start = (engine as any).lastTime;
    for (let i = 1; i <= 144; i++) {
      const loop = vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0];
      loop(start + i * 1000 / 144);
    }
    expect(render.mock.calls.length).toBeGreaterThanOrEqual(59);
    expect(render.mock.calls.length).toBeLessThanOrEqual(61);
    doc.hidden = true;
    render.mockClear(); update.mockClear();
    vi.mocked(requestAnimationFrame).mock.calls.at(-1)![0](start + 2000);
    expect(render).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('releases input listeners and graphics caches on disposal', () => {
    const { engine, win } = setup();
    (engine as any).tilePatchCache.set('test', makeCanvas());
    (engine as any).artImages.set('test', {});
    engine.start();
    const key = new Event('keydown');
    Object.assign(key, { key: 'w', code: 'KeyW' });
    win.dispatchEvent(key);
    expect(engine.keys.w).toBe(true);
    (engine as any).dispose?.();
    engine.clearKeys();
    win.dispatchEvent(key);
    expect(engine.keys.w).toBeUndefined();
    expect((engine as any).tilePatchCache.size).toBe(0);
    expect(engine.artImages.size).toBe(0);
  });
});

describe('camp interaction priority', () => {
  it.each(['owner', 'enemy', 'member'])('uses the closer %s storage instead of leaving camp', role => {
    const { engine } = setup();
    const portal = vi.fn(() => true), raid = vi.fn(), manage = vi.fn();
    Object.assign((engine as any).callbacks, { onGameAction: vi.fn(), onCampInteract: portal, onOpenRaidModal: raid, onOpenStorageBox: manage });
    engine.localPlayerId = 'self'; engine.warpToMap(role === 'owner' ? 'home_self' : 'home_other', 1.5, 25.5);
    if (role === 'member') engine.friendlyPlayerIds.add('other');
    const storage = { id: 'storage', type: 'storage_box', name: '仓库', x: 3, y: 24, hp: 400, maxHp: 400, ownerId: role === 'owner' ? 'self' : 'other', mapId: engine.currentMapId } as any;
    engine.buildings = [storage]; engine.nearestBuilding = storage;
    engine.triggerInteraction();
    expect(portal).not.toHaveBeenCalled();
    expect(role === 'enemy' ? raid : manage).toHaveBeenCalledWith(storage);
    expect(role === 'enemy' ? manage : raid).not.toHaveBeenCalled();
  });

  it('uses the closer exit and suppresses the competing building prompt', () => {
    const { engine, context } = setup(); const portal = vi.fn(() => true), raid = vi.fn(), labels = vi.fn();
    Object.assign((engine as any).callbacks, { onGameAction: vi.fn(), onCampInteract: portal, onOpenRaidModal: raid });
    engine.localPlayerId = 'self'; engine.warpToMap('home_other', 0, 27.5);
    const building = { id: 'storage', type: 'storage_box', name: '仓库', x: 1, y: 26, hp: 400, maxHp: 400, ownerId: 'other', mapId: engine.currentMapId } as any;
    engine.buildings = [building]; engine.nearestBuilding = building; (context as any).fillText = labels;
    engine.triggerInteraction(); (engine as any).renderInteractionHUD();
    expect(portal).toHaveBeenCalledTimes(1); expect(raid).not.toHaveBeenCalled();
    expect(labels).not.toHaveBeenCalled();
  });

  it('gathers a closer resource instead of leaving through a nearby exit', () => {
    const { engine } = setup(); const portal = vi.fn(() => true);
    Object.assign((engine as any).callbacks, { onGameAction: vi.fn(), onCampInteract: portal });
    engine.warpToMap('home_other', 0, 26.5); engine.nearestBuilding = null;
    const resource = { id: 'drop', type: 'box', name: '掉落物', x: 0, y: 26.2, stock: 1, searchDuration: 1 } as any;
    engine.nearestInteractable = resource;
    engine.triggerInteraction();
    expect(portal).not.toHaveBeenCalled(); expect(engine.isLooting).toBe(true); expect((engine as any).lootTarget).toBe(resource);
  });

  it('compares a public camp entrance with the current resource target and still enters at the marker', () => {
    const { engine } = setup(); const portal = vi.fn(() => true);
    Object.assign((engine as any).callbacks, { onGameAction: vi.fn(), onCampInteract: portal });
    engine.warpToMap('world', 100, 35); engine.nearestBuilding = null;
    engine.campEntrances = [{ id: 'home_other', ownerId: 'other', ownerName: '另一位行者', x: 101.5, y: 35 }];
    engine.nearestInteractable = { id: 'box', type: 'box', name: '枯枝', x: 100.25, y: 35, stock: 1, searchDuration: 1 } as any;
    engine.triggerInteraction();
    expect(engine.isLooting).toBe(true); expect(portal).not.toHaveBeenCalled();
    engine.isLooting = false; (engine as any).lootTarget = null; engine.player.x = 101.5;
    engine.triggerInteraction();
    expect(portal).toHaveBeenCalledTimes(1); expect(engine.isLooting).toBe(false);
  });

  it('describes breaching, member door access and broken remains without inventing loot', () => {
    const { engine, context } = setup(); const labels = vi.fn(); (context as any).fillText = labels;
    (engine as any).callbacks.onGameAction = vi.fn(); engine.localPlayerId = 'self'; engine.warpToMap('home_other', 5, 5);
    const building = { id: 'storage', type: 'storage_box', name: '敌方仓库', x: 6, y: 5, hp: 400, maxHp: 400, ownerId: 'other', mapId: engine.currentMapId } as any;
    engine.nearestBuilding = building;
    (engine as any).renderInteractionHUD();
    expect(labels.mock.calls.some(([text]) => text.includes('破拆'))).toBe(true);
    labels.mockClear(); engine.friendlyPlayerIds.add('other'); building.type = 'safe_door';
    (engine as any).renderInteractionHUD();
    expect(labels.mock.calls.some(([text]) => text.includes('开启安全门'))).toBe(true);
    labels.mockClear(); building.hp = 0;
    (engine as any).renderInteractionHUD();
    expect(labels.mock.calls.some(([text]) => text.includes('残骸'))).toBe(true);
    expect(labels.mock.calls.some(([text]) => text.includes('战利品'))).toBe(false);
  });
});

describe('continuous public world', () => {
  it('does not flood the screen with depleted-resource notices while gathering is held', () => {
    const { engine } = setup();
    (engine as any).callbacks.onGameAction = vi.fn();
    engine.nearestBuilding = null;
    engine.buildings = [];
    engine.nearestInteractable = { id: 'empty-tree', type: 'tree', x: engine.player.x, y: engine.player.y, stock: 0 } as any;
    const notice = vi.spyOn(engine, 'addTextParticle');
    for (let i = 0; i < 60; i++) engine.triggerInteraction();
    expect(notice).toHaveBeenCalledTimes(1);
    expect(engine.isLooting).toBe(false);
  });
  it('interrupts pending gathering when authoritative damage arrives', () => {
    const { engine } = setup();
    engine.isLooting = true; engine.lootProgress = 0.5;
    (engine as any).lootTarget = { id: 'tree', type: 'tree' };
    (engine as any).receiveAuthoritativeDamage(12);
    expect(engine.isLooting).toBe(false);
    expect(engine.lootProgress).toBe(0);
    expect((engine as any).lootTarget).toBeNull();
    expect(engine.hurtFlash).toBeGreaterThan(0);
  });
  it('keeps server monster health authoritative while animating toward shared positions', () => {
    const { engine } = setup();
    const action = vi.fn(); (engine as any).callbacks.onGameAction = action;
    engine.buildings = [];
    engine.player.x = 100; engine.player.y = 100;
    const monster = { id: 'shared', name: '异变兽', x: 101, y: 100, hp: 80, maxHp: 100, state: 'chase', speed: 2, damage: 10, animTime: 0, attackCooldown: 0 } as any;
    (engine as any).setAuthoritativeMonsters([monster]);
    (engine as any).update(0.02);
    expect(engine.monsters[0].hp).toBe(80);
    expect(action.mock.calls.some(([name]) => name === 'damage')).toBe(false);
    (engine as any).setAuthoritativeMonsters([{ ...monster, hp: 0, state: 'dead' }]);
    expect(engine.monsters[0].state).toBe('dead');
    (engine as any).refreshWorld(true);
    expect(engine.monsters[0].hp).toBe(0);
  });
  it('starts in the public world without a personal camp and walks past old map limits', () => {
    const { engine } = setup();
    expect(engine.currentMapId).toBe('world');
    expect(engine.mapWaypoints).toEqual([]);
    engine.player.x = 40;
    engine.player.y = 40;
    (engine as any).update(0.01);
    expect(engine.player.x).toBeGreaterThan(38);
    expect(engine.currentMapId).toBe('world');
  });

  it('retains nearby entities when crossing chunks and bounds the chunk cache', () => {
    const { engine } = setup();
    const chunk = (engine as any).worldChunks.get('world:0:0');
    expect(chunk).toBeDefined();
    engine.player.x = 33;
    (engine as any).refreshWorld();
    expect((engine as any).worldChunks.get('world:0:0')).toBe(chunk);
    for (let x = -900; x < 900; x += 64) {
      engine.player.x = x;
      (engine as any).refreshWorld();
    }
    expect((engine as any).worldChunks.size).toBeLessThanOrEqual(64);
  });

  it('loads registered camps without template gifts and delegates actions to the server', () => {
    const { engine } = setup();
    const action = vi.fn();
    (engine as any).callbacks.onGameAction = action;
    engine.warpToMap('home_test', 0, 28);
    expect(engine.buildings).toEqual([]);
    expect(engine.interactables).toEqual([]);
    engine.selectedBuildType = 'wood_wall';
    engine.mouse.worldX = 0; engine.mouse.worldY = 27;
    engine.tryPlaceBuilding();
    expect(action).toHaveBeenCalledWith('build', expect.objectContaining({ buildType: 'wood_wall', x: 0, y: 27 }));
    expect(engine.buildings).toEqual([]);
  });

  it('offers breaching for enemy facilities and management for broken storage and the owner core', () => {
    const { engine } = setup();
    const raid = vi.fn(), manage = vi.fn();
    (engine as any).callbacks.onGameAction = vi.fn();
    (engine as any).callbacks.onOpenRaidModal = raid;
    (engine as any).callbacks.onOpenStorageBox = manage;
    engine.localPlayerId = 'owner';
    engine.warpToMap('home_other', 0, 28);
    for (const type of ['storage_box', 'turret', 'anchor_core']) {
      const b = { id: type, type, x: 0, y: 27, hp: 100, maxHp: 100, ownerId: 'other', mapId: 'home_other' } as any;
      engine.buildings = [b]; engine.nearestBuilding = b;
      engine.triggerInteraction();
      expect(raid).toHaveBeenLastCalledWith(b);
    }
    const broken = { id: 'broken', type: 'storage_box', x: 0, y: 27, hp: 0, maxHp: 100, ownerId: 'other', mapId: 'home_other' } as any;
    engine.buildings = [broken];
    (engine as any).update(0.01);
    expect(engine.nearestBuilding?.id).toBe('broken');
    engine.triggerInteraction();
    expect(manage).toHaveBeenLastCalledWith(broken);
    const core = { ...broken, id: 'core', type: 'anchor_core', ownerId: 'owner' };
    engine.buildings = [core]; engine.nearestBuilding = core;
    engine.triggerInteraction();
    expect(manage).toHaveBeenLastCalledWith(core);
  });

  it('sends the actual aimed remote player with one server shot', () => {
    const { engine } = setup();
    const action = vi.fn(); (engine as any).callbacks.onGameAction = action;
    engine.localPlayerId = 'self';
    engine.player.x = 0; engine.player.y = 0;
    engine.monsters = []; engine.buildings = [];
    engine.onlinePlayers.set('target', { id: 'target', x: 2, y: 0, mapId: 'world', hp: 100 } as any);
    (engine as any).fireBullet(0, 0, Math.atan2(1, 2));
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith('fire', expect.objectContaining({ targetId: 'target' }));
  });

  it('lets authorized members operate friendly doors and select destroyed defenses for repair', () => {
    const { engine } = setup();
    const action = vi.fn(), raid = vi.fn();
    (engine as any).callbacks.onGameAction = action;
    (engine as any).callbacks.onOpenRaidModal = raid;
    engine.localPlayerId = 'member'; engine.friendlyPlayerIds = new Set(['owner', 'member']);
    engine.warpToMap('home_owner', 0, 28);
    const door = { id: 'door', type: 'door', x: 0, y: 27, hp: 100, maxHp: 100, ownerId: 'owner', mapId: 'home_owner' } as any;
    engine.buildings = [door]; engine.nearestBuilding = door;
    engine.triggerInteraction();
    expect(action).toHaveBeenCalledWith('toggle_door', { targetId: 'door' });
    expect(raid).not.toHaveBeenCalled();
    const core = { ...door, id: 'core', type: 'anchor_core', hp: 0 };
    engine.buildings = [core]; (engine as any).update(0.01);
    expect(engine.nearestBuilding?.id).toBe('core');
  });
});
