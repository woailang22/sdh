import { describe, expect, it } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld, type WorldRules, type PersistedWorld } from './worldState';
import { makeItem } from '../src/game/items';
import type { MonsterEntity, WeatherType } from '../src/types/game';

const tree = { id: 'tree_1', name: '树', type: 'tree' as const, x: 1, y: 0, radius: 1, prompt: '', available: true, stock: 2, maxStock: 2, respawnSec: 60 };
const box = { ...tree, id: 'box_1', type: 'box' as const, lootTable: [{ itemId: 'wp_p1911', name: '手枪', count: 1 }] };
const rules: WorldRules = {
  nodeAt: id => id === tree.id ? tree : id === box.id ? box : undefined,
  nodesNear: () => [tree, box], buildingsNear: () => [],
  campSiteAllowed: (x, y) => Math.hypot(x, y) > 48,
  migrate: (_mapId, x, y) => ({ mapId: 'world' as const, x: x + 100, y }),
  monstersNear: () => [],
};
describe('cached public building definitions', () => {
  it('rolls back a failed door save without mutating the cached definition', () => {
    const door = { id: 'public_door', type: 'door' as const, name: '门', x: 1, y: 0, hp: 100, maxHp: 100, level: 1, mapId: 'world' as const, isOpen: false, isLocked: false };
    const db = createMemoryDb();
    const game = new GameWorld(db, { ...rules, buildingsNear: () => [door] }, () => 10000);
    game.connect('p', '行者');
    const save = db.setMeta;
    db.setMeta = () => { throw new Error('disk failure'); };
    expect(game.action('p', { requestId: 'failed-door', action: 'toggle_door', targetId: door.id }).error).toBe('disk failure');
    expect(door.isOpen).toBe(false);
    expect(game.snapshot('p').buildings.find(b => b.id === door.id)?.isOpen).toBe(false);
    db.setMeta = save;
    expect(game.action('p', { requestId: 'open-door', action: 'toggle_door', targetId: door.id }).error).toBeUndefined();
    expect(door.isOpen).toBe(false);
    expect(game.snapshot('p').buildings.find(b => b.id === door.id)?.isOpen).toBe(true);
    const restored = new GameWorld(db, { ...rules, buildingsNear: () => [door] }, () => 10000);
    expect(restored.snapshot('p').buildings.find(b => b.id === door.id)?.isOpen).toBe(true);
  });
});
describe('exploration rewards and the market catalogue', () => {
  it('rejects buying unlisted progression rewards without spending credits or granting inventory', () => {
    const { game, act } = setup(); const p = game.state.players.owner; p.resources.credits = 100000;
    for (const itemId of ['blueprint', 'dark_core', 'wp_plasma', 'copper_bar', 'rifle', '__proto__']) {
      const before = structuredClone(p);
      expect(act('owner', 'buy', { itemId, quantity: 1, price: 0 }).error).toContain('未上架');
      expect(p.inventory).toEqual(before.inventory); expect(p.resources).toEqual(before.resources);
      expect(p.blueprints).toEqual([]);
    }
  });
  it('settles listed bundles at canonical prices and quantities despite forged client fields', () => {
    const { game, act } = setup(); const p = game.state.players.owner; p.resources.credits = 100000;
    expect(act('owner', 'buy', { itemId: 'ammo_box', quantity: 2, units: 999, price: 0 }).error).toBeUndefined();
    expect(p.resources.ammo).toBe(120); expect(p.resources.credits).toBe(98800);
    expect(act('owner', 'buy', { itemId: 'scrap', quantity: 1, count: 999 }).error).toBeUndefined();
    expect(p.resources.scrap).toBe(10); expect(p.resources.credits).toBe(98650);
    expect(act('owner', 'buy', { itemId: 'ore_copper', quantity: 1 }).error).toBeUndefined();
    expect(p.inventory.find(i => i?.id === 'ore_copper')?.count).toBe(1); expect(p.resources.credits).toBe(98620);
    expect(act('owner', 'buy', { itemId: 'food_ration', quantity: 1 }).error).toBeUndefined();
    expect(p.inventory.find(i => i?.id === 'food')?.count).toBe(10); expect(p.resources.credits).toBe(98500);
  });
  it('preserves actual rare loot and allows its sale without turning it into a purchasable offer', () => {
    const { game, act, db } = setup(); const p = game.state.players.owner;
    p.inventory[0] = makeItem('dark_core', 2); p.inventory[1] = makeItem('blueprint', 1); p.resources.credits = 2000; game.persist();
    expect(act('owner', 'sell', { itemId: 'dark_core', quantity: 1, price: 99999 }).error).toBeUndefined();
    expect(p.resources.credits).toBe(2500); expect(p.inventory[0]?.count).toBe(1);
    expect(act('owner', 'buy', { itemId: 'dark_core', quantity: 1 }).error).toContain('未上架');
    const restored = new GameWorld(db, rules).snapshot('owner').player;
    expect(restored.inventory.filter(Boolean).map(i => [i!.id, i!.count])).toEqual([['dark_core', 1], ['blueprint', 1]]);
    expect(restored.resources.credits).toBe(2500);
  });
});
describe('firing receipt times', () => {
  it('does not charge validation work against the next legal shot interval', () => {
    let time = 10000, processing = false;
    const game = new GameWorld(createMemoryDb(), { ...rules,
      buildingsNear: () => { if (processing) time += 2; return []; },
      monstersNear: () => [{ id: 'target', x: 1, y: 0, hp: 1000, maxHp: 1000 }],
    }, () => time);
    game.connect('p', '射手'); const p = game.state.players.p;
    p.equipment.weapon = makeItem('rifle', 1); p.resources.ammo = 10; processing = true;
    expect(game.action('p', { action: 'fire', monsterId: 'target', requestId: 'first' }).error).toBeUndefined();
    time = 10120;
    expect(game.action('p', { action: 'fire', monsterId: 'target', requestId: 'second' }).error).toBeUndefined();
    expect(p.resources.ammo).toBe(8);
    time = 10150;
    expect(game.action('p', { action: 'fire', monsterId: 'target', requestId: 'too-fast' }).error).toContain('过快');
    expect(p.resources.ammo).toBe(8);
  });
  it('absorbs small receive jitter as cooldown debt instead of increasing sustained fire rate', () => {
    const { game, act, advance } = setup(); const p = game.state.players.owner;
    p.equipment.weapon = makeItem('rifle', 1); p.resources.ammo = 30;
    expect(act('owner', 'fire').error).toBeUndefined();
    advance(110); expect(act('owner', 'fire').error).toBeUndefined();
    expect(p.actionAt.attack).toBe(10120);
    expect(act('owner', 'fire').error).toContain('过快');
    advance(100); expect(act('owner', 'fire').error).toContain('过快');
    advance(10); expect(act('owner', 'fire').error).toBeUndefined();
    expect(p.actionAt.attack).toBe(10240); expect(p.resources.ammo).toBe(27);
  });
  it('keeps a ten-millisecond spam loop at the normal sustained rate and retains timing across restart', () => {
    const { game, act, advance, db } = setup(); const p = game.state.players.owner;
    p.equipment.weapon = makeItem('rifle', 1); p.resources.ammo = 30;
    act('owner', 'fire');
    for (let i = 0; i < 100; i++) { advance(10); act('owner', 'fire'); }
    expect(p.resources.ammo).toBe(21); expect(p.actionAt.attack).toBe(10960);
    const restored = new GameWorld(db, rules, () => 11000);
    expect(restored.action('owner', { action: 'fire', requestId: 'after-restart' }).error).toContain('过快');
    expect(restored.state.players.owner.resources.ammo).toBe(21);
  });
});
function setup(saved?: Partial<PersistedWorld>) {
  const db = createMemoryDb();
  let now = 10_000;
  const game = new GameWorld(db, rules, () => now);
  game.connect('owner', '主人'); game.connect('raider', '攻击者');
  if (saved) Object.assign(game.state, saved);
  return { db, game, advance: (ms: number) => { now += ms; }, act: (id: string, action: string, params = {}) => game.action(id, { requestId: crypto.randomUUID(), action, ...params }) };
}
function campSetup() {
  const context = setup(); const p = context.game.state.players.owner; p.x = 100;
  Object.assign(p.resources, { wood: 1000, stone: 1000, scrap: 1000, parts: 100 });
  context.act('owner', 'create_camp', { x: 100, y: 0 }); context.act('owner', 'enter_camp', { campId: p.campId });
  p.x = 1; p.y = 0;
  return { ...context, p };
}
function facility(game: GameWorld, type: any, x = 5, y = 4) {
  const b = { id: type + '_test', type, x, y, name: type, hp: 300, maxHp: 300, level: 1, ownerId: 'owner', mapId: 'home_owner' as const };
  game.state.buildings[b.id] = b; return b;
}
function npcHit(game: GameWorld, advance: (ms: number) => void, playerId = 'owner') {
  const p = game.state.players[playerId];
  game.state.monsters.fixture_hit = { id: 'fixture_hit', name: '伤害测试怪物', x: p.x + 1, y: p.y, spawnX: p.x + 1, spawnY: p.y, hp: 100, maxHp: 100, speed: 1.8, damage: 10, state: 'attack', animTime: 0, attackCooldown: 0, windup: 0.35, targetId: playerId };
  advance(200); game.tick(); advance(200); game.tick();
  delete game.state.monsters.fixture_hit; game.persist();
}

