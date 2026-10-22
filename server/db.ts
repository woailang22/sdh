// server/db.ts
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

export interface DbHandle {
  saveBuilding(b: any): void;
  listBuildings(): any[];
  savePlayer(p: any): void;
  getPlayer(id: string): any | null;
  listPlayers(): any[];
  getMeta(k: string): string | null;
  setMeta(k: string, v: string): void;
}

/** SQLite's backup API includes committed WAL data; never copy a live database file. */
export async function backupDatabase(path: string): Promise<string | null> {
  if (path === ':memory:' || !existsSync(path)) return null;
  const source = new Database(path, { readonly: true });
  const target = `${path}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try {
    await source.backup(target);
    return target;
  } finally { source.close(); }
}

export function createDb(path: string): DbHandle {
  try {
    const db = new Database(path);
    // Keep acknowledged world transfers durable while avoiding rollback-journal rewrites.
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.exec(`CREATE TABLE IF NOT EXISTS buildings (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS players (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL);`);
    const upsertB = db.prepare(`INSERT INTO buildings (id, data) VALUES (@id, @data) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
    const allB = db.prepare(`SELECT data FROM buildings`);
    const upsertP = db.prepare(`INSERT INTO players (id, data) VALUES (@id, @data) ON CONFLICT(id) DO UPDATE SET data=excluded.data`);
    const oneP = db.prepare(`SELECT data FROM players WHERE id = ?`);
    const allP = db.prepare(`SELECT data FROM players`);
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
      listPlayers() { return (allP.all() as any[]).map(r => JSON.parse(r.data)); },
      getMeta(k: string) { const r = getM.get(k) as any; return r ? String(r.v) : null; },
      setMeta(k: string, v: string) { upsertM.run({ k, v }); },
    };
  } catch (e) {
    throw new Error(`[db] open failed: ${(e as Error)?.message ?? String(e)} (path=${path})`);
  }
}

// 内存兜底：磁盘 DB 打不开时用内存模式继续，不 crash（进程内 Map 实现同样接口）
export function createMemoryDb(): DbHandle {
  const buildings = new Map<string, any>();
  const players = new Map<string, any>();
  const meta = new Map<string, string>([['version', '1']]);
  return {
    saveBuilding(b: any) { buildings.set(b.id, JSON.parse(JSON.stringify(b))); },
    listBuildings() { return [...buildings.values()].map((b) => JSON.parse(JSON.stringify(b))); },
    savePlayer(p: any) { players.set(p.id, JSON.parse(JSON.stringify(p))); },
    getPlayer(id: string) {
      const v = players.get(id);
      return v ? JSON.parse(JSON.stringify(v)) : null;
    },
    listPlayers() { return [...players.values()].map(p => JSON.parse(JSON.stringify(p))); },
    getMeta(k: string) { return meta.has(k) ? String(meta.get(k)) : null; },
    setMeta(k: string, v: string) { meta.set(k, v); },
  };
}
