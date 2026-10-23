import { afterEach, describe, expect, it, vi } from 'vitest';
import { IsometricEngine, type GameCallbacks } from './IsometricEngine';
import { buildCompoundWalls } from './compound';
import * as houseRenderer from './houseRenderer';
import * as renderDiagnostics from './renderDiagnostics';
import { isPositionBlocked } from './navigation';
import { createMemoryDb } from '../../server/db';
import { GameWorld, type WorldRules } from '../../server/worldState';

vi.mock('../audio/soundManager', () => ({ soundManager: { playLevelUp: vi.fn(), playHit: vi.fn(), playGunshot: vi.fn(), playReload: vi.fn() } }));

function makeCanvas() {
  const context = new Proxy({
    fillRect: vi.fn(), fill: vi.fn(), stroke: vi.fn(), drawImage: vi.fn(), createPattern: () => null,
    fillText: vi.fn(), strokeText: vi.fn(), arc: vi.fn(), clearRect: vi.fn(),
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

describe('click-to-move arrival', () => {
  it.each([false, true])('keeps actual low-frame-rate sync packets authoritative while turning around a yard (dash=%s)', dash => {
    const { engine } = setup(); engine.warpToMap('home_self', 0, -5);
    const walls = buildCompoundWalls({ idPrefix: 'yard', cx: 0, cy: 0, w: 6, h: 6, wallType: 'wood_wall', wallName: '墙', ownerName: '测试', doorSide: 'S', doorType: 'door', doorName: '门', doorExtra: { isOpen: true } });
    engine.buildings = walls; engine.monsters = []; engine.interactables = [];
    const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], campSiteAllowed: () => false, migrate: (_mapId, x, y) => ({ mapId: 'world', x, y }), monstersNear: () => [] };
    let time = 10000, packets = 0, dashedAtCorner = false, dashCrossedCorner = false;
    const game = new GameWorld(createMemoryDb(), rules, () => time); game.connect('self', '测试');
    const player = game.state.players.self;
    Object.assign(player, { mapId: 'home_self', x: 0, y: -5, moveAt: time });
    for (const wall of walls) game.state.buildings[wall.id] = { ...wall, mapId: 'home_self' };
    Object.assign((engine as any).callbacks, { onGameAction: vi.fn(), onPlayerSyncNeeded: (packet: any) => {
      packets++;
      if (packet.isDashing && player.x > -4 && Math.abs(player.y + 3.5) < 1e-6 && Math.abs(packet.x + 4) < 1e-6 && packet.y > -3.5) dashCrossedCorner = true;
      expect(game.move('self', packet), JSON.stringify({ packet, from: { x: player.x, y: player.y } })).toBe(true);
      expect(isPositionBlocked(player.x, player.y, walls)).toBe(false);
    } });
    engine.navigateTo(0, 0);
    expect((engine as any).movePath.some((point: { y: number }) => point.y > 3)).toBe(true);
    for (let i = 0; i < 150; i++) {
      const path = (engine as any).movePath as { x: number; y: number }[];
      if (dash && !dashedAtCorner && path.length > 1) {
        const [next] = path;
        if (next.x === -4 && next.y === -3.5 && Math.hypot(next.x - engine.player.x, next.y - engine.player.y) < .8) { engine.performDash(); dashedAtCorner = true; }
      }
      time += 100; (engine as any).update(.1);
    }
    expect(packets).toBe(150);
    expect(dashedAtCorner).toBe(dash);
    expect(dashCrossedCorner).toBe(dash);
    expect(Math.hypot(player.x, player.y)).toBeLessThanOrEqual(.12);
    expect((engine as any).targetMovePoint).toBeNull();
  });

  it.each([.016, .05, .1])('stops beside an occupied destination with%s-second updates and permits the following search to finish', dt => {
    const { engine } = setup(), action = vi.fn();
    engine.warpToMap('home_self', -3.15, 0);
    (engine as any).callbacks.onGameAction = action;
    engine.buildings = [{ id: 'storage', type: 'storage_box', name: '仓库', x: 0, y: 0, hp: 100, maxHp: 100, level: 1 }];
    engine.monsters = []; engine.interactables = [];
    engine.navigateTo(0, 0);
    for (let i = 0; i < Math.ceil(8 / dt); i++) (engine as any).update(dt);
    expect(isPositionBlocked(engine.player.x, engine.player.y, engine.buildings)).toBe(false);
    expect(Math.hypot(engine.player.x, engine.player.y)).toBeLessThanOrEqual(1.2);
    expect((engine as any).targetMovePoint).toBeNull();
    const stopped = { x: engine.player.x, y: engine.player.y };
    for (let i = 0; i < 20; i++) (engine as any).update(.05);
    expect({ x: engine.player.x, y: engine.player.y }).toEqual(stopped);
    const target = { id: 'cabinet', type: 'box', x: -1, y: 1, searchDuration: .1 };
    Object.assign(engine as any, { isLooting: true, lootTarget: target, lootingTimer: .1 });
    (engine as any).update(.2);
    expect(action).toHaveBeenCalledWith('search', { targetId: target.id });
    expect(engine.isLooting).toBe(false);
  });

  it('still walks through an open entrance to a free indoor destination and cancels a closed route', () => {
    const { engine } = setup(); engine.warpToMap('home_self', 0, 5);
    const walls = buildCompoundWalls({ idPrefix: 'room', cx: 0, cy: 0, w: 6, h: 6, wallType: 'wood_wall', wallName: '墙', ownerName: '测试', doorSide: 'S', doorType: 'door', doorName: '门', doorExtra: { isOpen: true } });
    engine.buildings = walls; engine.monsters = []; engine.interactables = [];
    (engine as any).callbacks.onGameAction = vi.fn();
    engine.navigateTo(0, 0);
    for (let i = 0; i < 200; i++) { (engine as any).update(.02); expect(isPositionBlocked(engine.player.x, engine.player.y, walls)).toBe(false); }
    expect(Math.hypot(engine.player.x, engine.player.y)).toBeLessThanOrEqual(.12);
    expect((engine as any).targetMovePoint).toBeNull();
    engine.player.y = 5; walls.find(b => b.type === 'door')!.isOpen = false;
    engine.navigateTo(0, 0);
    expect((engine as any).targetMovePoint).toBeNull();
    (engine as any).update(.1); expect(engine.player.y).toBe(5);
  });

  it.each(['keyboard', 'joystick'])('preserves normal%s speed and manual cancellation of click navigation', input => {
    const { engine } = setup(); engine.warpToMap('home_self', -3, 0);
    engine.buildings = []; engine.monsters = []; engine.interactables = [];
    (engine as any).callbacks.onGameAction = vi.fn();
    engine.navigateTo(-2.9, 0);
    if (input === 'joystick') engine.virtualJoystick = { x: 1, y: .5 };
    else engine.keys.d = true;
    const start = { x: engine.player.x, y: engine.player.y };
    (engine as any).update(.1);
    expect(Math.hypot(engine.player.x - start.x, engine.player.y - start.y)).toBeCloseTo(.38, 10);
    expect((engine as any).targetMovePoint).toBeNull();
  });

  it.each([.016, .05, .1])('carries unused movement across path points at%s-second steps without reducing walking speed', dt => {
    const { engine } = setup(); engine.warpToMap('home_self', -10, 0);
    engine.buildings = []; engine.monsters = []; engine.interactables = [];
    (engine as any).callbacks.onGameAction = vi.fn();
    engine.navigateTo(10, 0);
    for (let i = 0; i < 10; i++) (engine as any).update(dt);
    expect(engine.player.x).toBeCloseTo(-10 + 3.8 * dt * 10, 10);
    expect(engine.player.y).toBe(0);
  });

  it('carries the dash movement budget across multiple path points without overshooting them', () => {
    const { engine } = setup(); engine.warpToMap('home_self', -10, 0);
    engine.buildings = []; engine.monsters = []; engine.interactables = [];
    (engine as any).callbacks.onGameAction = vi.fn();
    engine.navigateTo(10, 0); engine.performDash(); (engine as any).update(.1);
    expect(engine.player.x).toBeCloseTo(-10 + 3.8 * 2.2 * .1, 10);
    expect(engine.player.y).toBe(0);
  });

  it('does not spend leftover movement beyond a door closed after planning and resumes when it opens', () => {
    const { engine } = setup(); engine.warpToMap('home_self', 0, 5);
    const walls = buildCompoundWalls({ idPrefix: 'room', cx: 0, cy: 0, w: 6, h: 6, wallType: 'wood_wall', wallName: '墙', ownerName: '测试', doorSide: 'S', doorType: 'door', doorName: '门', doorExtra: { isOpen: true } });
    engine.buildings = walls; engine.monsters = []; engine.interactables = [];
    (engine as any).callbacks.onGameAction = vi.fn();
    engine.navigateTo(0, 0); const door = walls.find(b => b.type === 'door')!; door.isOpen = false;
    for (let i = 0; i < 30; i++) (engine as any).update(.1);
    expect(engine.player.y).toBeGreaterThan(3.3);
    expect(isPositionBlocked(engine.player.x, engine.player.y, walls)).toBe(false);
    door.isOpen = true;
    for (let i = 0; i < 50; i++) (engine as any).update(.1);
    expect(Math.hypot(engine.player.x, engine.player.y)).toBeLessThanOrEqual(.12);
    expect((engine as any).targetMovePoint).toBeNull();
  });
});

describe('construction reach preview', () => {
  it('warns about a bed on the placement line and shows the actual building name until the player walks around it', () => {
    const { engine, context } = setup(); engine.warpToMap('home_self', -15, 15);
    (engine as any).callbacks.onGameAction = vi.fn(); engine.selectedBuildType = 'wood_wall';
    engine.buildings = [{ id: 'bed', type: 'bed', name: '床', x: -16, y: 15, hp: 300, maxHp: 300, level: 1 }];
    engine.mouse.worldX = -17; engine.mouse.worldY = 15;
    const fills: unknown[] = []; context.fill.mockImplementation(() => fills.push((context as any).fillStyle));
    (engine as any).drawBuildGhost();
    expect(fills.at(-1)).toBe('rgba(239, 68, 68, 0.45)');
    expect(context.fillText).toHaveBeenCalledWith(expect.stringContaining('建筑遮挡'), expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith(expect.stringContaining('加固原木围墙'), expect.any(Number), expect.any(Number));
    expect(context.fillText.mock.calls.some(call => String(call[0]).includes('wood_wall'))).toBe(false);
    engine.player.x = -16; engine.player.y = 17; context.fillText.mockClear();
    (engine as any).drawBuildGhost();
    expect(fills.at(-1)).toBe('rgba(6, 182, 212, 0.45)');
    expect(context.fillText.mock.calls.some(call => String(call[0]).includes('遮挡'))).toBe(false);
  });

  it.each([[3, true, false], [3.01, true, true], [4.5, true, true], [4.5, false, false]] as const)('matches the %s-cell reach hint online=%s (too far=%s)', (distance, online, tooFar) => {
    const { engine, context } = setup(); engine.warpToMap('home_self', -distance, 5);
    if (online) (engine as any).callbacks.onGameAction = vi.fn();
    engine.buildings = []; engine.mouse.worldX = 0; engine.mouse.worldY = 5;
    (engine as any).drawBuildGhost();
    expect(context.fillText.mock.calls.some(call => String(call[0]).includes('距离过远'))).toBe(tooFar);
  });
});

describe('real-time firing cadence', () => {
  function pointerGun() {
    let time = 1000; vi.spyOn(performance, 'now').mockImplementation(() => time);
    const { engine, canvas, win } = setup(), fire = vi.fn(); engine.warpToMap('home_self', 0, 0);
    Object.assign(canvas, { getBoundingClientRect: () => ({ left: 30, top: 20 }) });
    (engine as any).callbacks.onGameAction = fire;
    engine.hasRangedWeapon = true; engine.player.ammo = 30; engine.monsters = []; engine.buildings = [];
    const point = engine.toScreen(3, -3);
    return { engine, fire, win, press: (now: number) => { time = now; canvas.dispatchEvent(Object.assign(new Event('mousedown'), { button: 0, clientX: point.x + 30, clientY: point.y + 20 })); },
      release: (now: number) => { time = now; win.dispatchEvent(Object.assign(new Event('mouseup'), { button: 0 })); },
      at: (now: number) => { time = now; (engine as any).update(.001); } };
  }

  it('fires a correctly aimed short click exactly once when down and up occur between updates', () => {
    const { engine, fire, press, release, at } = pointerGun();
    engine.player.angle = Math.PI / 2;
    engine.onlinePlayers.set('target', { id: 'target', x: 3, y: -3, mapId: 'home_self', hp: 100 } as any);
    press(1000); release(1040); at(1060);
    expect(engine.player.ammo).toBe(29);
    expect(fire).toHaveBeenCalledExactlyOnceWith('fire', { angle: 0, targetId: 'target' });
    expect(engine.player.isFiring).toBe(false);
    at(1300);
    expect(engine.player.ammo).toBe(29); expect(fire).toHaveBeenCalledTimes(1);
  });

  it('shares the original cooldown across press attempts and held updates without a duplicate first shot', () => {
    const { engine, fire, press, release, at } = pointerGun();
    press(1000); at(1000); expect(engine.player.ammo).toBe(29);
    release(1010); press(1040); at(1040); expect(engine.player.ammo).toBe(29);
    release(1050); at(1119); expect(engine.player.ammo).toBe(29);
    press(1120); at(1120); expect(engine.player.ammo).toBe(28);
    at(1200); expect(engine.player.ammo).toBe(28);
    at(1240); expect(engine.player.ammo).toBe(27);
    release(1241); at(1500); expect(engine.player.ammo).toBe(27);
    expect(fire).toHaveBeenCalledTimes(3);
  });

  it('does not defer a released cooldown-blocked click into a later shot', () => {
    const { engine, fire, press, release, at } = pointerGun();
    press(1000); at(1000); release(1010);
    press(1100); release(1110); at(1120); at(1500);
    expect(engine.player.ammo).toBe(29); expect(fire).toHaveBeenCalledTimes(1);
  });

  it.each(['blocked', 'build', 'editor'])('keeps %s pointer actions out of ranged firing', mode => {
    const { engine, fire, press, release, at } = pointerGun();
    if (mode === 'blocked') engine.inputBlocked = true;
    if (mode === 'build') { engine.isBuildMode = true; vi.spyOn(engine as any, 'tryPlaceBuilding').mockImplementation(() => {}); }
    if (mode === 'editor') { engine.setEditMode(true); vi.spyOn(engine as any, 'editorPlace').mockImplementation(() => {}); }
    press(1000); release(1040); at(1200);
    expect(engine.player.ammo).toBe(30); expect(fire).not.toHaveBeenCalled();
    expect(engine.player.isFiring).toBe(false);
  });

  it.each(['empty', 'unarmed'])('does not invent a ranged shot for an %s short click', mode => {
    const { engine, fire, press, release, at } = pointerGun();
    if (mode === 'empty') engine.player.ammo = 0; else engine.hasRangedWeapon = false;
    press(1000); release(1040); at(1200);
    expect(engine.player.ammo).toBe(mode === 'empty' ? 0 : 30); expect(fire).not.toHaveBeenCalled();
  });

  it.each(['blur', 'focus'])('stops held input on %s without replaying the already accepted press', type => {
    const { engine, fire, win, press, at } = pointerGun();
    press(1000); at(1000); win.dispatchEvent(new Event(type)); at(1200); at(1500);
    expect(engine.player.ammo).toBe(29); expect(fire).toHaveBeenCalledTimes(1);
    expect(engine.player.isFiring).toBe(false);
  });

  it('records a failed press action and stops held fire without automatically retrying it', () => {
    const { engine, fire, press, at } = pointerGun(), status = vi.fn();
    const diagnostic = vi.spyOn(renderDiagnostics, 'recordRenderFailure');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (engine as any).callbacks.onRenderStatus = status;
    fire.mockImplementationOnce(() => { throw new Error('Injected action failure'); });
    // Invoke the actual registered body directly: Node EventTarget otherwise rethrows on nextTick.
    let mouseDown: (event: any) => void = () => {};
    vi.spyOn((engine as any).canvas, 'addEventListener').mockImplementation((type: any, listener: any) => { if (type === 'mousedown') mouseDown = listener; });
    (engine as any).setupListeners();
    expect(() => mouseDown({ button: 0, clientX: 446, clientY: 200 })).not.toThrow();
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ message: 'Injected action failure' }), expect.objectContaining({ source: 'input', phase: 'fire', mapId: 'home_self' }));
    expect(status).toHaveBeenCalledWith('射击操作发生错误，错误信息已保留');
    expect(engine.player.isFiring).toBe(false); expect(engine.mouse.isDown).toBe(false);
    at(1200); expect(fire).toHaveBeenCalledTimes(1);
    press(1300); expect(fire).toHaveBeenCalledTimes(2);
  });

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

describe('isometric shot visuals', () => {
  it.each([0, 45, 90, 135, 180, 225, 270, 315])('aligns the muzzle and moving tracer with a %s-degree screen aim', degrees => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { engine } = setup(); engine.warpToMap('home_self', 5, 8);
    Object.assign((engine as any).callbacks, { onGameAction: vi.fn() });
    engine.hasRangedWeapon = true; engine.player.ammo = 5; engine.player.isFiring = true;
    engine.monsters = []; engine.buildings = [];
    const angle = degrees * Math.PI / 180, origin = engine.toScreen(engine.player.x, engine.player.y);
    engine.mouse.screenX = origin.x + Math.cos(angle) * 140; engine.mouse.screenY = origin.y + Math.sin(angle) * 140;
    const flash = vi.spyOn(engine as any, 'spawnMuzzleFlash');
    (engine as any).update(0.001);
    const [x, y] = flash.mock.calls[0] as [number, number];
    const muzzle = engine.toScreen(x, y), player = engine.toScreen(engine.player.x, engine.player.y);
    const tracer = engine.particles.find(p => p.type === 'laser')!;
    const start = engine.toScreen(tracer.x, tracer.y), next = engine.toScreen(tracer.x + tracer.vx, tracer.y + tracer.vy);
    for (const vector of [{ x: muzzle.x - player.x, y: muzzle.y - player.y }, { x: next.x - start.x, y: next.y - start.y }]) {
      const length = Math.hypot(vector.x, vector.y);
      expect((vector.x * Math.cos(angle) + vector.y * Math.sin(angle)) / length).toBeCloseTo(1, 10);
    }
    expect(Math.hypot(x - engine.player.x, y - engine.player.y)).toBeCloseTo(0.8);
    expect(Math.hypot(tracer.vx, tracer.vy)).toBeCloseTo(35);
    expect(engine.player.ammo).toBe(4);
  });
  it.each([[1, 0], [0, 1], [4, -3]])('draws tracer segments in the same projection as their world velocity %s,%s', (vx, vy) => {
    const { engine, context } = setup(); const line = vi.fn(); (context as any).lineTo = line;
    engine.particles = [{ x: 6, y: 9, vx, vy, life: 1, maxLife: 1, color: '#fff', size: 3, type: 'laser' }];
    (engine as any).renderParticles();
    const end = engine.toScreen(6 + vx * 0.05, 9 + vy * 0.05);
    expect(line).toHaveBeenCalledWith(end.x, end.y);
  });
  it.each([0, 90])('uses the corrected muzzle origin for offline damage at %s degrees without changing weapon damage', degrees => {
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    const { engine } = setup(); engine.warpToMap('home_self', 0, 0); engine.buildings = [];
    const sign = degrees === 0 ? -1 : 1, dx = Math.SQRT1_2, dy = sign * Math.SQRT1_2;
    const monster = { id: 'offline', name: '测试怪物', x: dx * 8, y: dy * 8, hp: 1000, maxHp: 1000, speed: 0, damage: 10, state: 'roam', animTime: 0, attackCooldown: 0 } as any;
    engine.monsters = [monster]; engine.hasRangedWeapon = true; engine.rangedDamage = 124; engine.rangedCritChance = 0;
    engine.player.ammo = 5; engine.player.isFiring = true;
    const origin = engine.toScreen(0, 0), angle = degrees * Math.PI / 180;
    engine.mouse.screenX = origin.x + Math.cos(angle) * 140; engine.mouse.screenY = origin.y + Math.sin(angle) * 140;
    (engine as any).update(0.001);
    // The target is eight world cells away; muzzle offset0.8 leaves7.2 cells of falloff.
    expect(monster.hp).toBe(914); expect(engine.rangedDamage).toBe(124);
  });
});