describe('authoritative acid rain', () => {
  function weatherSetup() {
    let time = 10_000, weather: WeatherType = 'acid_rain';
    const db = createMemoryDb();
    const weatherRules = { ...rules, weather: () => weather };
    const game = new GameWorld(db, weatherRules, () => time); game.connect('p', '行者');
    const p = game.state.players.p; p.x = 200; p.y = 200; p.shield = 20; p.lastDamageAt = 0;
    return { game, db, p, weatherRules, now: () => time, advance: (ms: number) => { time += ms; }, setWeather: (next: WeatherType) => { weather = next; } };
  }

  it('corrodes only shields at the existing 1.5 per second rate without regenerating or starting combat', () => {
    const { game, p, advance } = weatherSetup(); advance(1000); game.tick();
    expect(p.shield).toBe(18.5); expect(p.hp).toBe(100);
    expect(p.lastDamageAt).toBe(0); expect(p.combatUntil).toBe(0);
    expect(game.snapshot('p').player.lastDamageAt).toBe(0);
    expect(p.satiety).toBe(99.75);
  });

  it('clamps at zero without spilling acid corrosion into health or charging the same tick twice', () => {
    const { game, p, advance } = weatherSetup(); p.shield = 1;
    advance(2000); game.tick(); game.tick();
    expect(p.shield).toBe(0); expect(p.hp).toBe(100);
    advance(1000); game.tick(); expect(p.shield).toBe(0); expect(p.hp).toBe(100);
  });

  it('keeps private camps immune while another active player in the public world is corroded', () => {
    const { game, p, advance } = weatherSetup(); p.mapId = 'home_p';
    game.connect('other', '野外行者'); const other = game.state.players.other;
    other.x = 200; other.y = 200; other.shield = 20; other.lastDamageAt = 0;
    advance(1000); game.tick();
    expect(p.shield).toBe(28); expect(other.shield).toBe(18.5);
  });

  it('resumes ordinary delayed regeneration when the server changes back to clear weather', () => {
    const { game, p, advance, setWeather } = weatherSetup();
    advance(1000); game.tick(); expect(p.shield).toBe(18.5);
    setWeather('clear'); advance(1000); game.tick(); expect(p.shield).toBe(26.5);
    p.lastDamageAt = 12_000; advance(1000); game.tick(); expect(p.shield).toBe(26.5);
  });

  it('persists the depleted shield without applying weather damage for time the server was stopped', () => {
    const { game, db, p, advance, weatherRules, now } = weatherSetup();
    advance(1000); game.tick(); expect(p.shield).toBe(18.5);
    advance(60_000); const restored = new GameWorld(db, weatherRules, now); restored.connect('p', '行者');
    restored.tick(); expect(restored.state.players.p.shield).toBe(18.5);
    advance(1000); restored.tick(); expect(restored.state.players.p.shield).toBe(17);
  });

  it('distinguishes a real hit during acid rain from environmental shield corrosion in snapshots', () => {
    const { game, p, advance } = weatherSetup();
    npcHit(game, advance, 'p');
    expect(p.shield).toBe(10);
    expect(game.snapshot('p').player.lastDamageAt).toBe(10_400);
    advance(1000); game.tick(); expect(p.shield).toBeCloseTo(10 - 1.4 * 1.5);
    expect(game.snapshot('p').player.lastDamageAt).toBe(10_400);
  });
});

