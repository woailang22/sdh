// server/db.test.ts
import { describe, expect, it } from 'vitest';
import { createDb, backupDatabase } from './db';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('sqlite persistence', () => {
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
