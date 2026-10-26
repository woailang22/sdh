import { expect, it } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld, type WorldRules } from './worldState';
import type { BuildingEntity } from '../src/types/game';

const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };

function setup(count: number) {
  const db = createMemoryDb();
  const game = new GameWorld(db, rules, () => 10_000);
  for (let i = 0; i < count; i++) {
    const ownerId = `owner${i}`, mapId = `home_${ownerId}` as const;
    game.connect(ownerId, ownerId); game.connect(`guest${i}`, '来访者');
    game.state.camps[mapId] = { id: mapId, ownerId, ownerName: ownerId, x: 100 + i * 20, y: 100, mapId: 'world', size: 64, members: [], state: 'active' };
    Object.assign(game.state.players[ownerId], { mapId, campId: mapId, x: -3, y: 0 });
    Object.assign(game.state.players[`guest${i}`], { mapId, x: 2, y: 0 });
    const building = (id: string, type: BuildingEntity['type'], x: number, y: number): BuildingEntity => ({ id, type, name: id, x, y, hp: 300, maxHp: 300, level: 1, mapId, ownerId });
    for (const b of [building(`core${i}`, 'anchor_core', 10, 10), building(`turret${i}`, 'turret', 0, 0)]) game.state.buildings[b.id] = b;
    game.state.ammo[`turret${i}`] = 0;
  }
  return { game, db };
}

it.each([0, 1, 12])('does not rescan sleeping buildings across %i active camps while defenses have no ammunition', count => {
  const { game } = setup(count);
  let sleepingSpaceReads = 0;
  game.state.buildings.sleeping = { id: 'sleeping', type: 'turret', name: '无人营地防御', x: 0, y: 0, hp: 300, maxHp: 300, level: 1, ownerId: 'offline', get mapId() { sleepingSpaceReads++; return 'home_offline' as const; } };
  game.state.ammo.sleeping = 10;
  const before = structuredClone(game.state); sleepingSpaceReads = 0;
  expect(game.tick()).toBe(false);
  expect(sleepingSpaceReads).toBe(Math.min(1, count));
  expect(game.state).toEqual(before);
  expect(game.state.ammo.sleeping).toBe(10);
  expect(game.state.defenseAt).toEqual({});
});

it('keeps simultaneous camp defense isolated, including walls, dead defenses, ammunition and persisted cooldowns', () => {
  const { game, db } = setup(3);
  for (let i = 0; i < 3; i++) game.state.ammo[`turret${i}`] = 3;
  game.state.buildings.wall = { id: 'wall', type: 'wood_wall', name: '遮挡墙', x: 1, y: 0, hp: 300, maxHp: 300, level: 1, mapId: 'home_owner1', ownerId: 'owner1' };
  game.state.buildings.turret2.hp = 0;
  expect(game.tick()).toBe(true);
  expect(game.state.players.guest0.hp).toBe(88);
  expect(game.state.players.guest1.hp).toBe(100);
  expect(game.state.players.guest2.hp).toBe(100);
  expect([0, 1, 2].map(i => game.state.players[`owner${i}`].hp)).toEqual([100, 100, 100]);
  expect(game.state.ammo).toEqual({ turret0: 2, turret1: 3, turret2: 3 });
  expect(game.state.defenseAt).toEqual({ turret0: 10_000 });
  const saved = JSON.parse(db.getMeta('authoritative-world-v2')!);
  expect(saved.ammo).toEqual(game.state.ammo);
  expect(saved.defenseAt).toEqual(game.state.defenseAt);
  expect(saved.players.guest0.hp).toBe(88);
  game.tick();
  expect(game.state.ammo).toEqual({ turret0: 2, turret1: 3, turret2: 3 });
  expect(game.state.players.guest0.hp).toBe(88);
});

it('rolls back every active camp after a rejected shared save and retries each shot once', () => {
  const { game, db } = setup(2);
  game.state.ammo.turret0 = game.state.ammo.turret1 = 3;
  game.persist();
  const before = structuredClone(game.state), save = db.checkpointWorld;
  db.checkpointWorld = () => { throw Error('multi-camp checkpoint rejected'); };
  expect(() => game.tick()).toThrow('multi-camp checkpoint rejected');
  expect(game.state).toEqual(before);
  expect(JSON.parse(db.getMeta('authoritative-world-v2')!)).toEqual(before);
  db.checkpointWorld = save;
  expect(game.tick()).toBe(true);
  expect(game.state.ammo).toEqual({ turret0: 2, turret1: 2 });
  expect(game.state.defenseAt).toEqual({ turret0: 10_000, turret1: 10_000 });
  expect([game.state.players.guest0.hp, game.state.players.guest1.hp]).toEqual([88, 88]);
  const restored = new GameWorld(db, rules, () => 10_000);
  restored.connect('guest0', '来访者'); restored.connect('guest1', '来访者');
  restored.tick();
  expect(restored.state.ammo).toEqual({ turret0: 2, turret1: 2 });
  expect([restored.state.players.guest0.hp, restored.state.players.guest1.hp]).toEqual([88, 88]);
});