describe('persistent onboarding', () => {
  it('records storage only after a real successful deposit and retains it after withdrawal and destruction', () => {
    const { game, act, db } = campSetup();
    expect(act('owner', 'build', { buildType: 'workbench', x: 3, y: 0 }).error).toBeUndefined();
    expect(act('owner', 'build', { buildType: 'storage_box', x: 3, y: 1 }).error).toBeUndefined();
    const storage = Object.values(game.state.buildings).find(b => b.type === 'storage_box')!;
    expect(game.snapshot('owner').player.onboarding.storageUsed).toBe(false);
    expect(act('owner', 'deposit', { targetId: storage.id, itemId: 'wood', count: 0 }).error).toBeTruthy();
    expect(game.snapshot('owner').player.onboarding.storageUsed).toBe(false);
    const wood = game.state.players.owner.resources.wood;
    expect(act('owner', 'deposit', { targetId: storage.id, itemId: 'wood', count: 1 }).error).toBeUndefined();
    expect(game.state.players.owner.resources.wood).toBe(wood - 1);
    expect(game.state.storage[storage.id].wood).toBe(1);
    expect(game.snapshot('owner').player.onboarding.storageUsed).toBe(true);
    expect(act('owner', 'withdraw', { targetId: storage.id, itemId: 'wood', count: 1 }).error).toBeUndefined();
    game.state.buildings[storage.id].hp = 0; game.persist();
    expect(new GameWorld(db, rules).snapshot('owner').player.onboarding.storageUsed).toBe(true);
  });

  it('records defense preparation after loading ten real rounds, not construction or a rejected load', () => {
    const { game, act, db, p } = campSetup();
    expect(act('owner', 'build', { buildType: 'turret', x: 3, y: 0 }).error).toBeUndefined();
    const tower = Object.values(game.state.buildings).find(b => b.type === 'turret')!;
    expect(game.snapshot('owner').player.onboarding.turretLoaded).toBe(false);
    expect(act('owner', 'load_turret', { targetId: tower.id, count: 10 }).error).toBeTruthy();
    expect(game.snapshot('owner').player.onboarding.turretLoaded).toBe(false);
    p.resources.ammo = 10;
    expect(act('owner', 'load_turret', { targetId: tower.id, count: 9 }).error).toBeUndefined();
    expect(game.snapshot('owner').player.onboarding.turretLoaded).toBe(false);
    expect(act('owner', 'load_turret', { targetId: tower.id, count: 1 }).error).toBeUndefined();
    expect(p.resources.ammo).toBe(0); expect(game.state.ammo[tower.id]).toBe(10);
    expect(game.snapshot('owner').player.onboarding.turretLoaded).toBe(true);
    game.state.ammo[tower.id] = 0; game.state.buildings[tower.id].hp = 0; game.persist();
    expect(new GameWorld(db, rules).snapshot('owner').player.onboarding.turretLoaded).toBe(true);
  });

  it('credits actual authorized camp supplies to the camp owner while rejecting an unauthorized visitor', () => {
    const { game, act, p } = campSetup();
    act('owner', 'build', { buildType: 'storage_box', x: 3, y: 0 });
    act('owner', 'build', { buildType: 'turret', x: 3, y: 1 });
    const storage = Object.values(game.state.buildings).find(b => b.type === 'storage_box')!;
    const tower = Object.values(game.state.buildings).find(b => b.type === 'turret')!;
    const visitor = game.state.players.raider; Object.assign(visitor, { mapId: p.mapId, x: p.x, y: p.y });
    visitor.resources.wood = 1; visitor.resources.ammo = 10;
    expect(act('raider', 'deposit', { targetId: storage.id, itemId: 'wood', count: 1 }).error).toBeTruthy();
    expect(act('raider', 'load_turret', { targetId: tower.id, count: 10 }).error).toBeTruthy();
    expect(game.snapshot('owner').player.onboarding).toMatchObject({ storageUsed: false, turretLoaded: false });
    expect(act('owner', 'authorize_member', { playerId: 'raider' }).error).toBeUndefined();
    expect(act('raider', 'deposit', { targetId: storage.id, itemId: 'wood', count: 1 }).error).toBeUndefined();
    expect(act('raider', 'load_turret', { targetId: tower.id, count: 10 }).error).toBeUndefined();
    expect(visitor.resources.wood).toBe(0); expect(visitor.resources.ammo).toBe(0);
    expect(game.snapshot('owner').player.onboarding).toMatchObject({ storageUsed: true, turretLoaded: true });
    expect(game.snapshot('raider').player.onboarding).toMatchObject({ storageUsed: false, turretLoaded: false });
  });

  it.each([0, 9, 10])('migrates only proven stored supplies and loaded ammunition (%i rounds)', ammo => {
    const { game, db, p } = campSetup();
    const storage = facility(game, 'storage_box'), tower = facility(game, 'turret');
    game.state.storage[storage.id] = { wood: ammo === 0 ? 0 : 1 }; game.state.ammo[tower.id] = ammo;
    delete (p.onboarding as any).storageUsed; delete (p.onboarding as any).turretLoaded; game.persist();
    const progress = new GameWorld(db, rules).snapshot('owner').player.onboarding;
    expect(progress.storageUsed).toBe(ammo > 0); expect(progress.turretLoaded).toBe(ammo >= 10);
  });

  it.each(['deposit', 'load_turret'] as const)('rolls back the owner milestone and member supplies if saving %s fails', action => {
    const { game, act, db, p } = campSetup();
    act('owner', 'build', { buildType: 'storage_box', x: 3, y: 0 });
    act('owner', 'build', { buildType: 'turret', x: 3, y: 1 });
    act('owner', 'authorize_member', { playerId: 'raider' });
    const visitor = game.state.players.raider; Object.assign(visitor, { mapId: p.mapId, x: p.x, y: p.y });
    visitor.resources.wood = 1; visitor.resources.ammo = 10; game.persist();
    const building = Object.values(game.state.buildings).find(b => b.type === (action === 'deposit' ? 'storage_box' : 'turret'))!;
    const save = db.setMeta; db.setMeta = () => { throw new Error('disk failure'); };
    expect(act('raider', action, { targetId: building.id, itemId: 'wood', count: action === 'deposit' ? 1 : 10 }).error).toBe('disk failure');
    db.setMeta = save;
    expect(visitor.resources).toMatchObject({ wood: 1, ammo: 10 });
    expect(game.state.storage[building.id]?.wood || 0).toBe(0); expect(game.state.ammo[building.id] || 0).toBe(0);
    expect(game.snapshot('owner').player.onboarding).toMatchObject({ storageUsed: false, turretLoaded: false });
    expect(new GameWorld(db, rules).snapshot('owner').player.onboarding).toMatchObject({ storageUsed: false, turretLoaded: false });
  });

  it('retains collected materials after spending them on a camp and restarting, without counting replays', () => {
    const supplies = { ...box, lootTable: [{ itemId: 'wood', name: '木材', count: 20 }, { itemId: 'stone', name: '石料', count: 10 }] };
    const db = createMemoryDb(); const game = new GameWorld(db, { ...rules, nodeAt: () => supplies });
    game.connect('p', '新手');
    game.action('p', { requestId: 'search', action: 'search', targetId: box.id });
    const take = { requestId: 'wood', action: 'take_loot', targetId: box.id, itemId: 'wood', count: 3 };
    expect(game.action('p', take).error).toBeUndefined(); game.action('p', take);
    expect(game.snapshot('p').player.onboarding.wood).toBe(3);
    game.action('p', { ...take, requestId: 'wood-rest', count: 17 });
    game.action('p', { requestId: 'stone', action: 'take_loot', targetId: box.id, itemId: 'stone', count: 10 });
    const p = game.state.players.p; p.x = 100;
    expect(game.action('p', { requestId: 'camp', action: 'create_camp', x: 100, y: 0 }).error).toBeUndefined();
    expect(p.resources).toMatchObject({ wood: 0, stone: 0 });
    expect(new GameWorld(db, rules).snapshot('p').player.onboarding).toMatchObject({ wood: 20, stone: 10 });
  });

  it('records tool equipment rather than possession and retains the achievement after removal', () => {
    const { game, act, db } = setup(); const p = game.state.players.owner;
    p.inventory[0] = makeItem('pickaxe_stone', 1);
    expect(game.snapshot('owner').player.onboarding.toolEquipped).toBe(false);
    expect(act('owner', 'equip', { slot: 'tool', index: 0 }).error).toBeUndefined();
    expect(act('owner', 'unequip', { slot: 'tool' }).error).toBeUndefined();
    expect(act('owner', 'drop', { index: 0 }).error).toBeUndefined();
    expect(new GameWorld(db, rules).snapshot('owner').player.onboarding.toolEquipped).toBe(true);
  });

  it('only completes eating after a successful food action, not a medical or invalid request', () => {
    const { game, act, advance, db } = setup(); const p = game.state.players.owner;
    p.inventory[0] = makeItem('bandage', 2); p.inventory[1] = makeItem('food', 2);
    expect(act('owner', 'use_item', { index: 100 }).error).toBeTruthy();
    expect(act('owner', 'use_item', { index: 0 }).error).toBeUndefined();
    expect(game.snapshot('owner').player.onboarding.ateFood).toBe(false);
    expect(act('owner', 'use_item', { index: 1 }).error).toBeTruthy();
    expect(game.snapshot('owner').player.onboarding.ateFood).toBe(false);
    advance(801); expect(act('owner', 'use_item', { index: 1 }).error).toBeUndefined();
    expect(new GameWorld(db, rules).snapshot('owner').player.onboarding.ateFood).toBe(true);
    expect(p.inventory[1]?.count).toBe(1);
  });

  it('preserves completed construction after the building is destroyed or no longer visible', () => {
    const { game, act, db, p } = campSetup();
    expect(act('owner', 'build', { buildType: 'turret', x: 100, y: 0 }).error).toBeTruthy();
    expect(game.snapshot('owner').player.onboarding.turretBuilt).toBe(false);
    expect(act('owner', 'build', { buildType: 'workbench', x: 3, y: 0 }).error).toBeUndefined();
    expect(act('owner', 'build', { buildType: 'turret', x: 3, y: 1 }).error).toBeUndefined();
    for (const b of Object.values(game.state.buildings)) if (['workbench', 'turret'].includes(b.type)) b.hp = 0;
    p.mapId = 'world'; p.x = 100; game.persist();
    expect(new GameWorld(db, rules).snapshot('owner').player.onboarding).toMatchObject({ workbenchBuilt: true, turretBuilt: true });
  });

  it('records exploration from accepted movement and retains it after returning to spawn', () => {
    const { game, advance, db } = setup();
    expect(game.move('owner', { x: 20, y: 0, onboarding: { explored: true } })).toBe(false);
    expect(game.snapshot('owner').player.onboarding.explored).toBe(false);
    for (const x of [1.8, 3, 1.5, 0]) { advance(500); expect(game.move('owner', { x, y: 0 })).toBe(true); }
    game.persist(); expect(new GameWorld(db, rules).snapshot('owner').player.onboarding.explored).toBe(true);
  });

  it('initializes old saves from verifiable possessions and buildings without inventing past meals', () => {
    const { game, db, p } = campSetup();
    p.resources.wood = 1; p.resources.stone = 1; p.equipment.tool = makeItem('pickaxe_stone', 1);
    facility(game, 'workbench');
    delete (p as any).onboarding; game.persist();
    expect(new GameWorld(db, rules).snapshot('owner').player.onboarding).toMatchObject({ wood: 20, stone: 10, toolEquipped: true, workbenchBuilt: true, ateFood: false });
  });

  it('rolls back collection progress when mineral output cannot fit in the inventory', () => {
    const rock = { ...tree, type: 'boulder' as const, lootTable: [{ itemId: 'ore_copper', name: '铜矿', count: 1 }] };
    const game = new GameWorld(createMemoryDb(), { ...rules, nodeAt: () => rock }); game.connect('p', '矿工');
    const p = game.state.players.p; p.equipment.tool = makeItem('pickaxe_stone', 1); p.inventory.fill(makeItem('rifle', 1));
    expect(game.action('p', { requestId: 'full', action: 'gather', targetId: rock.id }).error).toContain('背包');
    expect(game.snapshot('p').player.onboarding.stone).toBe(0); expect(p.resources.stone).toBe(0);
  });
});

