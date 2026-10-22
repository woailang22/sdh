import express from 'express';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createDb, backupDatabase } from './server/db.js';
import { guestTokenFromCookie, resolveGuest } from './server/identity.js';
import { GameWorld, type GameStateSnapshot, type WorldRules } from './server/worldState.js';
import { createWorldQueries } from './server/worldQueries.js';
import { StateEncoder } from './src/game/stateSync.js';
import { sendMessage as send } from './server/transport.js';
import { getWorldInteractable, migrateWorldPosition, worldIsRoad, worldThemeAt, WORLD_LOCATIONS } from './src/game/world.js';
import { WEATHER_DURATION, WEATHER_SEQUENCE, weatherInfo } from './src/game/weather.js';
import type { MapZoneId, NetMessage, WeatherState, WeatherType } from './src/types/game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });
app.use(express.json());

const DB_PATH = process.env.DB_PATH || 'data/sdc.sqlite';
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = createDb(DB_PATH);
// Refuse to mutate legacy state unless a consistent SQLite backup was completed.
if (!db.getMeta('authoritative-world-v2') || db.getMeta('public-house-layout') !== '2') {
  const backup = await backupDatabase(DB_PATH);
  if (backup) console.log('[db] pre-migration backup: ' + backup);
}

const worldQueries = createWorldQueries();
const rules: WorldRules = {
  nodeAt: getWorldInteractable,
  ...worldQueries,
  campSiteAllowed: (x, y) => Math.hypot(x, y) >= 48 && !worldIsRoad(x, y, 6) && !['lake', 'rift', 'marsh'].includes(worldThemeAt(x, y)) && WORLD_LOCATIONS.every(l => Math.hypot(l.x - x, l.y - y) >= (l.sourceMapId.startsWith('camp_') ? 48 : 20)),
  migrate: (mapId, x, y) => migrateWorldPosition(mapId as MapZoneId, x, y),
  weather: () => WEATHER_SEQUENCE[weatherIndex],
};
const game = new GameWorld(db, rules);
db.setMeta('public-house-layout', '2');
interface Client { ws: WebSocket; id: string; isGM: boolean; visible: Set<string>; lastSeen: number; lastCorrection: number; lastMessageAt: number; messageCount: number; lastSnapshot: number; mapId: MapZoneId; stateEncoder?: StateEncoder }
const clients = new Map<string, Client>();
const GM_TOKEN = process.env.GM_TOKEN || 'rift-gm';
let weatherIndex = 0;
let weatherTimer = WEATHER_DURATION;
function weather(): WeatherState {
  return weatherInfo(WEATHER_SEQUENCE[weatherIndex], weatherTimer);
}
function broadcast(type: string, payload: unknown) { for (const c of clients.values()) send(c.ws, type, payload); }
function stateTo(client: Client, snapshot?: GameStateSnapshot, correction = false) {
  if (client.ws.readyState !== WebSocket.OPEN) return;
  const state = snapshot || game.snapshot(client.id);
  state.correction ||= correction || client.mapId !== state.player.mapId;
  client.mapId = state.player.mapId; client.lastSnapshot = Date.now();
  if (client.stateEncoder) send(client.ws, 'game_state_patch', client.stateEncoder.encode(state));
  else send(client.ws, 'game_state', state);
}
function refreshVisibility(client: Client) {
  const players = game.visiblePlayers(client.id);
  const visible = new Set(players.map(p => p.id));
  for (const oldId of client.visible) if (!visible.has(oldId)) send(client.ws, 'player_left', { playerId: oldId });
  for (const p of players) if (p.id !== client.id) send(client.ws, client.visible.has(p.id) ? 'player_sync' : 'player_joined', p);
  client.visible = visible;
}
function sameOrigin(origin: string | undefined, host: string | undefined) {
  if (!origin) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}
app.get('/api/health', (_req, res) => res.json({ status: 'ok', onlineCount: clients.size, timestamp: Date.now(), serverTime: new Date().toISOString() }));
app.get('/api/session', (req, res) => {
  if (!sameOrigin(req.headers.origin, req.headers.host)) { res.status(403).json({ error: 'Origin rejected' }); return; }
  const session = resolveGuest(db, guestTokenFromCookie(req.headers.cookie));
  res.cookie('sdc_guest', session.token, { httpOnly: true, sameSite: 'lax', secure: req.secure || req.headers['x-forwarded-proto'] === 'https', maxAge: 365 * 24 * 60 * 60 * 1000, path: '/' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ playerId: session.playerId });
});

