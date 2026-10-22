import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
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
