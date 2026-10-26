import { expect, it } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld, type WorldRules } from './worldState';
import type { BuildingEntity, MonsterEntity } from '../src/types/game';
import { makeItem } from '../src/game/items';
import { isPositionBlocked } from '../src/game/navigation';

const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
const beast = (id: string, x: number): MonsterEntity => ({ id, name: '测试兽', x, y: 0, spawnX: x, spawnY: 0, hp: 100, maxHp: 100, speed: 1, damage: 10, state: 'roam', animTime: 0, attackCooldown: 0 });
const door = (id: string, x: number, isOpen = false): BuildingEntity => ({ id, name: '公共门', type: 'door', x, y: 0, mapId: 'world', ownerId: 'public', hp: 100, maxHp: 100, level: 1, isOpen });
function setup(overrides: Partial<WorldRules> = {}) {
  let time = 10_000;
  const db = createMemoryDb(), game = new GameWorld(db, { ...rules, ...overrides }, () => time);
  game.connect('p', '探索者'); Object.assign(game.state.players.p, { x: 2, y: 0, shield: 0 });
  return { game, db, advance: () => { time += 200; }, now: () => time };
}

it.each([0, 1, 16])('reads sleeping-camp buildings at most once during a phase with %i public NPCs', count => {
  const { game } = setup(); let reads = 0;
  game.state.buildings.sleeping = { ...door('sleeping', 0), get mapId() { reads++; return 'home_offline' as const; } };
  for (let i = 0; i < count; i++) game.state.monsters[`m${i}`] = beast(`m${i}`, 0);
  game.tick();
  expect(reads).toBe(Math.min(1, count));
  expect(game.state.players.p.hp).toBe(100);
  expect(Object.keys(game.state.monsters)).toHaveLength(count);
});

it.each(['distant', 'waiting'])('does not enumerate buildings when all public monsters are %s', mode => {
  const { game } = setup(); let reads = 0;
  game.state.buildings.sleeping = { ...door('sleeping', 0), get mapId() { reads++; return 'home_offline' as const; } };
  for (let i = 0; i < 16; i++) game.state.monsters[`m${i}`] = mode === 'distant' ? beast(`m${i}`, 200) : { ...beast(`m${i}`, 0), hp: 0, state: 'dead', respawnAt: 20_000 };
  game.tick(); expect(reads).toBe(0); expect(game.state.players.p.hp).toBe(100);
});

it('keeps per-NPC public overrides and refreshes direct edits and dictionary replacement next phase', () => {
  const generated = [door('gate-a', 1, true), door('gate-b', 201)];
  const { game, advance } = setup({ buildingsNear: (x, y) => generated.filter(b => Math.hypot(b.x - x, b.y - y) < 55) });
  game.connect('q', '远处探索者'); Object.assign(game.state.players.q, { x: 202, y: 0 });
  game.state.buildings = Object.assign(Object.create({ ghost: door('ghost', 201) }), {
    'gate-a': door('gate-a', 1), 'gate-b': { ...door('gate-b', 201), hp: 0 },
    elsewhere: { ...door('elsewhere', 0), mapId: 'home_offline' as const }, far: door('far', 800),
  });
  const reset = () => { game.state.monsters.a = beast('a', 0); game.state.monsters.b = beast('b', 200); };
  reset(); advance(); game.tick();
  expect(game.state.monsters.a.targetId).toBeUndefined();
  expect(game.state.monsters.b.targetId).toBe('q'); expect(game.state.monsters.b.x).toBeGreaterThan(200);
  game.state.buildings['gate-a'].isOpen = true;
  reset(); advance(); game.tick();
  expect(game.state.monsters.a.targetId).toBe('p'); expect(game.state.monsters.a.x).toBeGreaterThan(0);
  game.state.buildings = { 'gate-a': door('gate-a', 1, true) };
  reset(); advance(); game.tick();
  expect(game.state.monsters.a.targetId).toBe('p'); expect(game.state.monsters.b.targetId).toBeUndefined();
  generated[0].isOpen = false;
  delete game.state.buildings['gate-a'];
  reset(); advance(); game.tick(); expect(game.state.monsters.a.targetId).toBeUndefined();
});

