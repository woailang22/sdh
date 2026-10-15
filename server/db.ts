// server/db.ts
import Database from 'better-sqlite3';

export interface DbHandle {
  saveBuilding(b: any): void;
  listBuildings(): any[];
  savePlayer(p: any): void;
  getPlayer(id: string): any | null;
  getMeta(k: string): string | null;
  setMeta(k: string, v: string): void;
}

export function createDb(path: string): DbHandle {
  const db = new Database(path);
  db.exec(`CREATE TABLE IF NOT EXISTS buildings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);`);
  const upsertB = db.prepare(`INSERT INTO buildings (id, data) VALUES (@id, @data) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
  const allB = db.prepare(`SELECT data FROM buildings`);
  const upsertP = db.prepare(`INSERT INTO players (id, data) VALUES (@id, @data) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
  const oneP = db.prepare(`SELECT data FROM players WHERE id = ?`);
  const getM = db.prepare(`SELECT v FROM meta WHERE k = ?`);
  const upsertM = db.prepare(`INSERT INTO meta (k, v) VALUES (@k, @v) ON CONFLICT(k) DO UPDATE SET v=excluded.v`);
  // meta 版本：供后续 schema 升级用，初始版本为 1（幂等，已存在则保持原值）
  const existingVersion = getM.get('version') as any;
  if (!existingVersion) upsertM.run({ k: 'version', v: '1' });
  return {
    saveBuilding(b: any) { upsertB.run({ id: b.id, data: JSON.stringify(b) }); },
    listBuildings() { return (allB.all() as any[]).map((r) => JSON.parse(r.data)); },
    savePlayer(p: any) { upsertP.run({ id: p.id, data: JSON.stringify(p) }); },
    getPlayer(id: string) { const r = oneP.get(id) as any; return r ? JSON.parse(r.data) : null; },
    getMeta(k: string) { const r = getM.get(k) as any; return r ? String(r.v) : null; },
    setMeta(k: string, v: string) { upsertM.run({ k, v }); },
  };
}
