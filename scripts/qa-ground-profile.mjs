import { build } from 'esbuild';
import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';

export const fixtures = ['spawn', 'camp-entrance', 'forest-farm', 'factory'];
const digest = value => createHash('sha256').update(value).digest('hex');
const finite = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

export function validateReport(report, manifest) {
  if (report?.kind !== 'same-instance-ground-camera-diagnostic' || report.runId !== manifest.runId || report.fingerprint !== manifest.fingerprint) throw Error('Wrong diagnostic source/run');
  if (report.synthetic === true || !Array.isArray(report.rows) || report.rows.length > 960 || !Array.isArray(report.starts) || report.starts.length > 12) throw Error('Invalid diagnostic structure');
  if (report.failure !== null && (typeof report.failure !== 'string' || report.failure.length > 8000)) throw Error('Invalid failure');
  if (report.environment?.canvas?.width !== 1920 || report.environment?.canvas?.height !== 1080 || !finite(report.environment.dpr) || report.environment.dpr === 0) throw Error('Wrong diagnostic size');
  let previousAt = -1;
  for (const [index, row] of report.rows.entries()) {
    if (row.fixture !== fixtures[Math.floor(index / 240)] || row.step !== index % 240 || !finite(row.at) || row.at < previousAt) throw Error('Out-of-order camera row');
    for (const field of ['submitMs', 'terrainMs', 'detailsMs', 'terrainCalls', 'detailsCalls', 'repaintArea']) if (!finite(row[field])) throw Error('Invalid row timing/count');
    if (!Number.isInteger(row.terrainCalls) || !Number.isInteger(row.detailsCalls)) throw Error('Fractional draw count');
    if (!finite(row.callbackAt) || !finite(row.rafAt) || row.callbackAt > row.at) throw Error('Invalid callback time');
    for (const key of ['callbackIntervalMs', 'rafTimestampIntervalMs']) if (row[key] !== null && !finite(row[key])) throw Error('Invalid callback/timestamp interval');
    const before = index % 240 === 0 ? null : report.rows[index - 1];
    if (row.callbackIntervalMs !== (before ? row.callbackAt - before.callbackAt : null) || row.rafTimestampIntervalMs !== (before ? row.rafAt - before.rafAt : null)) throw Error('Callback/timestamp interval mismatch');
    if (!row.flags || !Number.isInteger(row.flags.regions) || row.flags.regions < 0 || row.flags.regions > 3) throw Error('Invalid ground flags');
    for (const key of ['full', 'scroll', 'fallback', 'texture']) if (typeof row.flags[key] !== 'boolean') throw Error('Invalid ground flag');
    if (!row.cache || !finite(row.cache.width) || !finite(row.cache.height) || !Number.isFinite(row.cache.x) || !Number.isFinite(row.cache.y)) throw Error('Invalid cache metadata');
    previousAt = row.at;
  }
  if (report.failure === null) {
    if (report.rows.length !== 960 || report.starts.length !== 12) throw Error('Incomplete successful diagnostic');
    for (const [index, start] of report.starts.entries()) {
      if (start.fixture !== fixtures[Math.floor(index / 3)] || start.phase !== ['loading', 'tile-ready', 'final-forced-readback'][index % 3] || !finite(start.ms)) throw Error('Wrong diagnostic phase');
    }
  }
  return report;
}