describe('equipment progression and inventory capacity', () => {
  it('expands the actual inventory and rejects removing a full pack without losing anything', () => {
    const { game, act } = setup(); const p = game.state.players.owner;
    p.inventory[0] = makeItem('pack_canvas', 1);
    expect(act('owner', 'equip', { slot: 'pack', index: 0 }).error).toBeUndefined();
    expect(p.inventory).toHaveLength(26);
    p.resources.credits = 100000;
    expect(act('owner', 'buy', { itemId: 'att_scope4x', quantity: 130 }).error).toBeUndefined();
    const before = structuredClone(p);
    expect(act('owner', 'unequip', { slot: 'pack' }).error).toContain('背包');
    expect(p.inventory).toEqual(before.inventory);
    expect(p.equipment).toEqual(before.equipment);
  });

  it('moves occupied extension slots into free base slots on unequip and persists every item', () => {
    const { game, act, db } = setup(); const p = game.state.players.owner;
    p.inventory[0] = makeItem('pack_canvas', 1); p.inventory[4] = makeItem('med_bandage', 2);
    act('owner', 'equip', { slot: 'pack', index: 0 }); p.inventory[25] = makeItem('food', 3);
    expect(act('owner', 'unequip', { slot: 'pack' }).error).toBeUndefined();
    expect(p.inventory).toHaveLength(24);
    expect(p.inventory[4]).toMatchObject({ id: 'med_bandage', count: 2 });
    expect(p.inventory.filter(Boolean).map(i => [i!.id, i!.count]).sort()).toEqual([['food', 3], ['med_bandage', 2], ['pack_canvas', 1]].sort());
    const restored = new GameWorld(db, rules);
    expect(restored.state.players.owner.inventory).toEqual(p.inventory);
    expect(restored.state.players.owner.equipment.pack).toBeNull();
  });

  it('refuses an overfull downgrade, then swaps packs and preserves quick slots once space is available', () => {
    const { game, act } = setup(); const p = game.state.players.owner;
    p.equipment.pack = makeItem('pack_tactical', 1);
    p.inventory = Array.from({ length: 28 }, (_, i) => i < 26 ? makeItem('rifle', 1) : null);
    p.inventory[0] = makeItem('pack_canvas', 1); p.inventory[27] = makeItem('med_bandage', 3);
    const before = structuredClone(p);
    expect(act('owner', 'equip', { slot: 'pack', index: 0 }).error).toContain('空间');
    expect(p.inventory).toEqual(before.inventory); expect(p.equipment).toEqual(before.equipment);
    p.inventory[24] = null;
    expect(act('owner', 'equip', { slot: 'pack', index: 0 }).error).toBeUndefined();
    expect(p.inventory).toHaveLength(26);
    expect(p.equipment.pack?.id).toBe('pack_canvas');
    expect(p.inventory[0]?.id).toBe('pack_tactical');
    expect(p.inventory[24]).toMatchObject({ id: 'med_bandage', count: 3 });
    expect(p.inventory[1]?.id).toBe('rifle');
  });

  it('applies already-equipped legacy packs after restart without deleting existing slots', () => {
    const { game, db } = setup(); const p = game.state.players.owner;
    p.equipment.pack = makeItem('pack_tactical', 1); p.inventory[23] = makeItem('food', 7); game.persist();
    const restored = new GameWorld(db, rules);
    expect(restored.state.players.owner.inventory).toHaveLength(28);
    expect(restored.state.players.owner.inventory[23]).toMatchObject({ id: 'food', count: 7 });
  });

  it('keeps equipped pack capacity on death while dropping extension-slot inventory exactly once', () => {
    const { game, advance, db } = setup(); const p = game.state.players.owner;
    p.equipment.pack = makeItem('pack_tactical', 1); p.inventory = Array(28).fill(null);
    p.inventory[27] = makeItem('food', 7); p.hp = 1; p.shield = 0;
    npcHit(game, advance);
    expect(p.inventory).toHaveLength(28); expect(p.inventory.every(i => !i)).toBe(true);
    expect(p.equipment.pack?.id).toBe('pack_tactical');
    expect(Object.values(game.state.drops).flatMap(d => d.items).filter(i => i.itemId === 'food')).toEqual([{ itemId: 'food', name: makeItem('food', 7).name, count: 7 }]);
    const restored = new GameWorld(db, rules);
    expect(restored.state.players.owner.inventory).toHaveLength(28);
    expect(Object.values(restored.state.drops).flatMap(d => d.items).filter(i => i.itemId === 'food')).toHaveLength(1);
  });

  it('gives copper picks a real mining improvement without granting axe benefits', () => {
    const rock = { ...tree, type: 'boulder' as const, id: 'ore', lootTable: [{ itemId: 'ore_copper', name: '铜矿', count: 1 }] };
    for (const [tool, expected] of [['pickaxe_stone', 3], ['pickaxe_copper', 4], ['axe_stone', 1]] as const) {
      const db = createMemoryDb(); const game = new GameWorld(db, { ...rules, nodeAt: () => rock, nodesNear: () => [rock] });
      game.connect('miner', '矿工'); game.state.players.miner.equipment.tool = makeItem(tool, 1);
      const result = game.action('miner', { requestId: 'mine', action: 'gather', targetId: rock.id });
      expect(result.error).toBeUndefined(); expect(result.player.resources.stone).toBe(expected);
      expect(result.player.inventory.filter(i => i?.id === 'ore_copper').reduce((sum, i) => sum + i!.count, 0)).toBe(tool === 'axe_stone' ? 0 : 1);
    }
  });
});

describe('public building layout updates', () => {
  it('aligns saved public doors to current geometry while retaining damage, door state and private camps', () => {
    const { game, db, p } = campSetup();
    const door = { id: 'world:0:0:poi:door', type: 'door' as const, name: '农舍入口', x: 12, y: 16, hp: 200, maxHp: 650, level: 1, mapId: 'world' as const, isOpen: false, doorWidth: 1 };
    game.state.buildings[door.id] = door;
    const removedId = 'world:0:0:poi:n_-5';
    game.state.buildings[removedId] = { ...door, id: removedId, type: 'wood_wall' };
    p.resources.wood = 777;
    const privateCore = structuredClone(game.state.buildings[p.campId! + '_core']);
    game.persist();
    const restored = new GameWorld(db, { ...rules, buildingsNear: () => [{ ...door, name: '驿站诊所入口', y: 15, hp: 650, isOpen: true, doorWidth: 3 }] });
    expect(restored.state.buildings[door.id]).toMatchObject({ name: '驿站诊所入口', y: 15, doorWidth: 3, hp: 200, isOpen: false });
    expect(restored.state.buildings[removedId]).toBeUndefined();
    expect(restored.state.players.owner.resources.wood).toBe(777);
    expect(restored.state.buildings[privateCore.id]).toEqual(privateCore);
  });
});

describe('shared authoritative wildlife', () => {
  const def: MonsterEntity = { id: 'shared_npc', name: '异变兽', x: 1, y: 0, hp: 150, maxHp: 150, speed: 1.8, damage: 10, state: 'roam', animTime: 0, attackCooldown: 0, spawnX: 1, spawnY: 0 };
  function npcSetup(definitions: MonsterEntity[] = [def]) {
    let time = 10000;
    const db = createMemoryDb();
    const npcRules = { ...rules, monstersNear: (x: number, y: number) => definitions.filter(m => Math.hypot(m.x - x, m.y - y) <= 40) };
    const game = new GameWorld(db, npcRules, () => time); game.connect('a', '甲'); game.connect('b', '乙');
    return { game, db, npcRules, now: () => time, advance: (ms: number) => { time += ms; }, action: (id: string, action: string, params = {}) => game.action(id, { requestId: crypto.randomUUID(), action, ...params }) };
  }
  it('shares damaged HP, pays one real shot and persists one reward, death and replay guard across restart', () => {
    const { game, db, npcRules, now, advance, action } = npcSetup();
    game.state.players.a.equipment.weapon = makeItem('rifle', 1); game.state.players.a.resources.ammo = 2;
    expect(action('a', 'fire', { monsterId: def.id }).error).toBeUndefined();
    expect(game.snapshot('a').monsters[0].hp).toBe(26); expect(game.snapshot('b').monsters[0].hp).toBe(26);
    expect(game.state.players.a.resources.ammo).toBe(1);
    const packet = { requestId: 'final-shot', action: 'fire', monsterId: def.id };
    advance(200); expect(game.action('a', packet).error).toBeUndefined();
    expect(game.snapshot('b').monsters[0]).toMatchObject({ hp: 0, state: 'dead', respawnAt: 130200 });
    expect(game.state.players.a).toMatchObject({ xp: 30, kills: 1 }); expect(game.state.players.a.resources.credits).toBe(15); expect(game.state.players.a.resources.shard).toBe(1);
    const restored = new GameWorld(db, npcRules, now); restored.connect('a', '甲'); restored.action('a', packet);
    expect(restored.state.players.a.kills).toBe(1); expect(restored.state.monsters[def.id].hp).toBe(0);
    expect(restored.state.players.a.resources.ammo).toBe(0);
    advance(119999); restored.tick(); expect(restored.state.monsters[def.id].hp).toBe(0);
    advance(1); restored.tick(); expect(restored.state.monsters[def.id].hp).toBe(150);
  });
  it('rejects client damage, cross-space, range, wall shots and conflicting targets without consuming ammunition', () => {
    const { game, action } = npcSetup(); const p = game.state.players.a;
    p.equipment.weapon = makeItem('crude_gun', 1); p.resources.ammo = 3;
    expect(action('a', 'damage', { monsterId: def.id, damage: 999 }).error).toBeTruthy();
    expect(p.hp).toBe(100);
    expect(action('a', 'fire', { monsterId: def.id, targetId: 'b' }).error).toBeTruthy();
    p.x = 12; expect(action('a', 'fire', { monsterId: def.id }).error).toBeTruthy();
    p.x = 0; game.state.buildings.wall = { id: 'wall', type: 'wood_wall', name: '', x: 0.5, y: 0, hp: 100, maxHp: 100, level: 1, mapId: 'world', facing: 'ns' };
    expect(action('a', 'fire', { monsterId: def.id }).error).toBeTruthy();
    delete game.state.buildings.wall; p.mapId = 'home_a';
    expect(action('a', 'attack', { monsterId: def.id }).error).toBeTruthy(); expect(p.resources.ammo).toBe(3);
  });
  it('applies server melee and cadence, and AI winds up then hurts nearby players without any client damage request', () => {
    const { game, advance, action } = npcSetup();
    expect(action('a', 'attack', { monsterId: def.id }).error).toBeUndefined(); expect(game.state.monsters[def.id].hp).toBe(138);
    expect(action('a', 'attack', { monsterId: def.id }).error).toBeTruthy();
    game.tick(); expect(game.state.players.a.hp).toBe(100);
    advance(200); game.tick(); expect(game.state.players.a.hp).toBe(100);
    advance(200); game.tick(); expect(game.state.players.a.hp).toBe(90);
    game.state.players.b.x = 100;
    const npc = game.state.monsters[def.id]; const x = npc.x, y = npc.y, cooldown = npc.attackCooldown;
    game.state.players.a.x = 100; advance(1000); game.tick();
    expect(npc.x).toBe(x); expect(npc.y).toBe(y); expect(npc.attackCooldown).toBe(cooldown);
  });
  it('does not initialize distant NPCs, and chases with a spawn leash and collision checks', () => {
    const distant = { ...def, id: 'distant', x: 500, spawnX: 500 };
    const { game, advance } = npcSetup([def, distant]); game.state.players.a.x = 5; game.state.players.b.x = 100;
    game.tick(); expect(Object.keys(game.state.monsters)).toEqual([def.id]);
    advance(200); game.tick(); expect(game.state.monsters[def.id].x).toBeGreaterThan(1);
    game.state.players.a.x = 50;
    const before = game.state.monsters[def.id].x; advance(200); game.tick(); expect(game.state.monsters[def.id].x).toBe(before);
  });
});

