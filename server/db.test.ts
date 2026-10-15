// server/db.test.ts
import { describe, expect, it } from 'vitest';
import { createDb } from './db';

describe('sqlite persistence', () => {
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
});