wss.on('connection', (ws, req) => {
  const token = guestTokenFromCookie(req.headers.cookie);
  if (!token || !sameOrigin(req.headers.origin, req.headers.host)) { ws.close(1008, 'Create a same-origin guest session first'); return; }
  const session = resolveGuest(db, token);
  // A forged cookie must not silently establish an identity unknown to its holder.
  if (session.token !== token) { ws.close(1008, 'Invalid guest session'); return; }
  const id = session.playerId;
  const previous = clients.get(id);
  const self = game.connect(id, '废土流浪者 #' + id.slice(-4));
  const client: Client = { ws, id, isGM: false, visible: new Set(), lastSeen: Date.now(), lastCorrection: 0, lastMessageAt: Date.now(), messageCount: 0, lastSnapshot: 0, mapId: self.mapId };
  clients.set(id, client);
  if (previous) previous.ws.close(4001, 'Guest identity connected elsewhere');
  const snapshot = game.snapshot(id);
  const players = game.visiblePlayers(id);
  client.visible = new Set(players.map(p => p.id));
  send(ws, 'init', { selfId: id, selfPlayer: self, players, buildings: snapshot.buildings, weather: weather(), serverTime: Date.now(), gameState: snapshot });
  stateTo(client, snapshot, true);
  ws.on('message', data => {
    if (clients.get(id)?.ws !== ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    if (now - client.lastMessageAt >= 1000) { client.lastMessageAt = now; client.messageCount = 0; }
    if (++client.messageCount > 100) { ws.close(1008, 'Too many messages'); return; }
    client.lastSeen = now;
    try {
      const msg = JSON.parse(data.toString()) as NetMessage;
      const payload = msg.payload || {};
      switch (msg.type) {
        case 'state_sync': {
          if (payload.version !== 1) break;
          client.stateEncoder = new StateEncoder(); stateTo(client); break;
        }
        case 'player_sync': {
          if (!game.move(id, payload) && now - client.lastCorrection >= 150) {
            client.lastCorrection = now; stateTo(client, undefined, true);
          }
          break;
        }
        case 'game_action': {
          const state = game.action(id, payload);
          stateTo(client, state);
          if (!state.error) {
            for (const c of clients.values()) {
              if (c.id === id) continue;
              const p = game.state.players[c.id];
              if (p.mapId === state.player.mapId && (p.mapId !== 'world' || Math.hypot(p.x - state.player.x, p.y - state.player.y) <= 80) || payload.action === 'create_camp') stateTo(c);
            }
          }
          break;
        }
        case 'building_placed': case 'raid_attempt': case 'pvp_hit':
          stateTo(client, game.snapshot(id, undefined, '请使用服务器游戏操作协议')); break;
        case 'chat': {
          if (typeof payload.text !== 'string' || !payload.text.trim()) break;
          const p = game.state.players[id];
          const chat = { id: 'msg_' + now + '_' + id.slice(-4), channel: payload.channel === 'team' ? 'team' : 'world', sender: p.name, senderTitle: 'Lv.' + p.level + ' ' + p.title, text: payload.text.slice(0, 500), timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) };
          broadcast('chat', chat); break;
        }
        case 'ping': send(ws, 'pong', { serverTime: now }); break;
        case 'gm_auth': client.isGM = payload.token === GM_TOKEN; send(ws, 'gm_auth_result', { ok: client.isGM, playerId: id }); break;
        case 'weather_set': {
          if (!client.isGM) { send(ws, 'gm_auth_result', { ok: false, error: 'GM only' }); break; }
          const next = WEATHER_SEQUENCE.findIndex(w => w === payload.weather);
          if (next < 0) break;
          weatherIndex = next; weatherTimer = WEATHER_DURATION; broadcast('weather_update', weather()); break;
        }
      }
    } catch (error) { console.error('[ws] message rejected', error); }
  });
  ws.on('close', () => {
    // A replaced connection cannot disconnect or persist over the new socket's player.
    if (clients.get(id)?.ws !== ws) return;
    clients.delete(id); game.disconnect(id);
    for (const other of clients.values()) if (other.visible.has(id)) { other.visible.delete(id); send(other.ws, 'player_left', { playerId: id }); }
  });
  ws.on('error', error => console.error('[ws]', error.message));
});

setInterval(() => {
  const now = Date.now();
  const dirty = game.tick();
  for (const client of clients.values()) {
    if (now - client.lastSeen > 60000) { client.ws.terminate(); continue; }
    refreshVisibility(client);
    if (dirty || now - client.lastSnapshot >= 2000) stateTo(client);
  }
}, 200);
setInterval(() => { try { game.persist(); } catch (error) { console.error('[db] periodic save failed', error); } }, 5000);
setInterval(() => {
  if (--weatherTimer > 0) return;
  weatherTimer = WEATHER_DURATION; weatherIndex = (weatherIndex + 1) % WEATHER_SEQUENCE.length;
  broadcast('weather_update', weather());
  broadcast('chat', { id: 'weather_' + Date.now(), channel: 'system', sender: '坍界天候预警台', text: '【气象骤变】野外区域已切换为「' + weather().name + '」。', timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) });
}, 1000);
function shutdown() { game.persist(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => res.sendFile(path.resolve(__dirname, 'dist/index.html')));
  }
  const port = Number(process.env.PORT) || 3000;
  server.listen(port, () => console.log('[Rift Walker] http://localhost:' + port));
}
startServer().catch(error => { console.error('Failed to start server:', error); process.exit(1); });