describe('camp facilities and membership', () => {
  it('grants members shared storage and defense immunity without ownership, and revocation restores hostile defenses', () => {
    const { game, act, p } = campSetup();
    expect(act('owner', 'authorize_member', { playerId: 'raider' }).error).toBeUndefined();
    const member = game.state.players.raider; member.mapId = 'home_owner'; member.x = 1; member.y = 0;
    expect(member.campId).toBeNull();
    const turret = facility(game, 'turret', 0, 3); game.state.ammo[turret.id] = 2;
    const storage = facility(game, 'storage_box', 2, 0); game.state.storage[storage.id] = { wood: 5 };
    expect(act('raider', 'withdraw', { targetId: storage.id, itemId: 'wood', count: 5 }).error).toBeUndefined();
    expect(act('raider', 'build', { buildType: 'wood_wall', x: 3, y: 0 }).error).toBeTruthy();
    game.disconnect('owner'); game.tick(); expect(member.hp).toBe(100); expect(game.state.ammo[turret.id]).toBe(2);
    expect(act('owner', 'revoke_member', { playerId: 'raider' }).error).toBeUndefined();
    game.tick(); expect(member.hp).toBe(88); expect(game.state.ammo[turret.id]).toBe(1);
    expect(game.snapshot('owner').camps[0].members).toEqual([]);
  });
  it('persists timed farming across restart and preserves a finished job when collection inventory is full', () => {
    const { game, db, act, p, advance } = campSetup(); p.x = 4; p.y = 4;
    const farm = facility(game, 'farm_plot'); p.inventory[0] = makeItem('seed_parsnip', 2);
    expect(act('owner', 'craft', { recipeId: 'grow_parsnip' }).error).toBeTruthy();
    expect(act('owner', 'start_production', { targetId: farm.id, recipeId: 'grow_parsnip' }).error).toBeUndefined();
    expect(p.inventory[0]?.count).toBe(1); expect(game.state.production[farm.id].resultCount).toBe(4);
    expect(act('owner', 'start_production', { targetId: farm.id, recipeId: 'grow_parsnip' }).error).toBeTruthy();
    expect(act('owner', 'collect_production', { targetId: farm.id }).error).toBeTruthy();
    p.inventory = Array.from({ length: 24 }, () => makeItem('rifle', 1)); game.persist(); advance(60_001);
    const restored = new GameWorld(db, rules, () => 70_001); restored.connect('owner', '主人');
    const collect = () => restored.action('owner', { requestId: crypto.randomUUID(), action: 'collect_production', targetId: farm.id });
    expect(collect().error).toContain('背包'); expect(restored.state.production[farm.id]).toBeDefined();
    restored.state.players.owner.inventory[0] = null;
    expect(collect().error).toBeUndefined(); expect(restored.state.players.owner.inventory[0]).toMatchObject({ id: 'crop_parsnip', count: 4 });
    expect(restored.state.production[farm.id]).toBeUndefined(); expect(collect().error).toBeTruthy();
  });
  it('requires real fish and a campfire for cooking instead of creating food from wood', () => {
    const { game, act, p, advance } = campSetup(); p.x = 4; p.y = 4; const fire = facility(game, 'campfire');
    expect(act('owner', 'craft', { recipeId: 'dried_fish' }).error).toBeTruthy();
    expect(act('owner', 'start_production', { targetId: fire.id, recipeId: 'dried_fish' }).error).toBeTruthy();
    p.inventory[0] = makeItem('fish', 2);
    expect(act('owner', 'start_production', { targetId: fire.id, recipeId: 'dried_fish' }).error).toBeUndefined();
    advance(20_001); expect(act('owner', 'collect_production', { targetId: fire.id }).error).toBeUndefined();
    expect(p.inventory.find(i => i?.id === 'dried_fish')?.count).toBe(2);
  });
  it('smelts actual copper ore offline and gates advanced fabrication behind learned research', () => {
    const { game, act, p, advance } = campSetup(); p.x = 4; p.y = 4;
    const furnace = facility(game, 'furnace'); p.inventory[0] = makeItem('ore_copper', 3);
    expect(act('owner', 'start_production', { targetId: furnace.id, recipeId: 'smelt_copper' }).error).toBeUndefined();
    expect(p.inventory[0]).toBeNull(); advance(20001);
    expect(act('owner', 'collect_production', { targetId: furnace.id }).error).toBeUndefined();
    expect(p.inventory[0]).toMatchObject({ id: 'copper_bar', count: 1 });
    delete game.state.buildings[furnace.id]; facility(game, 'workbench');
    p.inventory[0] = makeItem('copper_bar', 4); p.inventory[1] = makeItem('dark_core', 2);
    expect(act('owner', 'craft', { recipeId: 'plasma_rifle' }).error).toContain('蓝图');
    p.blueprints.push('wp_plasma');
    expect(act('owner', 'craft', { recipeId: 'plasma_rifle' }).error).toBeUndefined();
    expect(p.inventory.find(i => i?.id === 'wp_plasma')).toMatchObject({ count: 1 });
    expect(p.inventory.some(i => i?.id === 'copper_bar' || i?.id === 'dark_core')).toBe(false);
  });
  it('research consumes a real blueprint and materials, remains learned after death and survives restart', () => {
    const { game, act, p, db } = campSetup(); p.x = 4; p.y = 4; const research = facility(game, 'research_table');
    expect(act('owner', 'research', { targetId: research.id }).error).toBeTruthy();
    p.inventory[0] = makeItem('blueprint', 1); const parts = p.resources.parts;
    expect(act('owner', 'research', { targetId: research.id }).error).toBeUndefined();
    expect(p.blueprints).toContain('wp_plasma'); expect(p.resources.parts).toBe(parts - 3); expect(p.inventory[0]).toBeNull();
    const raider = game.state.players.raider; raider.mapId = p.mapId; raider.x = 4; raider.y = 6; raider.equipment.weapon = makeItem('rifle', 1); raider.resources.ammo = 1;
    act('raider', 'fire', { targetId: 'owner' }); expect(p.mapId).toBe('world'); expect(p.blueprints).toEqual(['wp_plasma']);
    expect(new GameWorld(db, rules).snapshot('owner').player.blueprints).toEqual(['wp_plasma']);
  });
  it('upgrades camp bounds with exact paid costs and preserves the fixed southern exit', () => {
    const { game, act, p, db, advance } = campSetup(); const stone = p.resources.stone;
    expect(act('owner', 'upgrade_camp').error).toBeUndefined();
    expect(p.resources.stone).toBe(stone - 60); expect(game.state.camps[p.campId!]).toMatchObject({ level: 2, size: 96 });
    p.x = 40; p.y = 4; advance(1000);
    expect(game.move('owner', { x: 40.1, y: 4 })).toBe(true);
    expect(act('owner', 'build', { buildType: 'wood_wall', x: 42, y: 4 }).error).toBeUndefined();
    expect(new GameWorld(db, rules).state.camps[p.campId!].size).toBe(96);
    p.x = 0; p.y = 28; expect(act('owner', 'leave_camp').error).toBeUndefined(); expect(p.x).toBe(100);
  });
  it('allows safe bed rest without creating food and rejects resting during combat', () => {
    const { game, act, p, advance } = campSetup(); p.x = 4; p.y = 4; const bed = facility(game, 'bed');
    p.hp = 40; p.satiety = 30; p.combatUntil = 20_000;
    expect(act('owner', 'rest', { targetId: bed.id }).error).toBeTruthy();
    advance(10_001); expect(act('owner', 'rest', { targetId: bed.id }).error).toBeUndefined();
    expect(p.hp).toBe(60); expect(p.satiety).toBe(30);
    expect(act('owner', 'rest', { targetId: bed.id }).error).toBeTruthy();
  });
  it('uses a surviving own bed only when the camp has no hostile invader', () => {
    const { game, act, p, advance } = campSetup(); const bed = facility(game, 'bed');
    p.mapId = 'world'; p.x = 0; p.y = 0; p.hp = 5;
    npcHit(game, advance);
    expect(p.mapId).toBe('home_owner'); expect(p.x).toBe(bed.x); expect(p.y).toBe(bed.y + 1);
    game.state.players.raider.mapId = 'home_owner';
    p.mapId = 'world'; p.x = 0; p.y = 0; p.hp = 5; advance(1201);
    npcHit(game, advance); expect(p.mapId).toBe('world');
  });
});

