// server/db.ts
import Database from 'better-sqlite3';

export interface DbHandle {
  saveBuilding(b: any): void;
  listBuildings(): any[];
  savePlayer(p: any): void;
  getPlayer(id: string): any | null;
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
  return {
    saveBuilding(b: any) { upsertB.run({ id: b.id, data: JSON.stringify(b) }); },
    listBuildings() { return (allB.all() as any[]).map((r) => JSON.parse(r.data)); },
    savePlayer(p: any) { upsertP.run({ id: p.id, data: JSON.stringify(p) }); },
    getPlayer(id: string) { const r = oneP.get(id) as any; return r ? JSON.parse(r.data) : null; },
  };
}