export async function serveProfile({ runName, port = 39156 }) {
  if (!/^[a-z][a-z0-9-]{5,64}$/.test(runName) || !Number.isInteger(port) || port < 1024 || port > 65535) throw Error('Use a fresh named run and a valid local port');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = resolve(root, 'data', runName);
  mkdirSync(out); // Never replace a previous attempt, successful or failed.
  const script = 'scripts/qa-ground-profile.browser.ts', html = 'scripts/qa-ground-profile.html';
  const bundled = await build({ absWorkingDir: root, entryPoints: [script], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', outfile: resolve(out, 'profile.js'), metafile: true });
  const inputHashes = Object.fromEntries([...Object.keys(bundled.metafile.inputs), 'scripts/qa-ground-profile.mjs', html].sort().map(file => [file.replaceAll('\\', '/'), digest(readFileSync(resolve(root, file)))]));
  const assetHashes = Object.fromEntries(readdirSync(resolve(root, 'public/art')).filter(file => /^[a-z0-9-]+\.png$/.test(file)).sort().map(file => [`public/art/${file}`, digest(readFileSync(resolve(root, 'public/art', file)))]));
  const source = { baseCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), inputHashes, assetHashes, bundleHash: digest(readFileSync(resolve(out, 'profile.js'))) };
  const manifest = { kind: 'manual-ground-profile-source', runName, runId: randomUUID(), createdAt: new Date().toISOString(), ...source, fingerprint: digest(JSON.stringify(source)) };
  writeFileSync(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  const origin = `http://127.0.0.1:${port}`, result = resolve(out, 'result.json');
  const sameSources = () => Object.entries({ ...inputHashes, ...assetHashes }).every(([file, hash]) => digest(readFileSync(resolve(root, file))) === hash) && digest(readFileSync(resolve(out, 'profile.js'))) === source.bundleHash;
  const server = createServer((request, response) => {
    const reply = (status, body, type = 'application/json; charset=utf-8') => { response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); response.end(body); };
    if (request.headers.host !== `127.0.0.1:${port}`) return reply(403, '{}');
    const url = new URL(request.url, origin);
    if (request.method === 'GET' && url.pathname === '/status') return reply(200, JSON.stringify({ ready: true, resultSaved: existsSync(result), runName, fingerprint: manifest.fingerprint }));
    if (request.method === 'POST' && url.pathname === '/result') {
      if (request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') return reply(403, '{}');
      let bytes = 0, chunks = [], tooLarge = false;
      request.on('data', chunk => { bytes += chunk.length; if (bytes > 5 * 1024 * 1024) { tooLarge = true; chunks = []; } else if (!tooLarge) chunks.push(chunk); });
      request.on('end', () => {
        if (tooLarge) return reply(413, '{}');
        try {
          const report = validateReport(JSON.parse(Buffer.concat(chunks).toString('utf8')), manifest);
          if (!sameSources()) return reply(409, JSON.stringify({ error: 'Source changed; retain this attempt and start a new named run.' }));
          writeFileSync(result, JSON.stringify({ manifest, report }, null, 2) + '\n', { flag: 'wx' });
          console.log(JSON.stringify({ saved: true, rows: report.rows.length, failed: report.failure !== null }));
          reply(201, '{"saved":true}');
        } catch (error) { reply(409, JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid or already saved report' })); }
      });
      return;
    }
    const staticFiles = { '/': html, '/profile.js': relative(root, resolve(out, 'profile.js')), '/manifest.json': relative(root, resolve(out, 'manifest.json')) };
    const asset = url.pathname.startsWith('/art/') ? `public${url.pathname}` : '';
    const file = staticFiles[url.pathname] ?? (Object.hasOwn(assetHashes, asset) ? asset : undefined);
    if (request.method !== 'GET' || !file) return reply(404, '{}');
    try {
      const content = readFileSync(resolve(root, file));
      const expected = assetHashes[file] ?? inputHashes[file] ?? (url.pathname === '/profile.js' ? source.bundleHash : undefined);
      if (expected && digest(content) !== expected) return reply(409, '{}');
      reply(200, content, file.endsWith('.png') ? 'image/png' : file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8');
    } catch { reply(404, '{}'); }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', accept); });
  return { server, manifest, result, origin };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map(arg => arg.replace(/^--/, '').split('=')));
  const run = await serveProfile({ runName: args.run, port: args.port ? Number(args.port) : 39156 });
  console.log(JSON.stringify({ ready: true, pid: process.pid, url: run.origin, result: relative(process.cwd(), run.result), gameServerOrDatabase: false }));
  const input = createInterface({ input: process.stdin });
  const close = () => run.server.close(() => { console.log('Owned manual diagnostic server closed'); input.close(); });
  input.on('line', line => { if (line.trim() === 'quit') close(); });
  input.on('close', () => run.server.close());
}