describe('authoritative world', () => {
  it('uses authored public workstation interactables for advanced crafting', () => {
    const bench = { ...tree, id: 'public-workbench', type: 'workbench' as const, x: 1, y: 0 };
    const game = new GameWorld(createMemoryDb(), { ...rules, nodesNear: () => [bench] }); game.connect('p', '玩家');
    Object.assign(game.state.players.p.resources, { scrap: 15, parts: 1 });
    const result = game.action('p', { requestId: 'public-craft', action: 'craft', recipeId: 'ammo_pack' });
    expect(result.error).toBeUndefined(); expect(result.player.resources.ammo).toBe(30);
  });
  it('allows paid wilderness public door breaching, persists its override, and rejects neutral public destruction', () => {
    const publicDoor = { id: 'public-door', type: 'safe_door' as const, name: '遗迹门', x: 150, y: 0, mapId: 'world' as const, ownerId: 'npc', hp: 1800, maxHp: 1800, level: 1, isLocked: true };
    let time = 10000;
    const db = createMemoryDb(); const game = new GameWorld(db, { ...rules, buildingsNear: () => [publicDoor] }, () => time); game.connect('p', '玩家');
    const p = game.state.players.p; p.x = 149; p.resources.c4 = 2;
    expect(game.action('p', { requestId: 'breach1', action: 'raid', targetId: publicDoor.id, supplyId: 'c4_explosive' }).error).toBeUndefined();
    time += 1001;
    expect(game.action('p', { requestId: 'breach2', action: 'raid', targetId: publicDoor.id, supplyId: 'c4_explosive' }).error).toBeUndefined();
    expect(new GameWorld(db, rules).state.buildings[publicDoor.id]).toMatchObject({ hp: 0, isOpen: true, isLocked: false });
    publicDoor.x = 64; publicDoor.hp = 1800; p.x = 63; p.resources.c4 = 1; delete game.state.buildings[publicDoor.id]; time += 1001;
    expect(game.action('p', { requestId: 'protected', action: 'raid', targetId: publicDoor.id, supplyId: 'c4_explosive' }).error).toBeTruthy(); expect(p.resources.c4).toBe(1);
  });
  it('migrates legacy spaces once, keeps original records and assigns distinct valid entrances', () => {
    const db = createMemoryDb();
    db.savePlayer({ id: 'old', name: '旧玩家', mapId: 'home_base', x: 0, y: 0 });
    for (const id of ['old', 'other']) db.saveBuilding({ id: id + '_wall', ownerId: id, ownerName: id, mapId: 'home_' + id, type: 'wood_wall', name: '墙', x: 5, y: 5, hp: 50, maxHp: 100, level: 1, storedLoot: [{ name: '示例奖励', count: 999 }] });
    const migrationRules: WorldRules = { ...rules, migrate: (mapId, x, y) => mapId.startsWith('home_') ? { mapId: mapId as any, x, y } : { mapId: 'world', x: x + 100, y } };
    const game = new GameWorld(db, migrationRules);
    expect(game.state.players.old.mapId).toBe('world');
    expect(Object.values(game.state.camps)).toHaveLength(2);
    const [first, second] = Object.values(game.state.camps);
    expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThanOrEqual(12);
    expect(game.state.buildings.old_wall.hp).toBe(50);
    expect(game.state.buildings.old_wall.storedLoot).toBeUndefined();
    expect(game.state.buildings.home_old_core).toMatchObject({ type: 'anchor_core', hp: 0, ownerId: 'old' });
    expect(game.state.camps.home_old.state).toBe('breached');
    expect(db.getPlayer('old').mapId).toBe('home_base');
    const restored = new GameWorld(db, migrationRules);
    expect(restored.state.camps).toEqual(game.state.camps);
  });
  it('rejects client-requested damage and spends real shot ammunition with cadence', () => {
    const { game, act, advance } = setup();
    expect(act('owner', 'damage', { monsterId: 'monster1', damage: 9999 }).error).toBeTruthy();
    expect(game.state.players.owner.hp).toBe(100);
    expect(act('owner', 'damage', { monsterId: 'monster1' }).error).toBeTruthy();
    advance(1500);
    expect(act('owner', 'damage', { monsterId: 'madeup' }).error).toBeTruthy();
    game.state.players.owner.equipment.weapon = makeItem('rifle', 1);
    expect(act('owner', 'fire').error).toBeTruthy();
    game.state.players.owner.resources.ammo = 2;
    expect(act('owner', 'fire').player.resources.ammo).toBe(1);
    expect(act('owner', 'fire').error).toBeTruthy();
    advance(500);
    expect(act('owner', 'fire').player.resources.ammo).toBe(0);
  });
  it('charges hunger from server time and food restores the server value', () => {
    const { game, act, advance } = setup();
    advance(4000); game.tick();
    expect(game.snapshot('owner').player.satiety).toBe(99);
    game.state.players.owner.inventory[0] = makeItem('food', 1);
    act('owner', 'use_item', { index: 0 });
    expect(game.snapshot('owner').player.satiety).toBe(100);
  });
  it('creates no camp or inventory and never accepts client health, inventory, space or teleport', () => {
    const { game } = setup();
    expect(game.snapshot('owner').player.inventory).toEqual(Array(24).fill(null));
    expect(game.snapshot('owner').player.campId).toBeNull();
    expect(game.move('owner', { x: NaN, y: 0 })).toBe(false);
    expect(game.move('owner', { x: 100, y: 0, hp: 999, mapId: 'home_owner' })).toBe(false);
    game.move('owner', { x: 0, y: 0, hp: 999, shield: 999 });
    expect(game.snapshot('owner').player.hp).toBe(100);
    expect(game.snapshot('owner').player.shield).toBe(0);
  });
  it('places a new player clear of a public core instead of trapping movement inside it', () => {
    const core = { id: 'public-core', type: 'anchor_core' as const, name: '', x: 0, y: 0, hp: 100, maxHp: 100, level: 1, mapId: 'world' as const };
    const game = new GameWorld(createMemoryDb(), { ...rules, buildingsNear: () => [core] });
    game.connect('fresh', '新玩家');
    const p = game.state.players.fresh;
    expect(Math.hypot(p.x, p.y)).toBeGreaterThan(0.62);
  });
  it('does not gain movement distance by flooding zero-time packets', () => {
    const { game } = setup();
    for (let n = 1; n <= 100; n++) game.move('owner', { x: n * 0.01, y: 0 });
    expect(game.state.players.owner.x).toBeLessThanOrEqual(0.3);
  });
  it('does not mint movement allowance on duplicate connections and keeps elapsed movement time', () => {
    const { game, advance } = setup(); let x = 0;
    for (let i = 0; i < 100; i++) {
      game.connect('owner', '主人');
      if (game.move('owner', { x: x + 0.25, y: 0 })) x += 0.25;
    }
    expect(x).toBe(0.25);
    advance(500); game.connect('owner', '主人');
    expect(game.move('owner', { x: x + 1.8, y: 0 })).toBe(true);
  });
  it('derives armor shield capacity without healing from swaps and mitigates authoritative incoming damage', () => {
    const { game, act, advance } = setup(); const p = game.state.players.owner;
    p.inventory[0] = makeItem('vest', 1); p.shield = 20;
    expect(act('owner', 'equip', { slot: 'armor', index: 0 }).error).toBeUndefined();
    expect(p.maxShield).toBe(100); expect(p.shield).toBe(20);
    npcHit(game, advance);
    expect(p.shield).toBe(12); expect(p.hp).toBe(100);
    p.shield = 3; advance(1201); npcHit(game, advance);
    expect(p.shield).toBe(0); expect(p.hp).toBe(95);
    p.shield = 80;
    act('owner', 'unequip', { slot: 'armor' }); expect(p.maxShield).toBe(50); expect(p.shield).toBe(50);
    act('owner', 'equip', { slot: 'armor', index: 0 }); expect(p.maxShield).toBe(100); expect(p.shield).toBe(50);
    game.connect('owner', '主人'); expect(p.shield).toBe(50); expect(p.maxShield).toBe(100);
    expect(p.hp).toBe(95);
  });
  it('regenerates shields only after five seconds without damage and preserves that delay across restart', () => {
    const { game, act, advance, db } = setup(); const p = game.state.players.owner;
    p.equipment.armor = makeItem('vest', 1); game.connect('owner', '主人');
    p.shield = 20; npcHit(game, advance); expect(p.shield).toBe(12);
    advance(4000); game.tick(); expect(p.shield).toBe(12);
    let restoredTime = 14400;
    const restored = new GameWorld(db, rules, () => restoredTime); restored.connect('owner', '主人');
    expect(restored.state.players.owner.lastDamageAt).toBe(10400);
    restoredTime = 15399; restored.tick(); expect(restored.state.players.owner.shield).toBe(12);
    restoredTime = 16400; restored.tick(); expect(restored.state.players.owner.shield).toBe(20);
    restoredTime = 17400; restored.tick(); expect(restored.state.players.owner.shield).toBe(28);
  });
  it('limits dash bursts even if the client permanently claims to be dashing', () => {
    const { game, advance } = setup();
    let x = 0;
    for (let i = 0; i < 20; i++) {
      advance(100);
      if (game.move('owner', { x: x + 1.5, y: 0, isDashing: true })) x += 1.5;
    }
    expect(x).toBeLessThan(15);
  });
  it('depletes shared nodes once and persists across restart; rejected actions do not spend stock', () => {
    const { game, db, act, advance } = setup();
    expect(act('owner', 'gather', { targetId: tree.id }).error).toBeUndefined();
    expect(act('owner', 'gather', { targetId: tree.id }).error).toBeTruthy();
    advance(1000);
    act('raider', 'gather', { targetId: tree.id });
    advance(1000);
    expect(act('owner', 'gather', { targetId: tree.id }).error).toBeTruthy();
    const reload = new GameWorld(db, rules, () => 12_000);
    expect(reload.snapshot('owner').player.resources.wood).toBe(1);
    expect(reload.state.nodes[tree.id].stock).toBe(0);
  });
  it('gathers authored ore companions with an equipped pick and rolls back all yields on full inventory', () => {
    const ore = { ...tree, id: 'ore_node', type: 'boulder' as const, lootTable: [{ itemId: 'stone', name: '石', count: 25 }, { itemId: 'iron_ore', name: '铁矿', count: 20 }] };
    const game = new GameWorld(createMemoryDb(), { ...rules, nodeAt: id => id === ore.id ? ore : undefined, nodesNear: () => [ore] }); game.connect('p', '矿工');
    const p = game.state.players.p; p.equipment.tool = makeItem('pickaxe_stone', 1); p.inventory = Array.from({ length: 24 }, () => makeItem('rifle', 1));
    const gather = () => game.action('p', { requestId: crypto.randomUUID(), action: 'gather', targetId: ore.id });
    expect(gather().error).toContain('背包'); expect(p.resources.stone).toBe(0); expect(game.snapshot('p').nodes[0].stock).toBe(2);
    p.inventory[0] = null; expect(gather().error).toBeUndefined();
    expect(p.resources.stone).toBe(3); expect(p.inventory[0]).toMatchObject({ id: 'iron_ore', count: 1 }); expect(game.state.nodes[ore.id].stock).toBe(1);
  });
  it('retains container contents on full inventory and rejects duplicate takes', () => {
    const { game, act } = setup();
    game.state.players.owner.inventory = Array.from({ length: 24 }, () => makeItem('wp_p1911', 1));
    act('owner', 'search', { targetId: box.id });
    expect(act('owner', 'take_loot', { targetId: box.id, itemId: 'wp_p1911', count: 1 }).error).toBeTruthy();
    expect(game.state.nodes[box.id].items?.[0].count).toBe(1);
    game.state.players.owner.inventory[0] = null;
    const req = { requestId: 'same', action: 'take_loot', targetId: box.id, itemId: 'wp_p1911', count: 1 };
    game.action('owner', req); game.action('owner', req);
    expect(game.state.players.owner.inventory.filter(Boolean)).toHaveLength(24);
    expect(game.state.nodes[box.id].items).toEqual([]);
  });
  it('keeps wall collision, cross-space actions, failed disk commits and old request replay from creating items', () => {
    const { game, db, act } = setup();
    const p = game.state.players.owner;
    game.state.buildings.wall = { id: 'wall', type: 'wood_wall', name: '', x: 0.5, y: 0, hp: 100, maxHp: 100, level: 1, facing: 'ns', mapId: 'world' };
    expect(act('owner', 'gather', { targetId: tree.id }).error).toContain('遮挡');
    delete game.state.buildings.wall;
    act('owner', 'search', { targetId: box.id });
    const save = db.setMeta;
    db.setMeta = () => { throw new Error('disk failure'); };
    expect(act('owner', 'take_loot', { targetId: box.id, itemId: 'wp_p1911', count: 1 }).error).toBe('disk failure');
    expect(p.inventory.filter(Boolean)).toHaveLength(0);
    expect(game.state.nodes[box.id].items?.[0].count).toBe(1);
    db.setMeta = save;
    const packet = { requestId: 'persisted-replay', action: 'gather', targetId: tree.id };
    game.action('owner', packet);
    const restored = new GameWorld(db, rules, () => 10000);
    restored.action('owner', packet);
    expect(restored.state.players.owner.resources.wood).toBe(1);
  });
  it('restores inventory by crafting existing recipes and equipment cannot be forged', () => {
    const { game, act } = setup();
    const p = game.state.players.owner;
    p.resources.wood = 10; p.resources.stone = 4;
    expect(act('owner', 'craft', { recipeId: 'stone_axe', cost: {} }).error).toBeUndefined();
    expect(p.resources.wood).toBe(0); expect(p.resources.stone).toBe(0);
    expect(p.inventory[0]?.id).toBe('axe_stone');
    act('owner', 'equip', { slot: 'tool', index: 0 });
    expect(p.equipment.tool?.id).toBe('axe_stone'); expect(p.inventory[0]).toBeNull();
    expect(act('owner', 'equip', { slot: 'weapon', index: 1, item: makeItem('rifle', 1) }).error).toBeTruthy();
  });
  it('trades canonical server prices and rejects forged prices, quantities and full inventory without spending', () => {
    const { game, act } = setup(); const p = game.state.players.owner;
    p.resources.credits = 1000;
    expect(act('owner', 'buy', { itemId: 'ammo_box', quantity: 1, price: 1 }).error).toBeUndefined();
    expect(p.resources.ammo).toBe(60); expect(p.resources.credits).toBe(400);
    act('owner', 'sell', { itemId: 'ammo', quantity: 60 });
    expect(p.resources.credits).toBe(760); expect(p.resources.ammo).toBe(0);
    expect(act('owner', 'buy', { itemId: 'ammo_box', quantity: -1 }).error).toContain('数量');
    p.inventory = Array.from({ length: 24 }, () => makeItem('rifle', 1));
    expect(act('owner', 'buy', { itemId: 'medkit', quantity: 1 }).error).toContain('背包');
    expect(p.resources.credits).toBe(760);
    const dropped = act('owner', 'drop', { index: 0 });
    expect(dropped.player.inventory[0]).toBeNull();
    expect(Object.values(game.state.drops)[0].items).toMatchObject([{ itemId: 'rifle', count: 1 }]);
  });
  it('preserves wilderness PvP and neutral landmarks while validating actual weapon, ammo, range and cadence', () => {
    const { game, act, advance } = setup(); const p = game.state.players.owner; const enemy = game.state.players.raider;
    p.equipment.weapon = makeItem('wp_p1911', 1); p.resources.ammo = 5;
    expect(act('owner', 'fire', { targetId: 'raider' }).error).toBeTruthy();
    p.x = 150; enemy.x = 152;
    expect(act('owner', 'fire', { targetId: 'raider', damage: 999999 }).error).toBeUndefined();
    expect(enemy.hp).toBe(62); expect(p.resources.ammo).toBe(4);
    expect(act('owner', 'fire', { targetId: 'raider' }).error).toBeTruthy();
    advance(500); enemy.x = 200;
    expect(act('owner', 'fire', { targetId: 'raider' }).error).toBeTruthy();
    expect(p.resources.ammo).toBe(4);
  });
  it('creates exactly one paid camp outside protections, with only a core and shared perimeter entry', () => {
    const { game, act } = setup();
    const p = game.state.players.owner;
    p.resources.wood = 40; p.resources.stone = 20;
    expect(act('owner', 'create_camp', { x: 1, y: 0 }).error).toBeTruthy();
    p.x = 100;
    expect(act('owner', 'create_camp', { x: 100, y: 0 }).error).toBeUndefined();
    expect(act('owner', 'create_camp', { x: 100, y: 0 }).error).toBeTruthy();
    expect(p.resources.wood).toBe(20);
    expect(Object.values(game.state.buildings).map(b => b.type)).toEqual(['anchor_core']);
    expect(act('raider', 'enter_camp', { campId: p.campId }).error).toBeTruthy();
    game.state.players.raider.x = 100;
    act('owner', 'enter_camp', { campId: p.campId }); act('raider', 'enter_camp', { campId: p.campId });
    expect(game.state.players.raider.mapId).toBe('home_owner');
    expect(game.state.players.raider.y).toBe(28);
    expect(game.snapshot('owner').buildings).toEqual(game.snapshot('raider').buildings);
  });
  it('keeps a destroyed core as a repairable ruin and blocks new construction until repaired', () => {
    const { game, act } = setup(); const p = game.state.players.owner;
    p.x = 100; Object.assign(p.resources, { wood: 100, stone: 100, scrap: 20 });
    act('owner', 'create_camp', { x: 100, y: 0 }); act('owner', 'enter_camp', { campId: p.campId });
    const core = Object.values(game.state.buildings)[0]; core.hp = 0; p.x = 1; p.y = 0;
    expect(act('owner', 'build', { buildType: 'wood_wall', x: 3, y: 0 }).error).toBeTruthy();
    expect(act('owner', 'repair', { targetId: core.id }).error).toBeUndefined();
    expect(act('owner', 'build', { buildType: 'wood_wall', x: 3, y: 0 }).error).toBeUndefined();
    expect(game.state.camps[p.campId!].ownerId).toBe('owner');
  });
  it('requires own camp and actual costs; storage transfer and broken storage loot conserve quantities', () => {
    const { game, act } = setup();
    const owner = game.state.players.owner; owner.x = 100;
    Object.assign(owner.resources, { wood: 100, stone: 100, scrap: 100, parts: 20 });
    act('owner', 'create_camp', { x: 100, y: 0 }); act('owner', 'enter_camp', { campId: owner.campId });
    owner.x = 4; owner.y = 4;
    expect(act('owner', 'build', { buildType: 'storage_box', x: 5, y: 4 }).error).toBeUndefined();
    const storage = Object.values(game.state.buildings).find(b => b.type === 'storage_box')!;
    act('owner', 'deposit', { targetId: storage.id, itemId: 'wood', count: 10 });
    expect(game.state.storage[storage.id].wood).toBe(10);
    expect(act('owner', 'search', { targetId: storage.id }).loot?.items[0]).toMatchObject({ itemId: 'wood', count: 10 });
    const raider = game.state.players.raider; raider.mapId = owner.mapId; raider.x = 4; raider.y = 4;
    expect(act('raider', 'withdraw', { targetId: storage.id, itemId: 'wood', count: 10 }).error).toBeTruthy();
    expect(act('raider', 'build', { buildType: 'wood_wall', x: 4, y: 5 }).error).toBeTruthy();
    raider.resources.c4 = 1;
    act('raider', 'raid', { targetId: storage.id, supplyId: 'c4_explosive', damage: 999999 });
    expect(raider.resources.c4).toBe(0);
    act('raider', 'take_loot', { targetId: storage.id, itemId: 'wood', count: 10 });
    expect(raider.resources.wood).toBe(10);
    expect(game.state.storage[storage.id].wood).toBe(0);
    expect(game.snapshot('raider').buildings?.find(b => b.id === storage.id)).not.toHaveProperty('storedLoot');
  });
  it('runs loaded offline defense with cadence, range, line of sight and persists spent ammunition', () => {
    const { game, db, advance } = setup();
    const p = game.state.players.raider; p.mapId = 'home_owner'; p.x = 1; p.y = 0;
    game.state.buildings.t = { id: 't', type: 'turret', name: '炮塔', x: 0, y: 0, hp: 100, maxHp: 100, level: 1, mapId: 'home_owner', ownerId: 'owner' };
    game.state.ammo.t = 2;
    game.disconnect('owner');
    game.tick();
    expect(p.hp).toBe(88); expect(game.state.ammo.t).toBe(1);
    game.tick(); expect(p.hp).toBe(88);
    advance(1000); game.tick();
    expect(p.hp).toBe(76); expect(game.state.ammo.t).toBe(0);
    expect(new GameWorld(db, rules).state.ammo.t).toBe(0);
  });
  it('preserves the original disconnected body deadline across restart even without prior combat', () => {
    const { game, db } = setup(); let time = 10000;
    const p = game.state.players.raider; p.mapId = 'home_owner'; p.x = 1; p.y = 0;
    const turret = facility(game, 'turret', 0, 0); game.state.ammo[turret.id] = 3;
    expect(p.combatUntil).toBe(0);
    game.disconnect('raider');
    const restored = new GameWorld(db, rules, () => time);
    expect(restored.visiblePlayers('raider').map(player => player.id)).toContain('raider');
    restored.tick(); expect(restored.state.players.raider.hp).toBe(88); expect(restored.state.ammo[turret.id]).toBe(2);
    time = 39999;
    expect(restored.visiblePlayers('raider').map(player => player.id)).toContain('raider');
    restored.tick(); expect(restored.state.players.raider.hp).toBe(88); expect(restored.state.players.raider.shield).toBe(28);
    time = 40000;
    const afterDeadline = new GameWorld(db, rules, () => time);
    expect(afterDeadline.visiblePlayers('raider')).toEqual([]);
    afterDeadline.tick(); expect(afterDeadline.state.players.raider.hp).toBe(88); expect(afterDeadline.state.players.raider.shield).toBe(28); expect(afterDeadline.state.ammo[turret.id]).toBe(1);
  });
  it('blocks offline defense through walls and drops real backpack on death with combat disconnect retention', () => {
    const { game, advance } = setup();
    const p = game.state.players.raider; p.mapId = 'home_owner'; p.x = 2; p.y = 0; p.hp = 10; p.resources.wood = 12;
    game.state.buildings.t = { id: 't', type: 'turret', name: '', x: 0, y: 0, hp: 100, maxHp: 100, level: 1, mapId: p.mapId, ownerId: 'owner' };
    game.state.buildings.wall = { ...game.state.buildings.t, id: 'wall', type: 'wood_wall', x: 1, facing: 'ns' };
    game.state.ammo.t = 2;
    game.tick(); expect(p.hp).toBe(10); expect(game.state.ammo.t).toBe(2);
    delete game.state.buildings.wall;
    game.disconnect('raider'); game.tick();
    expect(p.mapId).toBe('world'); expect(p.hp).toBe(100); expect(p.resources.wood).toBe(0);
    expect(Object.values(game.state.drops)[0].items.find(i => i.itemId === 'wood')?.count).toBe(12);
    const drop = Object.values(game.state.drops)[0];
    const owner = game.state.players.owner; owner.mapId = drop.mapId; owner.x = drop.x; owner.y = drop.y;
    expect(game.action('owner', { requestId: 'search-drop', action: 'search', targetId: drop.id }).loot?.items).toEqual(drop.items);
    advance(31_000); game.tick();
    expect(Object.values(game.state.drops)).toHaveLength(1);
  });
  it('keeps scopes separate and rejects hostile packets with no supplies, cooldown or proximity', () => {
    const { game, act } = setup();
    game.state.players.raider.mapId = 'home_other';
    expect(game.visiblePlayers('owner').map(p => p.id)).toEqual(['owner']);
    expect(act('owner', 'pvp_hit', { targetId: 'raider', damage: 100000 }).error).toBeTruthy();
    expect(act('owner', 'raid', { targetId: 'missing', supplyId: 'c4_explosive' }).error).toBeTruthy();
    expect(act('owner', 'gather', { targetId: tree.id, toolKind: 'axe' }).player.resources.wood).toBeLessThanOrEqual(1);
  });
});
