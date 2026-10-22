import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readdirSync, statSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import { backupDatabase, createDb } from './db';
import { GameWorld, type WorldRules } from './worldState';

const tree = { id: 'tree', name: '树', type: 'tree' as const, x: 1, y: 0, radius: 1, prompt: '', available: true, stock: 3, maxStock: 3, respawnSec: 60 };
const rules: WorldRules = {
  nodeAt: id => id === tree.id ? tree : undefined, nodesNear: () => [tree], buildingsNear: () => [],
  monstersNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({ mapId: 'world', x, y }),
};

describe('durable world action commits', () => {
  it.each(['normal', 'backup-failure', 'checkpoint-failure'])('backs up an actual v2/layout2 server startup before migration (%s)', async mode => {
    const dir = mkdtempSync(join(tmpdir(), 'sdc-version3-')), file = join(dir, 'world.sqlite');
    const db = createDb(file), game = new GameWorld(db, rules); game.connect('p', '迁移角色');
    game.state.players.p.resources.ammo = 37;
    const legacy = structuredClone(game.state); legacy.version = 2;
    db.setMeta('authoritative-world-v2', JSON.stringify(legacy)); db.setMeta('public-house-layout', '2');
    const control = new Database(file);
    if (mode === 'checkpoint-failure') control.exec("CREATE TRIGGER reject_migration BEFORE UPDATE ON meta WHEN NEW.k='authoritative-world-v2' BEGIN SELECT RAISE(ABORT, 'qa checkpoint failure'); END");
    async function launch(failBackup: boolean) {
      const probe = createServer(); await new Promise<void>(resolve => probe.listen(0, '127.0.0.1', resolve));
      const port = (probe.address() as AddressInfo).port; await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
      const source = (failBackup ? "import Database from 'better-sqlite3'; Database.prototype.backup=()=>Promise.reject(Error('qa backup failure'));" : '') + 'await import(' + JSON.stringify(pathToFileURL(resolve('server.ts')).href) + ');';
      const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, env: { ...process.env, DB_PATH: file, PORT: String(port), NODE_ENV: 'production' }, stdio: ['ignore', 'pipe', 'pipe'] });
      const exited = once(child, 'exit'); let stderr = '', output = '';
      child.stderr.on('data', chunk => { stderr += String(chunk); });
      try {
        await new Promise<void>((accept, reject) => {
          const timer = setTimeout(() => reject(Error('Migration server timeout: ' + stderr)), 10000);
          child.once('error', error => { clearTimeout(timer); reject(error); });
          child.once('exit', () => { clearTimeout(timer); accept(); });
          child.stdout.on('data', chunk => { output += String(chunk); if (output.includes('[Rift Walker]')) { clearTimeout(timer); accept(); } });
        });
      } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); await exited; }
      return { started: output.includes('[Rift Walker]'), stderr };
    }
    try {
      const result = await launch(mode === 'backup-failure');
      const read = () => JSON.parse(db.getMeta('authoritative-world-v2')!);
      const backups = () => readdirSync(dir).filter(name => name.startsWith('world.sqlite.backup-'));
      expect(result.started).toBe(mode === 'normal');
      if (mode === 'normal') { expect(read().version).toBe(3); expect(backups()).toHaveLength(1); }
      else {
        expect(read()).toEqual(legacy); expect(result.stderr).toContain(mode === 'backup-failure' ? 'qa backup failure' : 'qa checkpoint failure');
        expect(backups()).toHaveLength(mode === 'backup-failure' ? 0 : 1);
        if (mode === 'checkpoint-failure') control.exec('DROP TRIGGER reject_migration');
        expect((await launch(false)).started).toBe(true); expect(read().version).toBe(3);
        expect(backups()).toHaveLength(mode === 'backup-failure' ? 1 : 2);
      }
      expect(read().players.p.resources.ammo).toBe(37);
      const backup = new Database(join(dir, backups()[0]), { readonly: true });
      try { const old = JSON.parse((backup.prepare("SELECT v FROM meta WHERE k='authoritative-world-v2'").get() as { v: string }).v); expect(old).toEqual(legacy); } finally { backup.close(); }
    } finally { control.close(); }
  }, 20000);
  it('recovers private shots and replay guards from WAL after forced death and a backup, then consolidates a shared action', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sdc-private-shot-')), 'world.sqlite');
    const source = String.raw`
      import { createDb } from ${JSON.stringify(pathToFileURL(resolve('server/db.ts')).href)};
      import { GameWorld } from ${JSON.stringify(pathToFileURL(resolve('server/worldState.ts')).href)};
      import { makeItem } from ${JSON.stringify(pathToFileURL(resolve('src/game/items.ts')).href)};
      const tree = ${JSON.stringify(tree)}; let now = 10000;
      const rules = { nodeAt: id => id === tree.id ? tree : undefined, nodesNear: () => [tree], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({mapId: 'world', x, y}) };
      const game = new GameWorld(createDb(${JSON.stringify(file)}), rules, () => now);
      game.connect('p', '甲'); game.connect('q', '乙');
      for (const [id, ammo] of [['p', 10], ['q', 20]]) { game.state.players[id].equipment.weapon = makeItem('rifle', 1); game.state.players[id].resources.ammo = ammo; }
      game.persist();
      for (const [id, requestId] of [['p', 'p1'], ['q', 'q1'], ['p', 'p2']]) {
        now += 200; const response = game.action(id, { action: 'fire', requestId });
        if (response.error) throw Error(response.error);
      }
      process.stdout.write('committed\n'); setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = once(child, 'exit'); let stderr = '';
    child.stderr.on('data', chunk => { stderr += String(chunk); });
    try {
      await new Promise<void>((accept, reject) => {
        let output = ''; const timer = setTimeout(() => reject(Error('Child commit timeout: ' + stderr)), 10000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', () => { clearTimeout(timer); reject(Error('Child exited early: ' + stderr)); });
        child.stdout.on('data', chunk => { output += String(chunk); if (output.includes('committed\n')) { clearTimeout(timer); accept(); } });
      });
    } finally { child.kill('SIGKILL'); await exited; }
    const raw = new Database(file, { readonly: true });
    try {
      const checkpoint = JSON.parse((raw.prepare("SELECT v FROM meta WHERE k='authoritative-world-v2'").get() as { v: string }).v);
      expect(checkpoint.version).toBe(3); expect(checkpoint.players.p.resources.ammo).toBe(10);
      expect(raw.prepare('SELECT id FROM world_player_commits').all()).toHaveLength(2);
    } finally { raw.close(); }
    const backup = await backupDatabase(file);
    for (const saved of [file, backup!]) {
      const db = createDb(saved); const game = new GameWorld(db, rules, () => 11000);
      expect(game.state.players.p.resources.ammo).toBe(8); expect(game.state.players.q.resources.ammo).toBe(19);
      expect(game.state.handled.p).toEqual(['p1', 'p2']); expect(game.state.handled.q).toEqual(['q1']);
      expect(db.listWorldPlayerCommits()).toEqual([]);
      expect(game.action('p', { action: 'fire', requestId: 'p2' }).player.resources.ammo).toBe(8);
      expect(game.action('p', { action: 'fire', requestId: 'next-shot' }).player.resources.ammo).toBe(7);
      expect(db.listWorldPlayerCommits()).toHaveLength(1);
      expect(game.action('p', { action: 'gather', targetId: tree.id, requestId: 'shared-gather' }).error).toBeUndefined();
      expect(db.listWorldPlayerCommits()).toEqual([]);
      const reopened = new GameWorld(db, rules, () => 12000);
      expect(reopened.state.players.p.resources).toMatchObject({ ammo: 7, wood: 1 });
      expect(reopened.state.players.q.resources.ammo).toBe(19);
      expect(reopened.state.nodes.tree.stock).toBe(2);
      const reader = new Database(saved, { readonly: true });
      expect(reader.pragma('integrity_check', { simple: true })).toBe('ok'); reader.close();
    }
  }, 20000);
  it('retains inventory, node depletion and replay guard after forced process termination and in a backup', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'sdc-abrupt-save-')), 'world.sqlite');
    const source = String.raw`
      import { createDb } from ${JSON.stringify(pathToFileURL(resolve('server/db.ts')).href)};
      import { GameWorld } from ${JSON.stringify(pathToFileURL(resolve('server/worldState.ts')).href)};
      const tree = ${JSON.stringify(tree)};
      const rules = { nodeAt: id => id === tree.id ? tree : undefined, nodesNear: () => [tree], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => false, migrate: (_map, x, y) => ({mapId: 'world', x, y}) };
      const game = new GameWorld(createDb(${JSON.stringify(file)}), rules, () => 10000);
      game.connect('p', '采集者');
      const response = game.action('p', { action: 'gather', targetId: 'tree', requestId: 'committed-gather' });
      if (response.error || response.player.resources.wood !== 1) throw Error('Action did not commit');
      process.stdout.write('committed\n');
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], { cwd: process.cwd(), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = once(child, 'exit');
    let stderr = ''; child.stderr.on('data', chunk => { stderr += String(chunk); });
    try {
      await new Promise<void>((accept, reject) => {
        let output = '';
        const timer = setTimeout(() => reject(new Error('Child commit timeout: ' + stderr)), 10000);
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', () => { clearTimeout(timer); reject(new Error('Child exited before forced termination: ' + stderr)); });
        child.stdout.on('data', chunk => {
          output += String(chunk);
          if (output.includes('committed\n')) { clearTimeout(timer); accept(); }
        });
      });
    } finally {
      child.kill('SIGKILL');
      await exited;
    }
    expect(existsSync(file + '-wal')).toBe(true);
    expect(statSync(file + '-wal').size).toBeGreaterThan(32);
    const backup = await backupDatabase(file);
    for (const saved of [file, backup!]) {
      const game = new GameWorld(createDb(saved), rules, () => 10000);
      const result = game.action('p', { action: 'gather', targetId: tree.id, requestId: 'committed-gather' });
      expect(result.error).toBeUndefined(); expect(result.player.resources.wood).toBe(1);
      expect(game.state.nodes[tree.id].stock).toBe(2);
      expect(game.state.handled.p).toEqual(['committed-gather']);
      const reader = new Database(saved, { readonly: true });
      expect(reader.pragma('integrity_check', { simple: true })).toBe('ok'); reader.close();
    }
  }, 20000);
});
