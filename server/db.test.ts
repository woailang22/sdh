// server/db.test.ts
import { describe, expect, it } from 'vitest';
import { createDb, backupDatabase } from './db';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

describe('sqlite persistence', () => {
  it('commits both sides of a world transfer while a reporting reader retains its previous snapshot', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sdc-reader-')), 'world.sqlite');
    const db = createDb(file);
    const before = { players: { p: { wood: 10 } }, storage: { wood: 0 }, handled: { p: [] as string[] } };
    const after = { players: { p: { wood: 6 } }, storage: { wood: 4 }, handled: { p: ['deposit'] } };
    db.setMeta('authoritative-world-v2', JSON.stringify(before));
    const reader = new Database(file);
    const read = () => JSON.parse((reader.prepare("SELECT v FROM meta WHERE k = 'authoritative-world-v2'").get() as { v: string }).v);
    try {
      reader.exec('BEGIN');
      try {
        expect(read()).toEqual(before);
        db.setMeta('authoritative-world-v2', JSON.stringify(after));
        expect(read()).toEqual(before);
        const backup = await backupDatabase(file);
        expect(JSON.parse(createDb(backup!).getMeta('authoritative-world-v2')!)).toEqual(after);
      } finally { reader.exec('ROLLBACK'); }
      expect(read()).toEqual(after);
      expect(reader.pragma('integrity_check', { simple: true })).toBe('ok');
    } finally { reader.close(); }
  }, 15000);

  it('preserves legacy rows and committed world data when opening an existing rollback-journal database', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sdc-legacy-journal-')), 'world.sqlite');
    const legacy = new Database(file);
    legacy.exec('CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL); CREATE TABLE players (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
    legacy.prepare('INSERT INTO players VALUES (?, ?)').run('legacy', JSON.stringify({ id: 'legacy', x: 7, inventory: [{ id: 'wood', count: 9 }] }));
    legacy.prepare('INSERT INTO meta VALUES (?, ?)').run('authoritative-world-v2', JSON.stringify({ version: 2, storedDark: 12 }));
    expect(legacy.pragma('journal_mode', { simple: true })).toBe('delete'); legacy.close();
    const db = createDb(file);
    expect(db.getPlayer('legacy')).toEqual({ id: 'legacy', x: 7, inventory: [{ id: 'wood', count: 9 }] });
    expect(JSON.parse(db.getMeta('authoritative-world-v2')!)).toEqual({ version: 2, storedDark: 12 });
    const observer = new Database(file);
    expect(observer.pragma('journal_mode', { simple: true })).toBe('wal');
    observer.close();
  });

  it('backs up real persisted data before migration and preserves atomic world state across reopen', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sdc-db-'));
    const file = join(dir, 'world.sqlite');
    const db = createDb(file);
    db.savePlayer({ id: 'legacy', mapId: 'town_ruins', x: 3, y: 4 });
    const backup = await backupDatabase(file);
    expect(existsSync(backup!)).toBe(true);
    expect(createDb(backup!).getPlayer('legacy').mapId).toBe('town_ruins');
    db.setMeta('authoritative-world-v2', JSON.stringify({ accounts: { p: { wood: 2 } }, storage: { wood: 8 } }));
    expect(JSON.parse(createDb(file).getMeta('authoritative-world-v2')!)).toEqual({ accounts: { p: { wood: 2 } }, storage: { wood: 8 } });
    expect(db.listPlayers()).toHaveLength(1);
  });
  it('building survives reload', () => {
    const db = createDb(':memory:');
    db.saveBuilding({ id: 'b1', type: 'safe_door', name: '门', x: 1, y: 2, hp: 5000, maxHp: 5000, level: 1, ownerId: 'p1', mapId: 'town_ruins' } as any);
    const rows = db.listBuildings();
    expect(rows.find((b) => b.id === 'b1')?.hp).toBe(5000);
  });
  it('meta version read/write', () => {
    const db = createDb(':memory:');
    expect(db.getMeta('version')).toBe('1');
    db.setMeta('version', '1');
    expect(db.getMeta('version')).toBe('1');
    db.setMeta('foo', 'bar');
    expect(db.getMeta('foo')).toBe('bar');
  });
  it('player save/get roundtrip', () => {
    const db = createDb(':memory:');
    db.savePlayer({ id: 'p1', name: '影刃', level: 3, x: 1.5, y: -2.5 } as any);
    const got = db.getPlayer('p1');
    expect(got?.name).toBe('影刃');
    expect(got?.level).toBe(3);
    expect(db.getPlayer('missing')).toBeNull();
  });
  it('building upsert overwrites', () => {
    const db = createDb(':memory:');
    db.saveBuilding({ id: 'b2', type: 'wall', name: '墙', x: 0, y: 0, hp: 1000, maxHp: 1000, level: 1, ownerId: 'p1', mapId: 'camp_plaza' } as any);
    db.saveBuilding({ id: 'b2', type: 'wall', name: '墙', x: 0, y: 0, hp: 500, maxHp: 1000, level: 2, ownerId: 'p1', mapId: 'camp_plaza' } as any);
    const rows = db.listBuildings();
    expect(rows.filter((b) => b.id === 'b2')).toHaveLength(1);
    expect(rows.find((b) => b.id === 'b2')?.hp).toBe(500);
    expect(rows.find((b) => b.id === 'b2')?.level).toBe(2);
  });
});