it.each([false, true])('uses current spawn collisions and skips distant later monsters after lethal damage (bed=%s)', bed => {
  const { game, advance } = setup(); const p = game.state.players.p;
  Object.assign(p, { x: 100, y: 0, hp: 5 }); p.resources.wood = 3;
  p.inventory = p.inventory.map(() => null); p.inventory[0] = makeItem('food', 2);
  if (bed) {
    p.campId = 'home_p';
    game.state.camps.home_p = { id: 'home_p', ownerId: 'p', ownerName: p.name, x: 300, y: 300, mapId: 'world', size: 64, members: [], state: 'active' };
    game.state.buildings.bed = { ...door('bed', 5), type: 'bed', y: 5, mapId: 'home_p', ownerId: 'p' };
    game.state.buildings.spawnDoor = { ...door('spawnDoor', 5), y: 6, mapId: 'home_p', ownerId: 'p' };
    game.state.buildings.core = { ...door('core', 20), type: 'anchor_core', y: 20, hp: 1200, maxHp: 1200, mapId: 'home_p', ownerId: 'p' };
  }
  game.state.monsters.first = { ...beast('first', 101), state: 'attack', windup: .1, targetId: 'p' };
  game.state.monsters.later = beast('later', 103);
  advance(); game.tick();
  expect(p.mapId).toBe(bed ? 'home_p' : 'world'); expect(p.hp).toBe(p.maxHp); expect(p.satiety).toBe(40);
  expect(p.resources.wood).toBe(0); expect(p.inventory.every(item => !item)).toBe(true);
  expect(game.state.monsters.later).toMatchObject({ x: 103, y: 0, animTime: 0, state: 'roam' });
  expect(game.state.monsters.later.targetId).toBeUndefined();
  const drops = Object.values(game.state.drops); expect(drops).toHaveLength(1);
  expect(drops[0]).toMatchObject({ x: 100, y: 0, mapId: 'world', items: [{ itemId: 'food', count: 2 }, { itemId: 'wood', count: 3 }] });
  if (bed) {
    expect([p.x, p.y]).not.toEqual([5, 6]);
    expect(isPositionBlocked(p.x, p.y, Object.values(game.state.buildings).filter(b => b.mapId === 'home_p'))).toBe(false);
  } else expect([p.x, p.y]).toEqual([0, 0]);
});

it('discards the phase view after failed shared save, honors a changed door, and persists one later hit', () => {
  const { game, db, advance, now } = setup();
  Object.assign(game.state.players.p, { x: 2, y: 0 });
  game.state.buildings.gate = door('gate', 1.5, true);
  game.state.monsters.hit = { ...beast('hit', 1), windup: .1, state: 'attack', targetId: 'p' };
  game.state.monsters.other = beast('other', 500);
  game.persist(); const before = structuredClone(game.state), save = db.checkpointWorld;
  db.checkpointWorld = () => { throw Error('NPC checkpoint rejected'); };
  advance(); expect(() => game.tick()).toThrow('NPC checkpoint rejected');
  expect(game.state).toEqual(before); expect(JSON.parse(db.getMeta('authoritative-world-v2')!)).toEqual(before);
  db.checkpointWorld = save; game.state.buildings.gate.isOpen = false;
  game.tick(); expect(game.state.players.p.hp).toBe(100);
  game.state.buildings.gate.isOpen = true; game.state.monsters.hit.windup = .1;
  advance(); game.tick(); expect(game.state.players.p.hp).toBe(90);
  const restored = new GameWorld(db, rules, now); restored.connect('p', '探索者'); restored.tick();
  expect(restored.state.players.p.hp).toBe(90); expect(restored.state.buildings.gate.isOpen).toBe(true);
});