describe('authoritative ammunition projection', () => {
  it.each([[23, 58, 23, 35], [30, 10, 10, 0], [23, 0, 0, 0], [0, 58, 0, 58]])('splits a %s-round magazine and server total%s into%s loaded and%s reserve', (current, total, loaded, reserve) => {
    const { engine } = setup(); engine.player.ammo = current; engine.player.reserveAmmo = 999;
    engine.setAuthoritativeAmmo(total);
    expect(engine.player.ammo).toBe(loaded); expect(engine.player.reserveAmmo).toBe(reserve);
    expect(engine.player.ammo + engine.player.reserveAmmo).toBe(total);
  });
  it('keeps the real total through reloads, repeated snapshots and exhaustion', () => {
    const { engine } = setup(); engine.player.ammo = 23;
    engine.setAuthoritativeAmmo(58); engine.reloadWeapon(); engine.setAuthoritativeAmmo(58);
    expect(engine.player).toMatchObject({ ammo: 30, reserveAmmo: 28 });
    engine.player.ammo = 0; engine.setAuthoritativeAmmo(3); engine.reloadWeapon(); engine.setAuthoritativeAmmo(3);
    expect(engine.player).toMatchObject({ ammo: 3, reserveAmmo: 0 });
    engine.setAuthoritativeAmmo(0); engine.reloadWeapon();
    expect(engine.player).toMatchObject({ ammo: 0, reserveAmmo: 0 });
  });
});

