import { describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from './db';
import { GameWorld, type WorldRules } from './worldState';
import { makeItem } from '../src/game/items';

const tree = { id: 'renewal-tree', name: '树', type: 'tree' as const, x: 1, y: 0, radius: 1, prompt: '', available: true, stock: 2, maxStock: 2, respawnSec: 60 };
function setup() {
  let time = 10000;
  const db = createMemoryDb(), rules: WorldRules = { nodeAt: id => id === tree.id ? tree : undefined, nodesNear: () => [tree], buildingsNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const game = new GameWorld(db, rules, () => time); game.connect('p', '采集者');
  const p = game.state.players.p;
  game.state.nodes[tree.id] = { stock: 0, respawnAt: 70000 }; game.persist();
  return { db, game, rules, p, setTime: (t: number) => { time = t; } };
}

describe('authoritative resource renewal', () => {
  it('never renews from a snapshot, rejected harvest or reconnect while a player stays nearby', () => {
    const { game, p, setTime } = setup(); setTime(70000);
    const node = structuredClone(game.state.nodes[tree.id]);
    expect(game.snapshot('p').nodes[0]).toMatchObject(node); expect(game.state.nodes[tree.id]).toEqual(node);
    expect(game.action('p', { action: 'gather', requestId: 'camping', targetId: tree.id }).error).toContain('耗尽');
    game.connect('p', '重登'); game.tick(); expect(game.state.nodes[tree.id]).toEqual(node); expect(p.resources.wood).toBe(0);
  });
  it('renews only empty due nodes in an unobserved area and persists the shared result', () => {
    const { db, game, rules, p, setTime } = setup(); p.x = 47;
    setTime(69999); game.tick(); expect(game.state.nodes[tree.id].stock).toBe(0);
    setTime(70000); game.tick(); expect(game.state.nodes[tree.id].stock).toBe(0); // next scheduled pass has not arrived
    setTime(74999); game.tick(); expect(game.sharedTickChanged).toBe(true);
    expect(game.state.nodes[tree.id]).toEqual({ stock: 2, respawnAt: 0 });
    const restored = new GameWorld(db, rules, () => 75000);
    expect(restored.state.nodes[tree.id]).toEqual({ stock: 2, respawnAt: 0 });
    expect(restored.state.players.p.resources.wood).toBe(0);
  });
  it('uses every active public-world observer, including the exact visibility boundary, but ignores private instances', () => {
    const { game, p, setTime } = setup(); p.mapId = 'home_other'; p.x = 1;
    game.connect('watcher', '路人'); const watcher = game.state.players.watcher; watcher.x = 46;
    setTime(70000); game.tick(); expect(game.state.nodes[tree.id].stock).toBe(0);
    watcher.x = 46.001; setTime(75000); game.tick(); expect(game.state.nodes[tree.id].stock).toBe(2);
  });
  it('retains an offline combat body as an observer only until its original deadline', () => {
    const { game, p, setTime } = setup(); setTime(50000); p.combatUntil = 100000; game.disconnect('p');
    setTime(70000); game.tick(); expect(game.state.nodes[tree.id].stock).toBe(0);
    setTime(80000); game.tick(); expect(game.state.nodes[tree.id].stock).toBe(2);
    expect(p.disconnectUntil).toBe(80000);
  });
  it('does not discard unclaimed contents or generate another untouched node during a refresh pass', () => {
    const { game, p, setTime } = setup(); p.x = 100;
    const items = [{ itemId: 'scrap', name: '废铁', count: 1 }]; game.state.nodes[tree.id].items = items;
    setTime(70000); game.tick(); expect(game.state.nodes[tree.id]).toEqual({ stock: 0, respawnAt: 70000, items });
    expect(Object.keys(game.state.nodes)).toEqual([tree.id]);
    items[0].count = 0; setTime(75000); game.tick(); expect(game.state.nodes[tree.id]).toEqual({ stock: 2, respawnAt: 0 });
  });
  it('keeps depletion across restart until an unobserved server pass, not a read or a new login', () => {
    const { db, game, rules, setTime } = setup(); setTime(20000); game.disconnect('p');
    const restored = new GameWorld(db, rules, () => 70000);
    expect(restored.snapshot('p').nodes[0].stock).toBe(0);
    restored.tick(); expect(restored.state.nodes[tree.id].stock).toBe(0);
  });
  it('rolls back a rejected renewal checkpoint and retries at the same clock without losing a prior private commit', () => {
    const { db, game, p, setTime } = setup(); p.x = 100; p.equipment.weapon = makeItem('rifle', 1); p.resources.ammo = 10; game.persist();
    expect(game.actionPlayer('p', { action: 'fire', requestId: 'paid-before-renewal' }).error).toBeUndefined();
    const before = structuredClone(game.state), commits = db.listWorldPlayerCommits(), save = db.checkpointWorld;
    setTime(70000); db.checkpointWorld = () => { throw Error('renewal save rejected'); };
    expect(() => game.tick()).toThrow('renewal save rejected');
    expect(game.state).toEqual(before); expect(game.state.players.p).toBe(p); expect(db.listWorldPlayerCommits()).toEqual(commits);
    db.checkpointWorld = save; game.tick(); expect(game.sharedTickChanged).toBe(true);
    expect(game.state.nodes[tree.id]).toEqual({ stock: 2, respawnAt: 0 }); expect(p.resources.ammo).toBe(9);
    expect(db.listWorldPlayerCommits()).toEqual([]);
    expect(game.actionPlayer('p', { action: 'fire', requestId: 'paid-before-renewal' }).player.resources.ammo).toBe(9);
  });
  it('does no definition lookups before the next pass or for non-due, nonempty and unclaimed nodes', () => {
    const { game, rules, p, setTime } = setup(); p.x = 100;
    for (let i = 0; i < 10000; i++) game.state.nodes['future-' + i] = { stock: 0, respawnAt: 100000 };
    game.state.nodes.full = { stock: 1, respawnAt: 10000 };
    const lookup = vi.spyOn(rules, 'nodeAt'), checkpoint = vi.spyOn(game, 'persist');
    setTime(70000); game.tick(); expect(lookup).toHaveBeenCalledTimes(1); expect(checkpoint).toHaveBeenCalledTimes(1);
    lookup.mockClear(); setTime(70100); game.tick(); expect(lookup).not.toHaveBeenCalled();
    setTime(75000); game.tick(); expect(lookup).not.toHaveBeenCalled(); expect(checkpoint).toHaveBeenCalledTimes(1);
  });
  it('still renews when another shared event already requires the same checkpoint', () => {
    const { game, p, setTime } = setup(); p.x = 100;
    game.state.drops.old = { id: 'old', name: '旧包', mapId: 'world', x: 0, y: 0, items: [], expiresAt: 70000 };
    setTime(70000); game.tick();
    expect(game.state.drops.old).toBeUndefined(); expect(game.state.nodes[tree.id].stock).toBe(2);
  });
  it('preserves real partially claimed container loot, then renews only after the final take and awards one fresh set', () => {
    const { game, rules, p, setTime } = setup();
    const box = { ...tree, type: 'box' as const, stock: 1, maxStock: 1, lootTable: [{ itemId: 'wood', name: '木材', count: 3 }, { itemId: 'scrap', name: '废铁', count: 2 }] };
    rules.nodeAt = id => id === box.id ? box : undefined; rules.nodesNear = () => [box];
    game.state.nodes[box.id] = { stock: 1, respawnAt: 0 };
    const action = (requestId: string, action: string, extra = {}) => game.action('p', { requestId, action, targetId: box.id, ...extra });
    expect(action('open-old', 'search').loot?.items).toEqual(box.lootTable);
    expect(action('partial', 'take_loot', { itemId: 'wood', count: 1 }).error).toBeUndefined();
    p.x = 100; setTime(70000); game.tick();
    expect(game.state.nodes[box.id]).toMatchObject({ stock: 1, respawnAt: 0, items: [{ itemId: 'wood', count: 2 }, { itemId: 'scrap', count: 2 }] });
    p.x = 0; setTime(71000);
    expect(action('rest-wood', 'take_loot', { itemId: 'wood', count: 2 }).error).toBeUndefined();
    expect(action('rest-scrap', 'take_loot', { itemId: 'scrap', count: 2 }).error).toBeUndefined();
    expect(game.state.nodes[box.id]).toEqual({ stock: 0, respawnAt: 131000, items: [] });
    p.x = 100; setTime(131000); game.tick(); expect(game.state.nodes[box.id]).toEqual({ stock: 1, respawnAt: 0 });
    p.x = 0; expect(action('open-new', 'search').loot?.items).toEqual(box.lootTable);
    expect(action('new-wood', 'take_loot', { itemId: 'wood', count: 3 }).error).toBeUndefined();
    expect(action('new-wood', 'take_loot', { itemId: 'wood', count: 3 }).error).toBeUndefined();
    expect(action('new-scrap', 'take_loot', { itemId: 'scrap', count: 2 }).error).toBeUndefined();
    expect(p.resources).toMatchObject({ wood: 6, scrap: 4 });
    expect(game.state.nodes[box.id]).toEqual({ stock: 0, respawnAt: 191000, items: [] });
  });
});
