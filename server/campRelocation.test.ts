import { describe, expect, it } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld, type WorldRules } from './worldState';
import { makeItem } from '../src/game/items';

function setup() {
  let now = 10_000, sequence = 0;
  const db = createMemoryDb();
  const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], campSiteAllowed: x => x >= 48, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const game = new GameWorld(db, rules, () => now);
  for (const id of ['owner', 'raider', 'member']) game.connect(id, id);
  const owner = game.state.players.owner; Object.assign(owner, { x: 100, y: 100 }); owner.resources.wood = owner.resources.stone = 100;
  const action = (id: string, action: string, params = {}, requestId = `action${++sequence}`) => game.action(id, { action, requestId, ...params });
  expect(action('owner', 'create_camp', { x: 100, y: 100 }).error).toBeUndefined();
  const camp = game.state.camps.home_owner;
  for (const [id, type, x, y] of [['box', 'storage_box', 3, 0], ['turret', 'turret', 0, 3], ['farm', 'farm_plot', 4, 4]] as const) game.state.buildings[id] = { id, type, name: id, x, y, hp: 300, maxHp: 300, level: 1, mapId: 'home_owner', ownerId: 'owner' };
  camp.members = ['member']; camp.level = 2; camp.size = 96;
  game.state.storage.box = { wood: 7 }; game.state.ammo.turret = 8;
  game.state.production.farm = { recipeId: 'grow_potato', resultItemId: 'crop_potato', resultCount: 4, readyAt: now + 60_000 };
  Object.assign(owner, { x: 200, y: 100, hp: 73, shield: 12, satiety: 60 }); game.persist();
  return { game, db, rules, owner, camp, action, setTime: (t: number) => { now = t; }, relocate: (params = {}, requestId?: string) => action('owner', 'relocate_camp', { x: 200, y: 100, ...params }, requestId) };
}