describe('authoritative death bags', () => {
  const bag = { id: 'drop_player', name: '幸存者的掉落背包', mapId: 'home_self', x: 0, y: 0 } as const;
  function camp() { const result = setup(); result.engine.warpToMap('home_self'); return result.engine; }

  it('removes missing bags while preserving authored boxes and resources', () => {
    const engine = camp();
    const authored = { id: 'drop_authored', name: '遗迹箱子', type: 'box', x: 1, y: 0, radius: 2, available: true, prompt: '搜索' } as const;
    engine.interactables.push(authored);
    engine.setAuthoritativeDrops([bag]);
    const target = engine.interactables.find(it => it.id === bag.id)!;
    expect(target).toMatchObject({ type: 'box', stock: 1, searchDuration: 0.6, x: 0, y: 0 });
    engine.nearestInteractable = target;
    engine.setAuthoritativeDrops([]);
    expect(engine.interactables).toEqual([authored]);
    expect(engine.nearestInteractable).toBeNull();
  });

  it('keeps a surviving bag and its active search through repeated snapshots', () => {
    const engine = camp(); engine.setAuthoritativeDrops([bag]);
    const target = engine.interactables[0];
    engine.isLooting = true; engine.lootProgress = 0.5;
    Object.assign(engine as any, { lootTarget: target, lootingTimer: 0.3 });
    engine.setAuthoritativeDrops([{ ...bag, name: '更新的名字', x: 1 }]);
    expect(engine.interactables).toHaveLength(1);
    expect(engine.interactables[0]).toBe(target);
    expect(target).toMatchObject({ name: '更新的名字', x: 1 });
    expect((engine as any).lootTarget).toBe(target);
    expect(engine.isLooting).toBe(true); expect(engine.lootProgress).toBe(0.5);
    expect((engine as any).lootingTimer).toBe(0.3);
  });

  it('cancels a removed bag search before it can send a stale search action', () => {
    const engine = camp(); engine.setAuthoritativeDrops([bag]);
    const action = vi.fn(); (engine as any).callbacks.onGameAction = action;
    engine.isLooting = true; engine.lootProgress = 0.5;
    Object.assign(engine as any, { lootTarget: engine.interactables[0], lootingTimer: 0.3 });
    engine.setAuthoritativeDrops([]);
    expect(engine.isLooting).toBe(false); expect(engine.lootProgress).toBe(0);
    expect((engine as any).lootTarget).toBeNull(); expect((engine as any).lootingTimer).toBe(0);
    (engine as any).update(0.4);
    expect(action).not.toHaveBeenCalled();
  });

  it('does not interrupt an unrelated resource search when a bag disappears', () => {
    const engine = camp(); engine.setAuthoritativeDrops([bag]);
    const resource = { id: 'tree', type: 'tree' };
    engine.isLooting = true; engine.lootProgress = 0.5;
    Object.assign(engine as any, { lootTarget: resource, lootingTimer: 0.3 });
    engine.setAuthoritativeDrops([]);
    expect(engine.isLooting).toBe(true); expect(engine.lootProgress).toBe(0.5);
    expect((engine as any).lootTarget).toBe(resource);
  });

  it('retains a world bag once when the loaded chunk window changes', () => {
    const { engine } = setup(); engine.setAuthoritativeDrops([{ ...bag, mapId: 'world', x: 32 }]);
    const target = engine.interactables.find(it => it.id === bag.id)!;
    engine.player.x = 33; (engine as any).refreshWorld();
    engine.setAuthoritativeBuildings([]);
    expect(engine.interactables.filter(it => it.id === bag.id)).toEqual([target]);
    engine.setAuthoritativeDrops([]); engine.setAuthoritativeBuildings([]);
    expect(engine.interactables.some(it => it.id === bag.id)).toBe(false);
  });

  it('forgets old bags on map changes and ignores foreign-map bags', () => {
    const engine = camp(); engine.setAuthoritativeDrops([bag]);
    engine.nearestInteractable = engine.interactables[0];
    engine.warpToMap('world');
    expect(engine.nearestInteractable).toBeNull();
    engine.setAuthoritativeDrops([bag]);
    expect(engine.interactables.some(it => it.id === bag.id)).toBe(false);
    engine.warpToMap('home_self'); engine.setAuthoritativeDrops([{ ...bag, mapId: 'world' }]);
    expect(engine.interactables).toEqual([]);
    engine.warpToMap('world');
    expect(engine.interactables.some(it => it.id === bag.id)).toBe(false);
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
  it('shares one backing surface across every sample of a terrain variant without rebaking a cached cell', () => {
    const { engine } = setup(); stubImageLoading();
    const image = (engine as any).artImage('tile-forest-a.png'); image.complete = true; image.dispatchEvent(new Event('load'));
    const patch = (x: number, y: number) => (engine as any).tilePatch('forest', 'a', x, y);
    const first = patch(0, 0), second = patch(64, 128);
    expect(second).toBe(first);
    const draws = first.getContext('2d').drawImage.mock.calls.length;
    expect(patch(64, 128)).toBe(first);
    expect(first.getContext('2d').drawImage.mock.calls.length).toBe(draws);
    expect((engine as any).tilePatchCache.size).toBe(1);
  });

  it.each([
    { x: 2, y: 4, sourceX: 67, sourceY: 133 },
    { x: -2, y: -4, sourceX: 397, sourceY: 331 },
  ])('uses the padded source cell at $x,$y instead of drawing an entire atlas', ({ x, y, sourceX, sourceY }) => {
    const { engine, context } = setup(); stubImageLoading();
    const image = (engine as any).artImage('tile-forest-a.png'); image.complete = true; image.dispatchEvent(new Event('load'));
    (engine as any).drawTileTexture(x, y, 100, 150, 'forest');
    expect(context.drawImage.mock.calls.at(-1)?.slice(1)).toEqual([sourceX, sourceY, 64, 64, 68, 118, 64, 64]);
  });

  it('bounds all terrain samples to twenty atlas surfaces and releases their scratch surface on disposal', () => {
    const { engine } = setup(); stubImageLoading();
    for (const theme of ['camp', 'plaza', 'field', 'urban', 'ruins', 'forest', 'quarry', 'lake', 'marsh', 'rift']) for (const variant of ['a', 'b']) {
      const image = (engine as any).artImage(`tile-${theme}-${variant}.png`); image.complete = true; image.dispatchEvent(new Event('load'));
      for (let x = 0; x < 448; x += 64) for (let y = 0; y < 448; y += 64) (engine as any).tilePatch(theme, variant, x, y);
    }
    const atlases = [...(engine as any).tilePatchCache.values()] as HTMLCanvasElement[], scratch = (engine as any).tilePatchScratch;
    expect(atlases).toHaveLength(20);
    expect(atlases.every(c => c.width === 462 && c.height === 462)).toBe(true);
    expect(atlases.every(c => (engine as any).tilePatchCells.get(c).size === 49)).toBe(true);
    engine.dispose();
    expect(atlases.every(c => c.width === 0 && c.height === 0)).toBe(true);
    expect(scratch.width).toBe(0); expect(scratch.height).toBe(0);
    expect((engine as any).tilePatchScratch).toBeNull();
    expect((engine as any).tilePatchCells.get(atlases[0])).toBeUndefined();
  });

  it('draws a wetland approach visible from a narrow road view even when the house is offscreen', () => {
    const { engine } = setup();
    const render = (engine as any).render;
    for (const name of Object.getOwnPropertyNames(IsometricEngine.prototype)) {
      if (name !== 'render' && /^(render|draw)/.test(name)) vi.spyOn(engine as any, name).mockImplementation(() => {});
    }
    (engine as any).width = 390; (engine as any).height = 844;
    engine.currentMapId = 'world';
    engine.camera = { x: 0, y: 0 };
    const road = engine.toScreen(0, 220);
    engine.camera = { x: 195 - road.x, y: 422 - road.y };
    const room = (prefix: string, x: number, y: number) => buildCompoundWalls({ idPrefix: prefix, cx: x, cy: y, w: 12, h: 8, wallType: 'wood_wall', wallName: '墙', ownerName: '遗迹', doorSide: 'S', doorType: 'door', doorName: '入口' }).map(b => ({ ...b, id: b.id.replace(prefix + '_', prefix + ':') }));
    const near = room('world:0:6:poi', 24, 216);
    engine.buildings = [...near, ...room('world:-1:10:poi', -24, 344)];
    const platform = vi.spyOn(houseRenderer, 'drawWaterHousePlatform').mockImplementation(() => {});
    render.call(engine);
    expect(platform).toHaveBeenCalledTimes(1);
    expect(platform.mock.calls[0][1]).toEqual(near);
    expect((engine as any).drawHouse).not.toHaveBeenCalled();
  });

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

  it('keeps three floor materials in the ground layout without casting separate building shadows over them', () => {
    const { engine } = setup();
    const render = (engine as any).render;
    for (const name of Object.getOwnPropertyNames(IsometricEngine.prototype)) {
      if (name !== 'render' && /^(render|draw)/.test(name)) vi.spyOn(engine as any, name).mockImplementation(() => {});
    }
    engine.currentMapId = 'home_owner'; engine.camera = { x: 0, y: 0 };
    const base = { hp: 300, maxHp: 300, level: 1, mapId: 'home_owner', ownerId: 'owner', y: 0 };
    const floors = ['wood_floor', 'stone_floor', 'iron_floor'].map((type, x) => ({ ...base, id: 'build_' + type, name: type, type, x }));
    const storage = { ...base, id: 'build_storage', type: 'storage_box', name: '仓库', x: 1 };
    const wall = { ...base, id: 'build_wall', type: 'wood_wall', name: '墙', x: 3 };
    const buildings = [...floors, storage, wall];
    engine.setAuthoritativeBuildings(buildings as any);
    render.call(engine);
    expect((engine as any).drawBuilding.mock.calls.map(([b]: any[]) => b.id)).toEqual([storage.id, wall.id]);
    expect([...engine.placedFloors.values()]).toEqual(floors.map(b => ({ x: b.x, y: b.y, type: b.type })));
    expect(engine.buildings).toEqual(buildings);
    expect((engine as any).renderMapGround).toHaveBeenCalledOnce();
  });

  it('shares wall artwork across positions while separating damage, orientation, material and hostility', () => {
    const { engine, context, doc } = setup();
    const gradient = () => ({ addColorStop: vi.fn() });
    (context as any).createRadialGradient = gradient;
    const surfaces: ReturnType<typeof makeCanvas>[] = [];
    vi.spyOn(doc, 'createElement').mockImplementation(() => {
      const surface = makeCanvas(); (surface.getContext() as any).createRadialGradient = gradient; surfaces.push(surface); return surface;
    });
    engine.currentMapId = 'home_owner'; engine.localPlayerId = 'owner';
    const wall = { id: 'build_wall', type: 'wood_wall', x: 0, y: 0, hp: 350, maxHp: 350, ownerId: 'owner', facing: 'ew' };
    for (let x = 0; x < 5; x++) (engine as any).drawBuilding({ ...wall, id: 'build_' + x, x });
    expect(context.drawImage).toHaveBeenCalledTimes(5);
    expect(surfaces).toHaveLength(1);
    for (const change of [{ hp: 100 }, { maxHp: 700 }, { facing: 'ns' }, { type: 'stone_wall' }]) (engine as any).drawBuilding({ ...wall, ...change });
    engine.localPlayerId = 'visitor'; (engine as any).drawBuilding(wall);
    expect(surfaces).toHaveLength(6);
    engine.localPlayerId = 'owner'; (engine as any).drawBuilding(wall);
    expect(surfaces).toHaveLength(6);
    expect((engine as any).ctx).toBe(context);
  });

  it('bounds wall artwork allocations while recycling evicted pixels and releasing reset and disposed surfaces', () => {
    const { engine, context, doc } = setup();
    const gradient = () => ({ addColorStop: vi.fn() }); (context as any).createRadialGradient = gradient;
    const surfaces: ReturnType<typeof makeCanvas>[] = [];
    vi.spyOn(doc, 'createElement').mockImplementation(() => {
      const surface = makeCanvas(); (surface.getContext() as any).createRadialGradient = gradient; surfaces.push(surface); return surface;
    });
    const wall = { id: 'build_wall', type: 'iron_wall', x: 0, y: 0, maxHp: 850, facing: 'ns' };
    for (let hp = 850; hp > 800; hp--) (engine as any).drawBuilding({ ...wall, hp });
    const live = () => surfaces.filter(c => c.width > 0 && c.height > 0);
    expect(live()).toHaveLength(32);
    expect(surfaces).toHaveLength(32);
    expect(live().reduce((n, c) => n + c.width * c.height * 4, 0)).toBeLessThanOrEqual(32 * 128 * 96 * 4);
    expect(surfaces.reduce((n, c) => n + (c.getContext() as any).clearRect.mock.calls.length, 0)).toBeGreaterThanOrEqual(18);
    (engine as any).resetGraphics(); expect(live()).toHaveLength(0);
    (engine as any).drawBuilding({ ...wall, hp: 850 }); expect(live()).toHaveLength(1);
    engine.dispose(); expect(live()).toHaveLength(0);
  });

  it('restores the live canvas after failed wall baking and falls back when a surface has no context', () => {
    const { engine, context, doc } = setup();
    const gradient = () => ({ addColorStop: vi.fn() }); (context as any).createRadialGradient = gradient;
    const surface = makeCanvas(); (surface.getContext() as any).createRadialGradient = gradient;
    const create = vi.spyOn(doc, 'createElement').mockReturnValue(surface);
    const wall = { id: 'build_wall', type: 'wood_wall', x: 0, y: 0, hp: 350, maxHp: 350 };
    const hp = vi.spyOn(engine as any, 'drawBuildingHp').mockImplementationOnce(() => { throw Error('paint failed'); });
    expect(() => (engine as any).drawBuilding(wall)).toThrow('paint failed');
    expect((engine as any).ctx).toBe(context); expect(surface.width).toBe(0); expect(surface.height).toBe(0);
    hp.mockRestore();
    create.mockReturnValue({ ...makeCanvas(), getContext: () => null } as any);
    expect(() => (engine as any).drawBuilding(wall)).not.toThrow();
    expect(context.fill).toHaveBeenCalled(); expect(context.drawImage).not.toHaveBeenCalled();
    expect((engine as any).ctx).toBe(context);
    create.mockClear(); (engine as any).drawBuilding({ ...wall, type: 'door', isOpen: true });
    expect(create).not.toHaveBeenCalled();
  });

  it('keeps nearby wall labels and damage smoke dynamic instead of copying them between matching walls', () => {
    const { engine, context, doc } = setup();
    const gradient = () => ({ addColorStop: vi.fn() }); (context as any).createRadialGradient = gradient;
    const surfaces: ReturnType<typeof makeCanvas>[] = [];
    vi.spyOn(doc, 'createElement').mockImplementation(() => {
      const surface = makeCanvas(); (surface.getContext() as any).createRadialGradient = gradient; surfaces.push(surface); return surface;
    });
    const a = { id: 'build_a', type: 'wood_wall', name: '甲墙', ownerName: '甲', ownerId: 'owner', level: 2, x: 0, y: 0, hp: 100, maxHp: 350 } as any;
    const b = { ...a, id: 'build_b', name: '乙墙', ownerName: '乙', level: 3, x: 1 };
    engine.localPlayerId = 'owner'; engine.nearestBuilding = a;
    (engine as any).drawBuilding(a); (engine as any).drawBuilding(b);
    expect(surfaces).toHaveLength(1);
    expect((context as any).fillText.mock.calls.map((call: any[]) => call[0])).toEqual(['甲墙 · 甲 Lv.2']);
    expect((surfaces[0].getContext() as any).fillText).not.toHaveBeenCalled();
    const firstArc = (context as any).arc.mock.calls[0];
    engine.nearestBuilding = b; (engine as any).gameTime += 1;
    (engine as any).drawBuilding(b);
    expect((context as any).fillText.mock.calls.at(-1)[0]).toBe('乙墙 · 乙 Lv.3');
    expect((context as any).arc.mock.calls.at(-2)).not.toEqual(firstArc);
    engine.nearestBuilding = null; (context as any).fillText.mockClear(); (context as any).arc.mockClear();
    (engine as any).drawBuilding(a);
    expect((context as any).fillText).not.toHaveBeenCalled(); expect((context as any).arc).not.toHaveBeenCalled();
  });

  it('aligns cached wall pixels with fractional camera movement while reusing a phase across positions', () => {
    const { engine, context, doc } = setup();
    const gradient = () => ({ addColorStop: vi.fn() }); (context as any).createRadialGradient = gradient;
    const surfaces: ReturnType<typeof makeCanvas>[] = [];
    vi.spyOn(doc, 'createElement').mockImplementation(() => {
      const surface = makeCanvas(); (surface.getContext() as any).createRadialGradient = gradient; surfaces.push(surface); return surface;
    });
    const wall = { id: 'build_a', type: 'wood_wall', x: 0, y: 0, hp: 350, maxHp: 350 };
    (engine as any).drawBuilding(wall); engine.camera.x += 0.25; engine.camera.y += 0.5;
    (engine as any).drawBuilding(wall); (engine as any).drawBuilding({ ...wall, id: 'build_b', x: 3 });
    expect(surfaces).toHaveLength(2);
    expect(context.drawImage.mock.calls.every(call => Number.isInteger(call[1]) && Number.isInteger(call[2]))).toBe(true);
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

  function groundAtQuarryEdge() {
    const result = setup(); stubImageLoading();
    const { engine } = result;
    (engine as any).width = 1920; (engine as any).height = 1080;
    engine.camera = { x: -(4.4 - 7) * 32, y: -(4.4 + 7) * 16 };
    (engine as any).renderMapGround();
    const image = (engine as any).artImage('tile-quarry-a.png');
    const load = () => { image.complete = true; image.dispatchEvent(new Event('load')); };
    return { ...result, load, cache: (engine as any).groundCache };
  }

  it('repaints only newly loaded terrain at the cached camera anchor without resetting the whole surface', () => {
    const { engine, cache, load } = groundAtQuarryEdge();
    const anchor = { x: cache.x, y: cache.y }, size = { width: cache.canvas.width, height: cache.canvas.height };
    const paint = vi.spyOn(engine as any, 'renderMapGroundUncached');
    engine.camera.x += 24; load(); (engine as any).renderMapGround();
    expect(paint).toHaveBeenCalledTimes(1);
    const region = paint.mock.calls[0][1] as { x: number; y: number; width: number; height: number };
    expect(region).toBeDefined();
    expect(region.width * region.height).toBeLessThan(size.width * size.height / 2);
    expect({ x: cache.x, y: cache.y }).toEqual(anchor);
    expect({ width: cache.canvas.width, height: cache.canvas.height }).toEqual(size);
    paint.mockClear(); (engine as any).renderMapGround(); expect(paint).not.toHaveBeenCalled();
  });

  it('keeps unrelated offscreen tile loads from repainting the ground', () => {
    const { engine } = groundAtQuarryEdge();
    const paint = vi.spyOn(engine as any, 'renderMapGroundUncached');
    const image = (engine as any).artImage('tile-rift-a.png'); image.complete = true; image.dispatchEvent(new Event('load'));
    (engine as any).renderMapGround();
    expect(paint).not.toHaveBeenCalled();
  });

  it('combines new tile availability with normal scroll edges instead of rebuilding the entire ground', () => {
    const { engine, cache, load } = groundAtQuarryEdge();
    const paint = vi.spyOn(engine as any, 'renderMapGroundUncached');
    const previous = { x: cache.x, y: cache.y };
    engine.camera.x -= 160; engine.camera.y += 140; load(); (engine as any).renderMapGround();
    expect(cache.x).toBe(previous.x - 160); expect(cache.y).toBe(previous.y + 140);
    expect(paint.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(paint.mock.calls.every(call => call[1] !== undefined)).toBe(true);
    expect(cache.canvas.getContext('2d').drawImage.mock.calls.find((call: unknown[]) => call[0] === cache.canvas)).toEqual([cache.canvas, -160, 140]);
  });

  it('retains full texture refresh in separate animated maps', () => {
    const { engine } = setup(); stubImageLoading(); engine.currentMapId = 'marsh_docks';
    (engine as any).renderMapGround();
    const paint = vi.spyOn(engine as any, 'renderMapGroundUncached');
    const image = (engine as any).artImage('tile-marsh-a.png'); image.complete = true; image.dispatchEvent(new Event('load'));
    (engine as any).renderMapGround();
    expect(paint).toHaveBeenCalledTimes(1);
    expect(paint.mock.calls[0][1]).toBeUndefined();
  });

  it('replaces a B tile fallback after loading without discarding other variants or terrains', () => {
    const { engine } = setup(); stubImageLoading();
    const forest = (engine as any).artImage('tile-forest-a.png');
    const quarry = (engine as any).artImage('tile-quarry-a.png');
    for (const image of [forest, quarry]) { image.complete = true; image.dispatchEvent(new Event('load')); }
    const patch = (theme: string, variant: string) => (engine as any).tilePatch(theme, variant, 0, 0);
    const forestA = patch('forest', 'a'), oldForestB = patch('forest', 'b');
    expect((engine as any).tilePatchScratch.getContext('2d').drawImage.mock.calls.at(-1)[0]).toBe(forest);
    const quarryA = patch('quarry', 'a');
    const forestB = (engine as any).artImage('tile-forest-b.png');
    forestB.complete = true; forestB.dispatchEvent(new Event('load'));
    expect(patch('forest', 'a')).toBe(forestA);
    expect(patch('quarry', 'a')).toBe(quarryA);
    const replaced = patch('forest', 'b');
    expect(replaced).not.toBe(oldForestB);
    expect((engine as any).tilePatchScratch.getContext('2d').drawImage.mock.calls.at(-1)[0]).toBe(forestB);
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
    stubImageLoading();
    const image = (engine as any).artImage('tile-forest-a.png'); image.complete = true; image.dispatchEvent(new Event('load'));
    const atlas = (engine as any).tilePatch('forest', 'a', 0, 0), scratch = (engine as any).tilePatchScratch;
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
    expect(atlas.width).toBe(0); expect(scratch.width).toBe(0);
    expect((engine as any).tilePatchScratch).toBeNull();
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

  it.each([[64, 28], [96, 44], [128, 60]])('uses the closer %s-cell camp exit and suppresses the competing building prompt', (size, exitY) => {
    const { engine, context } = setup(); const portal = vi.fn(() => true), raid = vi.fn(), labels = vi.fn();
    Object.assign((engine as any).callbacks, { onGameAction: vi.fn(), onCampInteract: portal, onOpenRaidModal: raid });
    engine.localPlayerId = 'self'; engine.warpToMap('home_other', 0, exitY - 0.5); engine.campSize = size;
    const building = { id: 'storage', type: 'storage_box', name: '仓库', x: 1, y: exitY - 2, hp: 400, maxHp: 400, ownerId: 'other', mapId: engine.currentMapId } as any;
    engine.buildings = [building]; engine.nearestBuilding = building; (context as any).fillText = labels;
    engine.triggerInteraction(); (engine as any).renderInteractionHUD();
    expect(portal).toHaveBeenCalledTimes(1); expect(raid).not.toHaveBeenCalled();
    expect(labels).not.toHaveBeenCalled();
  });

  it.each([[64, 28], [96, 44], [128, 60]])('allows the %s-cell exit at exactly three cells and rejects a farther interaction', (size, exitY) => {
    const { engine } = setup(); const portal = vi.fn(() => true);
    Object.assign((engine as any).callbacks, { onGameAction: vi.fn(), onCampInteract: portal });
    engine.warpToMap('home_other', 0, exitY - 3); engine.campSize = size;
    engine.nearestBuilding = null; engine.nearestInteractable = null;
    engine.triggerInteraction(); expect(portal).toHaveBeenCalledTimes(1);
    portal.mockClear(); engine.player.y -= 0.01;
    engine.triggerInteraction(); expect(portal).not.toHaveBeenCalled();
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
    engine.player.x = 104.5;
    engine.triggerInteraction();
    expect(portal).toHaveBeenCalledTimes(2);
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
