import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { createDb, createMemoryDb, type DbHandle } from './db';
import { GameWorld, type WorldRules } from './worldState';
import { makeItem } from '../src/game/items';

const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
function setup(db: DbHandle = createMemoryDb(), extra: Partial<WorldRules> = {}) {
  let time = 10000;
  const game = new GameWorld(db, { ...rules, ...extra }, () => time);
  game.connect('p', '甲');
  const p = game.state.players.p; p.equipment.weapon = makeItem('rifle', 1); p.resources.ammo = 10;
  game.persist();
  return { game, db, p, advance: (ms: number) => time += ms, now: () => time };
}
const saved = (db: DbHandle) => JSON.parse(db.getMeta('authoritative-world-v2')!);

describe('five-second player checkpoints', () => {
  it('saves active movement and paid replay guards without traversing buildings or cold accounts', () => {
    const { game, db, advance } = setup();
    game.connect('cold', '离线'); game.disconnect('cold'); game.tick();
    advance(250); expect(game.move('p', { x: 0.8, y: 0 })).toBe(true);
    expect(game.actionPlayer('p', { action: 'fire', requestId: 'paid' }).player.resources.ammo).toBe(9);
    advance(250); expect(game.move('p', { x: 1.5, y: 0 })).toBe(true);
    Object.defineProperty(game.state.buildings, 'toJSON', { value: () => { throw Error('Unnecessary world serialization'); } });
    game.persistPeriodic();
    expect(db.listWorldPlayerCommits().map(r => r.id)).toEqual(['p']);
    expect(saved(db).players.p.x).toBe(0);
    const restored = new GameWorld(db, rules, () => 10500);
    expect(restored.state.players.p).toMatchObject({ x: 1.5, resources: { ammo: 9 } });
    expect(restored.state.handled.p).toEqual(['paid']);
    expect(restored.actionPlayer('p', { action: 'fire', requestId: 'paid' }).player.resources.ammo).toBe(9);
  });
  it('keeps an existing private commit intact when a later row rejects the atomic SQLite batch', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sdc-periodic-')), 'world.sqlite'), db = createDb(file);
    const { game, advance } = setup(db); game.connect('q', '乙'); game.state.players.q.y = 2; game.persist();
    game.actionPlayer('p', { action: 'fire', requestId: 'paid' });
    advance(300); expect(game.move('p', { x: 1, y: 0 })).toBe(true); expect(game.move('q', { x: 1, y: 2 })).toBe(true);
    const before = db.listWorldPlayerCommits(), control = new Database(file);
    try {
      control.exec("CREATE TRIGGER reject_periodic BEFORE INSERT ON world_player_commits WHEN NEW.id='q' BEGIN SELECT RAISE(ABORT, 'periodic row rejected'); END");
      expect(() => game.persistPeriodic()).toThrow('periodic row rejected');
      expect(db.listWorldPlayerCommits()).toEqual(before);
      control.exec('DROP TRIGGER reject_periodic'); game.persistPeriodic();
      const restored = new GameWorld(db, rules, () => 10300);
      expect(restored.state.players.p).toMatchObject({ x: 1, resources: { ammo: 9 } });
      expect(restored.state.players.q).toMatchObject({ x: 1, y: 2 }); expect(restored.state.handled.p).toEqual(['paid']);
      expect(control.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally { control.close(); }
  });
  it('retains the original failed-disconnect deadline after body expiry and another failed periodic save', () => {
    const { game, db, p, advance } = setup(); p.combatUntil = 50000; game.persist();
    const checkpoint = db.checkpointWorld, batch = db.saveWorldPlayerCommits;
    db.checkpointWorld = () => { throw Error('checkpoint rejected'); };
    expect(() => game.disconnect('p')).toThrow('checkpoint rejected'); expect(p.disconnectUntil).toBe(40000);
    advance(31000); game.tick();
    db.checkpointWorld = checkpoint; db.saveWorldPlayerCommits = () => { throw Error('batch rejected'); };
    expect(() => game.persistPeriodic()).toThrow('batch rejected');
    expect(db.listWorldPlayerCommits()).toEqual([]);
    db.saveWorldPlayerCommits = batch; game.persistPeriodic();
    const commit = JSON.parse(db.listWorldPlayerCommits()[0].data); expect(commit.player.disconnectUntil).toBe(40000);
    expect(new GameWorld(db, rules, () => 41000).state.players.p.disconnectUntil).toBe(40000);
    const save = vi.spyOn(db, 'saveWorldPlayerCommits'); game.persistPeriodic(); expect(save).not.toHaveBeenCalled();
  });
  it('keeps moving NPC cooldowns and positions on the full periodic checkpoint until saved', () => {
    const { game, db, advance } = setup(createMemoryDb(), { monstersNear: () => [{ id: 'm', x: 8, y: 0, speed: 1 }] });
    advance(200); game.tick(); const npc = { ...game.state.monsters.m };
    expect(saved(db).monsters.m.x).not.toBe(npc.x);
    const checkpoint = db.checkpointWorld; db.checkpointWorld = () => { throw Error('full periodic rejected'); };
    expect(() => game.persistPeriodic()).toThrow('full periodic rejected'); db.checkpointWorld = checkpoint;
    game.persistPeriodic(); expect(saved(db).monsters.m).toEqual(npc); expect(db.listWorldPlayerCommits()).toEqual([]);
    Object.defineProperty(game.state.buildings, 'toJSON', { value: () => { throw Error('Already saved NPC'); } });
    expect(() => game.persistPeriodic()).not.toThrow();
  });
  it('persists an NPC seeded by snapshot even if it leaves simulation range before the next tick', () => {
    let present = false;
    const { game, db, advance } = setup(createMemoryDb(), { monstersNear: () => present ? [{ id: 'edge', x: 40, y: 0, speed: 0 }] : [] });
    present = true; game.snapshot('p'); expect(saved(db).monsters.edge).toBeUndefined();
    advance(300); expect(game.move('p', { x: -1, y: 0 })).toBe(true); game.tick();
    game.persistPeriodic(); const restored = new GameWorld(db, rules, () => 10300);
    expect(restored.state.monsters.edge).toMatchObject({ x: 40, y: 0 }); expect(db.listWorldPlayerCommits()).toEqual([]);
  });
  it.each(['action', 'tick'])('does not lose earlier uncheckpointed NPC state after a failed shared %s', mode => {
    const { game, db, advance } = setup(createMemoryDb(), { monstersNear: () => [{ id: 'm', x: 8, y: 0, speed: 1, hp: 500, maxHp: 500 }] });
    advance(200); game.tick(); const prior = { ...game.state.monsters.m }, checkpoint = db.checkpointWorld;
    db.checkpointWorld = () => { throw Error('shared rejected'); };
    if (mode === 'action') expect(game.action('p', { action: 'fire', monsterId: 'm', requestId: 'failed' }).error).toBe('shared rejected');
    else { game.state.drops.expired = { id: 'expired', name: '旧包', x: 0, y: 0, mapId: 'world', items: [], expiresAt: 1 }; advance(200); expect(() => game.tick()).toThrow('shared rejected'); }
    expect(game.state.monsters.m).toEqual(prior);
    db.checkpointWorld = checkpoint; game.persistPeriodic(); expect(saved(db).monsters.m).toEqual(prior);
    expect(db.listWorldPlayerCommits()).toEqual([]); expect(saved(db).handled.p || []).not.toContain('failed');
  });
  it('preserves an earlier NPC frame when a later admission checkpoint rolls back', () => {
    const { game, db, advance } = setup(createMemoryDb(), { monstersNear: () => [{ id: 'm', x: 8, y: 0, speed: 1 }] });
    advance(200); game.tick(); const prior = { ...game.state.monsters.m }, checkpoint = db.checkpointWorld;
    db.checkpointWorld = () => { throw Error('admission rejected'); };
    expect(() => game.connect('q', '乙')).toThrow('admission rejected'); expect(game.state.players.q).toBeUndefined();
    db.checkpointWorld = checkpoint; game.persistPeriodic();
    expect(saved(db).monsters.m).toEqual(prior); expect(saved(db).players.q).toBeUndefined();
    expect(db.listWorldPlayerCommits()).toEqual([]);
  });
});