describe('camp entrance relocation', () => {
  it('moves only the existing entrance, pays once and preserves assets, roles, character and production through replay/restart', () => {
    const f = setup(), assets = structuredClone({ buildings: f.game.state.buildings, storage: f.game.state.storage, ammo: f.game.state.ammo, production: f.game.state.production });
    const player = structuredClone(f.owner);
    expect(f.relocate({ campId: 'home_someone_else', cost: {} }, 'relocate-once').error).toBeUndefined();
    expect(f.camp).toMatchObject({ x: 200, y: 100, level: 2, size: 96, members: ['member'], state: 'active' });
    expect(f.owner.resources).toMatchObject({ wood: player.resources.wood - 40, stone: player.resources.stone - 20 });
    expect(f.owner).toMatchObject({ x: player.x, y: player.y, mapId: 'world', hp: 73, shield: 12, satiety: 60, campId: 'home_owner' });
    expect({ buildings: f.game.state.buildings, storage: f.game.state.storage, ammo: f.game.state.ammo, production: f.game.state.production }).toEqual(assets);
    const restored = new GameWorld(f.db, f.rules, () => 10_000);
    expect(restored.action('owner', { action: 'relocate_camp', requestId: 'relocate-once', x: 400, y: 100 }).error).toBeUndefined();
    expect(restored.state.camps.home_owner.x).toBe(200);
    expect(restored.state.players.owner.resources.wood).toBe(player.resources.wood - 40);
    expect(restored.state.storage).toEqual(assets.storage); expect(restored.state.ammo).toEqual(assets.ammo); expect(restored.state.production).toEqual(assets.production);
    expect(f.relocate().error).toContain('原入口');
  });

  it('keeps creation at 20 wood and 10 stone, and spends exactly twice that on relocation', () => {
    const f = setup();
    expect(f.owner.resources).toMatchObject({ wood: 80, stone: 90 });
    f.owner.resources.wood = 40; f.owner.resources.stone = 20;
    expect(f.relocate().error).toBeUndefined();
    expect(f.owner.resources).toMatchObject({ wood: 0, stone: 0 });
  });

  it.each([{ wood: 39, stone: 20 }, { wood: 40, stone: 19 }])('rejects insufficient relocation materials %j without partial payment', resources => {
    const f = setup(); Object.assign(f.owner.resources, resources);
    const before = structuredClone(f.game.state);
    expect(f.relocate().error).toContain('材料不足');
    expect(f.game.state).toEqual(before);
  });

  it.each(['outsider', 'inside', 'far', 'protected', 'overlap', 'resource', 'poor', 'breached', 'occupied', 'disconnected', 'player-combat', 'camp-combat'] as const)('rejects %s relocation without changing materials, entrance or stored contents', reason => {
    const f = setup(); let id = 'owner'; let site = { x: 200, y: 100 };
    if (reason === 'outsider') id = 'member';
    if (reason === 'inside') f.owner.mapId = 'home_owner';
    if (reason === 'far') site.x = 400;
    if (reason === 'protected') f.rules.campSiteAllowed = () => false;
    if (reason === 'overlap') f.game.state.camps.home_other = { id: 'home_other', ownerId: 'other', ownerName: 'other', x: 201, y: 100, mapId: 'world' };
    if (reason === 'resource') f.rules.nodesNear = () => [{ id: 'tree', type: 'tree', name: '树', x: 200, y: 100, radius: 1, prompt: '', available: true }];
    if (reason === 'poor') f.owner.resources.wood = 0;
    if (reason === 'breached') f.game.state.buildings.home_owner_core.hp = 0;
    if (reason === 'occupied' || reason === 'disconnected') { f.game.state.players.member.mapId = 'home_owner'; if (reason === 'disconnected') f.game.disconnect('member'); }
    if (reason === 'player-combat') f.owner.combatUntil = 40_000;
    if (reason === 'camp-combat') Object.assign(f.camp, { combatUntil: 40_000 });
    const before = structuredClone(f.game.state);
    const errors = { outsider: '只有营地主人', inside: '公共野外', far: '距离过远', protected: '保护', overlap: '距离其他营地', resource: '资源', poor: '材料不足', breached: '核心', occupied: '仍有人', disconnected: '仍有人', 'player-combat': '交战', 'camp-combat': '交战' };
    expect(f.action(id, 'relocate_camp', site).error).toContain(errors[reason]);
    expect(f.game.state).toEqual(before);
  });

  it('rolls back relocation and its replay guard when saving fails, then charges exactly once on retry', () => {
    const f = setup(), before = structuredClone(f.game.state), save = f.db.checkpointWorld;
    f.db.checkpointWorld = () => { throw Error('relocation checkpoint rejected'); };
    expect(f.relocate({}, 'retry-relocate').error).toContain('relocation checkpoint rejected'); expect(f.game.state).toEqual(before);
    f.db.checkpointWorld = save;
    expect(f.relocate({}, 'retry-relocate').error).toBeUndefined();
    expect(f.game.state.players.owner.resources.wood).toBe(before.players.owner.resources.wood - 40);
    expect(f.game.state.camps.home_owner.x).toBe(200);
  });

  it('keeps the raid lock after the attacker leaves and after restart, then permits relocation at its deadline', () => {
    const f = setup(), raider = f.game.state.players.raider;
    Object.assign(raider, { mapId: 'home_owner', x: 2, y: 0 }); raider.resources.c4 = 1;
    expect(f.action('raider', 'raid', { targetId: 'box', supplyId: 'c4_explosive' }).error).toBeUndefined();
    expect(f.game.state.camps.home_owner).toMatchObject({ combatUntil: 40_000 });
    Object.assign(raider, { x: 0, y: 44 }); expect(f.action('raider', 'leave_camp').error).toBeUndefined();
    const restored = new GameWorld(f.db, f.rules, () => 20_000);
    expect(restored.action('owner', { action: 'relocate_camp', requestId: 'too-soon', x: 200, y: 100 }).error).toContain('交战');
    f.setTime(40_000); expect(f.relocate().error).toBeUndefined();
  });

  it('marks defense hits as camp combat and rolls back the camp deadline along with a rejected defensive shot', () => {
    const f = setup(); Object.assign(f.game.state.players.raider, { mapId: 'home_owner', x: 1, y: 3 });
    const before = structuredClone(f.game.state), save = f.db.checkpointWorld;
    f.db.checkpointWorld = () => { throw Error('defense checkpoint rejected'); };
    expect(() => f.game.tick()).toThrow('defense checkpoint rejected'); expect(f.game.state).toEqual(before);
    f.db.checkpointWorld = save; f.game.tick();
    expect(f.game.state.camps.home_owner).toMatchObject({ combatUntil: 40_000 }); expect(f.game.state.ammo.turret).toBe(7);
  });

  it('blocks dismantling during a camp attack even when the owner is unharmed, while permitting paid repairs', () => {
    const f = setup(); Object.assign(f.owner, { mapId: 'home_owner', x: 2, y: 0 });
    Object.assign(f.game.state.players.raider, { mapId: 'home_owner', x: 2, y: 3 });
    expect(f.action('owner', 'remove_building', { targetId: 'box' }).error).toContain('交战');
    f.game.state.buildings.box.hp = 100; f.owner.resources.scrap = 1;
    expect(f.action('owner', 'repair', { targetId: 'box' }).error).toBeUndefined();
    expect(f.game.state.buildings.box.hp).toBe(300);
  });

  it('marks actual camp PvP damage and renews the lock when a raider takes real warehouse contents', () => {
    const f = setup(), raider = f.game.state.players.raider;
    Object.assign(f.owner, { mapId: 'home_owner', x: 2, y: 2 });
    Object.assign(raider, { mapId: 'home_owner', x: 2, y: 3 });
    raider.equipment.weapon = makeItem('wp_p1911', 1); raider.resources.ammo = 1;
    expect(f.action('raider', 'fire', { targetId: 'owner' }).error).toBeUndefined();
    expect(f.game.state.camps.home_owner).toMatchObject({ combatUntil: 40_000 });
    f.game.state.buildings.box.hp = 0; Object.assign(raider, { x: 2, y: 0 }); f.setTime(20_000);
    expect(f.action('raider', 'withdraw', { targetId: 'box', itemId: 'wood', count: 1 }, 'theft').error).toBeUndefined();
    expect(f.game.state.camps.home_owner).toMatchObject({ combatUntil: 50_000 });
    expect(f.game.state.storage.box.wood).toBe(6);
    f.setTime(25_000); f.action('raider', 'withdraw', { targetId: 'box', itemId: 'wood', count: 1 }, 'theft');
    expect(f.game.state.storage.box.wood).toBe(6); expect(f.game.state.camps.home_owner).toMatchObject({ combatUntil: 50_000 });
  });

  it('does not turn starvation into an attack on the camp', () => {
    const f = setup(); Object.assign(f.owner, { mapId: 'home_owner', x: 2, y: 0, satiety: 0, shield: 0 });
    f.setTime(11_000); f.game.tick();
    expect(f.owner.hp).toBeLessThan(73); expect(f.game.state.camps.home_owner.combatUntil).toBeUndefined();
  });
});
