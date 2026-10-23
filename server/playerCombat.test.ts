import { describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld, isPlayerTargetedFire, type WorldRules } from './worldState';
import { makeItem } from '../src/game/items';

function setup() {
  let time = 10000;
  const db = createMemoryDb(), rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const game = new GameWorld(db, rules, () => time); game.connect('p', '射手'); game.connect('q', '受击者');
  const p = game.state.players.p, q = game.state.players.q, mapId = 'home_combat';
  game.state.camps[mapId] = { id: mapId, ownerId: p.id, ownerName: p.name, mapId: 'world', x: 100, y: 100, members: [], size: 64 };
  game.state.buildings.core = { id: 'core', type: 'anchor_core', name: '核心', x: 0, y: -10, hp: 1200, maxHp: 1200, level: 1, ownerId: p.id, mapId };
  Object.assign(p, { mapId, x: 0, y: 0 }); Object.assign(q, { mapId, x: 0, y: 2, shield: 100 });
  p.equipment.weapon = makeItem('rifle', 1); p.resources.ammo = 10; q.equipment.armor = makeItem('vest', 1); q.inventory[0] = makeItem('food', 2); q.resources.wood = 6;
  game.persist();
  return { db, game, p, q, rules, now: () => time, advance: (ms: number) => { time += ms; } };
}

describe('player combat projections', () => {
  it('commits both sides of a nonlethal hit without constructing shared lists', () => {
    const { game, db, q } = setup(), snapshot = vi.spyOn(game, 'snapshot').mockImplementation(() => { throw Error('Unexpected shared reply'); });
    const receipt = game.actionCombat('p', { action: 'fire', targetId: 'q', requestId: 'hit' });
    expect(snapshot).not.toHaveBeenCalled(); expect(receipt.requiresFullSync).toBe(false); expect(receipt.targetId).toBe('q');
    expect(receipt.state.error).toBeUndefined(); expect(receipt.state.player.resources.ammo).toBe(9);
    expect(receipt.state).not.toHaveProperty('buildings'); expect(receipt.state).not.toHaveProperty('drops');
    expect(q).toMatchObject({ hp: 95, shield: 0, combatUntil: 40000, lastDamageAt: 10000 });
    const saved = JSON.parse(db.getMeta('authoritative-world-v2')!);
    expect(saved.players.p.resources.ammo).toBe(9); expect(saved.players.q.hp).toBe(95); expect(saved.handled.p).toEqual(['hit']);
  });
  it('marks death and replay for full synchronization without duplicating payment, drops or life generations', () => {
    const { game, p, q } = setup(); q.hp = 5; q.shield = 0;
    const request = { action: 'fire', targetId: 'q', requestId: 'lethal' }, before = game.respawnVersion('q');
    const receipt = game.actionCombat('p', request); expect(receipt.requiresFullSync).toBe(true);
    expect(game.respawnVersion('q')).toBe(before + 1); expect(q.mapId).toBe('world'); expect(q.hp).toBe(100);
    const drops = structuredClone(game.state.drops); expect(Object.keys(drops)).toHaveLength(1);
    expect(Object.values(drops)[0].items).toEqual(expect.arrayContaining([expect.objectContaining({ itemId: 'wood', count: 6 }), expect.objectContaining({ itemId: 'food', count: 2 })]));
    expect(game.actionCombat('p', request).requiresFullSync).toBe(true);
    expect(game.state.drops).toEqual(drops); expect(p.resources.ammo).toBe(9); expect(game.respawnVersion('q')).toBe(before + 1);
  });
  it('rolls back rejected lethal damage and life state while preserving earlier private fire, then pays a retry once', () => {
    const { game, db, p, q, advance } = setup(); q.hp = 5; q.shield = 0;
    expect(game.actionPlayer('p', { action: 'fire', requestId: 'earlier-private' }).error).toBeUndefined(); advance(120);
    const before = structuredClone(game.state), commits = db.listWorldPlayerCommits(), life = game.respawnVersion('q'), save = db.checkpointWorld;
    db.checkpointWorld = () => { throw Error('hit checkpoint rejected'); };
    const request = { action: 'fire', targetId: 'q', requestId: 'retry-hit' };
    const failed = game.actionCombat('p', request); expect(failed.state.error).toBe('hit checkpoint rejected'); expect(failed.requiresFullSync).toBe(false);
    expect(game.state).toEqual(before); expect(game.state.players.p).toBe(p); expect(game.state.players.q).toBe(q); expect(game.respawnVersion('q')).toBe(life); expect(db.listWorldPlayerCommits()).toEqual(commits);
    db.checkpointWorld = save; expect(game.actionCombat('p', request).requiresFullSync).toBe(true);
    expect(p.resources.ammo).toBe(8); expect(Object.keys(game.state.drops)).toHaveLength(1); expect(db.listWorldPlayerCommits()).toEqual([]);
  });
  it('does not undo a committed death when reply construction fails, and replays a full-sync receipt after restart', () => {
    const { game, db, q, rules, now } = setup(); q.hp = 5; q.shield = 0;
    const request = { action: 'fire', targetId: 'q', requestId: 'lost-death-reply' };
    const view = vi.spyOn(game, 'snapshotPlayer').mockImplementationOnce(() => { throw Error('reply failed'); });
    expect(() => game.actionCombat('p', request)).toThrow('reply failed'); view.mockRestore();
    const restored = new GameWorld(db, rules, now), receipt = restored.actionCombat('p', request);
    expect(receipt.requiresFullSync).toBe(true); expect(receipt.state.player.resources.ammo).toBe(9);
    expect(Object.keys(restored.state.drops)).toHaveLength(1); expect(restored.state.players.q.mapId).toBe('world');
  });
  it('rejects invalid targets without changing either player and keeps monsters/other actions out of the projection path', () => {
    const { game, p, q } = setup(); const before = structuredClone(game.state);
    expect(game.actionCombat('p', { action: 'fire', targetId: 'missing', requestId: 'invalid' }).state.error).toBeTruthy();
    expect(game.state).toEqual(before); expect(p.resources.ammo).toBe(10); expect(q.hp).toBe(100);
    expect(() => game.actionCombat('p', { action: 'fire', monsterId: 'monster', targetId: 'q', requestId: 'mixed' })).toThrow('玩家目标');
    expect(() => game.actionCombat('p', { action: 'gather', targetId: 'q', requestId: 'wrong' })).toThrow('玩家目标');
    expect(isPlayerTargetedFire({ action: 'fire', targetId: 'q' })).toBe(true);
    expect(isPlayerTargetedFire({ action: 'fire', targetId: {} })).toBe(false);
    expect(isPlayerTargetedFire({ action: 'fire' })).toBe(false);
  });
});
