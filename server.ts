import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import type {
  OnlinePlayer,
  BuildingEntity,
  MapZoneId,
  WeatherState,
  WeatherType,
  RaidEvent,
  NetMessage,
} from './src/types/game.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

app.use(express.json());

// API health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    onlineCount: clients.size,
    timestamp: Date.now(),
    serverTime: new Date().toISOString(),
  });
});

// Server State
interface ConnectedClient {
  ws: WebSocket;
  playerId: string;
  player: OnlinePlayer;
  isGM: boolean;
}

// GM 口令（环境变量覆盖）：地图编辑器天气控制等 GM 操作需要先 gm_auth
const GM_TOKEN = process.env.GM_TOKEN || 'rift-gm';

const clients = new Map<string, ConnectedClient>();

// Persistent World Buildings (including default Sanctuary base and player bases)
let worldBuildings: BuildingEntity[] = [
  {
    id: 'base_anchor_core',
    type: 'anchor_core',
    name: '先锋前哨 · 坍界锚点核心',
    x: 0,
    y: 0,
    hp: 5000,
    maxHp: 5000,
    level: 3,
    ownerId: 'system',
    ownerName: '坍界开拓团',
    mapId: 'camp_plaza',
  },
  {
    id: 'base_workbench_1',
    type: 'workbench',
    name: '战术重型制造台',
    x: 2.5,
    y: 0.5,
    hp: 2000,
    maxHp: 2000,
    level: 2,
    ownerId: 'system',
    ownerName: '坍界开拓团',
    mapId: 'camp_plaza',
  },
  {
    id: 'base_storage_1',
    type: 'storage_box',
    name: '前哨物资重型储藏箱',
    x: -2.5,
    y: 0.8,
    hp: 1500,
    maxHp: 1500,
    level: 2,
    ownerId: 'system',
    ownerName: '坍界开拓团',
    mapId: 'camp_plaza',
    storedLoot: [
      { name: '高爆C4塑胶炸药', count: 3, icon: '💣' },
      { name: '微型铝热熔切弹', count: 5, icon: '🔥' },
      { name: '脉冲电子解码器', count: 2, icon: '⚡' },
    ],
  },
  // Default Safe Door in Wild Outpost (demonstrating territory raid mechanics)
  {
    id: 'wild_safe_gate_alpha',
    type: 'safe_door',
    name: '荒野叛军重装安全防护闸门 [高防可突袭]',
    x: 4.0,
    y: -3.5,
    hp: 4200,
    maxHp: 6000,
    level: 2,
    isOpen: false,
    isLocked: true,
    ownerId: 'npc_raider_boss',
    ownerName: '裂隙铁血掠夺者联盟',
    mapId: 'town_ruins',
    material: 'iron',
    storedLoot: [
      { name: '坍界暗物质晶核', count: 18, icon: '💎' },
      { name: '军用钛合金复合装甲板', count: 8, icon: '🛡️' },
      { name: '破界级等离子步枪蓝图', count: 1, icon: '📜' },
      { name: '废土高级信用点', count: 2500, icon: '💰' },
    ],
  },
  {
    id: 'wild_safe_gate_beta',
    type: 'safe_door',
    name: '黑松林秘密前哨密封门 [坚固安全门]',
    x: -3.0,
    y: 4.2,
    hp: 5500,
    maxHp: 5500,
    level: 2,
    isOpen: false,
    isLocked: true,
    ownerId: 'npc_forest_syndicate',
    ownerName: '深林佣兵团',
    mapId: 'mtn_deep',
    material: 'iron',
    storedLoot: [
      { name: '军用战术急救针剂', count: 10, icon: '💉' },
      { name: '坍界高纯晶石', count: 14, icon: '💎' },
      { name: '高聚合破拆炸药', count: 4, icon: '🧨' },
    ],
  },
];

// Dynamic Weather State
const WILD_WEATHERS: { type: WeatherType; name: string; icon: string; desc: string; effectLabel: string }[] = [
  { type: 'clear', name: '晴朗破晓', icon: '☀️', desc: '视野清晰，无负面环境侵蚀。', effectLabel: '搜刮收益提升 +20%' },
  { type: 'acid_rain', name: '酸雨风暴', icon: '🧪', desc: '酸蚀腐蚀大气，护盾缓慢受损，但变异怪兽掉落极佳！', effectLabel: '野外怪兽暴击率 +25% / 护盾腐蚀' },
  { type: 'fog', name: '暗蚀重雾', icon: '🌫️', desc: '浓雾笼罩荒野，雷达侦测范围缩减，潜行突袭伤害大幅增强！', effectLabel: '突袭破拆伤害 +30%' },
  { type: 'thunder', name: '离子雷暴', icon: '⚡', desc: '强对流离子风暴，闪电穿透电磁场，充能技能加速！', effectLabel: '攻击射速 +20%' },
  { type: 'rain', name: '荒芜骤雨', icon: '🌧️', desc: '雨幕遮蔽地平线，脚步声减弱，适合战术渗透。', effectLabel: '移动速度 +15%' },
];

let wildWeatherIndex = 0;
let weatherTimer = 180; // 3 minutes per cycle

// Default Player Prefabs to choose/seed from
const PREFAB_NAMES = [
  '影刃 · 零号', '重装 · 铁壁', '幽灵 · 渡鸦', '雷鸣 · 凯尔',
  '战地工兵 · 索尔', '苍穹 · 艾拉', '裂隙猎手 · 斩风', '先锋 · 泰坦'
];

function broadcast(msg: NetMessage, exceptId?: string) {
  const json = JSON.stringify(msg);
  for (const [id, client] of clients.entries()) {
    if (exceptId && id === exceptId) continue;
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(json);
    }
  }
}

// Tick Loop for Weather and World State
setInterval(() => {
  weatherTimer--;
  if (weatherTimer <= 0) {
    weatherTimer = 180;
    wildWeatherIndex = (wildWeatherIndex + 1) % WILD_WEATHERS.length;
    const nextWeather = WILD_WEATHERS[wildWeatherIndex];

    const weatherState: WeatherState = {
      current: nextWeather.type,
      name: nextWeather.name,
      icon: nextWeather.icon,
      desc: nextWeather.desc,
      effectLabel: nextWeather.effectLabel,
      durationLeft: weatherTimer,
    };

    broadcast({
      type: 'weather_update',
      payload: weatherState,
      timestamp: Date.now(),
    });

    // Broadcast system weather alert in chat
    broadcast({
      type: 'chat',
      payload: {
        id: `sys_weather_${Date.now()}`,
        channel: 'system',
        sender: '坍界天候预警台',
        senderTitle: '全频段广播',
        text: `【气象骤变】野外区域已切换为「${nextWeather.name}」(${nextWeather.desc})！前哨领地安全区依旧恒定晴朗。`,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      },
    });
  }
}, 1000);

// Zombie sweep: 正常客户端每 50ms 同步一次，60s 无声的视为幽灵连接，直接踢掉并广播离开
setInterval(() => {
  const now = Date.now();
  for (const [id, client] of clients.entries()) {
    if (now - client.player.lastSeen > 60000) {
      try {
        client.ws.terminate();
      } catch { /* ignore */ }
      clients.delete(id);
      broadcast({
        type: 'player_left',
        payload: { playerId: id, name: client.player.name },
        timestamp: now,
      });
      console.log(`[sweep] removed silent client ${client.player.name} (${id}), online=${clients.size}`);
    }
  }
}, 30000);

// WebSocket Connection Handling
wss.on('connection', (ws: WebSocket, req) => {
  const playerId = 'player_' + Math.random().toString(36).substring(2, 9);
  const randomNameIndex = Math.floor(Math.random() * PREFAB_NAMES.length);
  const assignedName = `${PREFAB_NAMES[randomNameIndex]} #${Math.floor(100 + Math.random() * 900)}`;

  const newPlayer: OnlinePlayer = {
    id: playerId,
    name: assignedName,
    level: 1,
    title: '废土流浪者',
    avatarSeed: playerId,
    x: (Math.random() - 0.5) * 3,
    y: (Math.random() - 0.5) * 3,
    angle: 0,
    mapId: 'camp_plaza',
    hp: 100,
    maxHp: 100,
    shield: 0,
    maxShield: 50,
    isFiring: false,
    isDashing: false,
    color: ['#06b6d4', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'][
      Math.floor(Math.random() * 6)
    ],
    ping: 28,
    lastSeen: Date.now(),
    currentAction: '徒手求生',
  };

  clients.set(playerId, { ws, playerId, player: newPlayer, isGM: false });

  // Send initial state to the connecting client
  const allPlayers = Array.from(clients.values()).map((c) => c.player);
  const curWild = WILD_WEATHERS[wildWeatherIndex];

  const initMsg: NetMessage = {
    type: 'init',
    payload: {
      selfId: playerId,
      selfPlayer: newPlayer,
      players: allPlayers,
      buildings: worldBuildings,
      weather: {
        current: curWild.type,
        name: curWild.name,
        icon: curWild.icon,
        desc: curWild.desc,
        effectLabel: curWild.effectLabel,
        durationLeft: weatherTimer,
      },
      serverTime: Date.now(),
    },
  };
  ws.send(JSON.stringify(initMsg));

  // Broadcast to other players that new player joined
  broadcast(
    {
      type: 'player_joined',
      payload: newPlayer,
      timestamp: Date.now(),
    },
    playerId
  );

  // Broadcast chat announcement
  broadcast({
    type: 'chat',
    payload: {
      id: `sys_join_${Date.now()}`,
      channel: 'world',
      sender: '全区频道',
      senderTitle: '接入通知',
      text: `📡 玩家 [${newPlayer.name}] (Lv.${newPlayer.level}) 已同步接入战区节点！当前在线探索者: ${clients.size} 人`,
      timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    },
  });

  // Handle incoming messages
  ws.on('message', (data: string) => {
    try {
      const msg: NetMessage = JSON.parse(data.toString());
      const client = clients.get(playerId);
      if (!client) return;

      switch (msg.type) {
        case 'player_sync': {
          // Client sends position, angle, action, health, mapId
          const p = client.player;
          if (msg.payload.x !== undefined) p.x = msg.payload.x;
          if (msg.payload.y !== undefined) p.y = msg.payload.y;
          if (msg.payload.angle !== undefined) p.angle = msg.payload.angle;
          if (msg.payload.mapId !== undefined) p.mapId = msg.payload.mapId;
          if (msg.payload.hp !== undefined) p.hp = msg.payload.hp;
          if (msg.payload.shield !== undefined) p.shield = msg.payload.shield;
          if (msg.payload.level !== undefined) p.level = msg.payload.level;
          if (msg.payload.isFiring !== undefined) p.isFiring = msg.payload.isFiring;
          if (msg.payload.isDashing !== undefined) p.isDashing = msg.payload.isDashing;
          if (msg.payload.currentAction !== undefined) p.currentAction = msg.payload.currentAction;
          p.lastSeen = Date.now();

          // Broadcast to other players in the room
          broadcast(
            {
              type: 'player_sync',
              payload: p,
              senderId: playerId,
              timestamp: Date.now(),
            },
            playerId
          );
          break;
        }

        case 'building_placed': {
          // Player builds a structure (e.g. wall, safe_door, turret, floor, etc.)
          const bData = msg.payload;
          const newBuilding: BuildingEntity = {
            id: `build_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            type: bData.type,
            name: bData.name || '防御建筑',
            x: bData.x,
            y: bData.y,
            hp: bData.hp || 3000,
            maxHp: bData.maxHp || 3000,
            level: bData.level || 1,
            isOpen: false,
            isLocked: true,
            ownerId: playerId,
            ownerName: client.player.name,
            mapId: bData.mapId || client.player.mapId,
            material: bData.material || 'iron',
            storedLoot: bData.type === 'safe_door' ? [
              { name: '坍界高纯晶石', count: 12, icon: '💎' },
              { name: '高聚合爆破装药', count: 3, icon: '💣' },
              { name: '战备信用凭证', count: 1800, icon: '💰' }
            ] : undefined,
          };

          worldBuildings.push(newBuilding);

          broadcast({
            type: 'building_placed',
            payload: newBuilding,
            senderId: playerId,
            timestamp: Date.now(),
          });

          // Chat notification for safe door setup
          if (newBuilding.type === 'safe_door') {
            broadcast({
              type: 'chat',
              payload: {
                id: `sys_build_${Date.now()}`,
                channel: 'world',
                sender: '领地监控台',
                senderTitle: '防御构筑',
                text: `🛡️ 玩家 [${client.player.name}] 在区域 [${newBuilding.mapId}] 部署了【高耐久安全闸门】(耐久: ${newBuilding.maxHp})！领地突袭与防守协议已激活。`,
                timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
              },
            });
          }
          break;
        }

        case 'raid_attempt': {
          // Raid attack on a territory building (Safe Door / Outpost Core)
          const { targetId, supplyId, supplyName } = msg.payload;
          const target = worldBuildings.find((b) => b.id === targetId);

          if (!target) {
            ws.send(JSON.stringify({
              type: 'raid_result',
              payload: { error: '目标建筑不存在或已瓦解' },
            }));
            return;
          }

          // Calculate damage with randomness and critical hits
          let baseDamage = 500;
          let critChance = 0.25;
          let critMult = 1.8;
          let successChance = 0.85;

          if (supplyId === 'c4_explosive') {
            baseDamage = 900;
            critChance = 0.35;
            critMult = 2.0;
            successChance = 0.88;
          } else if (supplyId === 'thermite_charge') {
            baseDamage = 750;
            critChance = 0.28;
            critMult = 1.85;
            successChance = 0.95;
          } else if (supplyId === 'emp_breacher') {
            baseDamage = 600;
            critChance = 0.40;
            critMult = 2.2;
            successChance = 0.80;
          } else if (supplyId === 'plasma_torch') {
            baseDamage = 550;
            critChance = 0.20;
            critMult = 1.5;
            successChance = 0.98;
          }

          const roll = Math.random();
          const isSuccess = roll <= successChance;
          const isCritical = Math.random() < critChance;

          let actualDamage = isSuccess ? baseDamage : Math.floor(baseDamage * 0.35);
          if (isCritical) {
            actualDamage = Math.floor(actualDamage * critMult);
          }

          // Random damage jitter (+-15%)
          actualDamage = Math.floor(actualDamage * (0.85 + Math.random() * 0.3));

          target.hp = Math.max(0, target.hp - actualDamage);
          const isBreached = target.hp <= 0;

          const raidEvent: RaidEvent = {
            targetId: target.id,
            targetName: target.name,
            targetX: target.x,
            targetY: target.y,
            ownerName: target.ownerName || '领地所有者',
            raiderId: playerId,
            raiderName: client.player.name,
            supplyUsed: supplyName || '破拆装药',
            damage: actualDamage,
            remainingHp: target.hp,
            isCritical,
            isBreached,
            timestamp: Date.now(),
            loot: isBreached ? (target.storedLoot || [
              { name: '坍界高纯晶石', count: 15, icon: '💎' },
              { name: '珍贵机械齿轮', count: 6, icon: '⚙️' },
              { name: '废土信用凭证', count: 1600, icon: '💰' }
            ]) : undefined,
          };

          // If breached, unlock and open the door or remove
          if (isBreached) {
            target.isOpen = true;
            target.isLocked = false;
          }

          // Broadcast raid result to all players
          broadcast({
            type: 'raid_result',
            payload: raidEvent,
            timestamp: Date.now(),
          });

          // Broadcast server-wide emergency alert
          if (isBreached) {
            broadcast({
              type: 'chat',
              payload: {
                id: `sys_raid_${Date.now()}`,
                channel: 'world',
                sender: '🚨 紧急战报',
                senderTitle: '破门警报',
                text: `💥【领地攻破】玩家 [${client.player.name}] 成功爆破攻陷了 [${target.ownerName}] 的安全门！缴获全部战利品物资！`,
                timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
              },
            });
          } else {
            broadcast({
              type: 'chat',
              payload: {
                id: `sys_raid_${Date.now()}`,
                channel: 'world',
                sender: '⚠️ 突袭警报',
                senderTitle: '攻防交火',
                text: `⚠️ [${client.player.name}] 使用 [${raidEvent.supplyUsed}] 突袭安全门！${isCritical ? '【致命暴击!】' : ''}造成 ${actualDamage} 点破拆伤害！安全门剩余耐久: ${target.hp}/${target.maxHp}`,
                timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
              },
            });
          }
          break;
        }

        case 'chat': {
          const chatPayload = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            channel: msg.payload.channel || 'world',
            sender: client.player.name,
            senderTitle: `Lv.${client.player.level} ${client.player.title}`,
            text: msg.payload.text,
            timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          };
          broadcast({
            type: 'chat',
            payload: chatPayload,
            senderId: playerId,
            timestamp: Date.now(),
          });
          break;
        }

        case 'ping': {
          ws.send(JSON.stringify({ type: 'pong', payload: { serverTime: Date.now() } }));
          break;
        }

        case 'gm_auth': {
          const ok = msg.payload && msg.payload.token === GM_TOKEN;
          client.isGM = !!ok;
          ws.send(JSON.stringify({
            type: 'gm_auth_result',
            payload: { ok: !!ok, playerId },
          }));
          console.log(`[gm] auth ${ok ? 'OK' : 'FAIL'} for ${client.player.name} (${playerId})`);
          break;
        }

        case 'weather_set': {
          if (!client.isGM) {
            ws.send(JSON.stringify({
              type: 'gm_auth_result',
              payload: { ok: false, error: 'GM only' },
            }));
            break;
          }
          const idx = WILD_WEATHERS.findIndex((w) => w.type === msg.payload?.weather);
          if (idx < 0) break;
          wildWeatherIndex = idx;
          weatherTimer = 180;
          const nextWeather = WILD_WEATHERS[wildWeatherIndex];
          const weatherState: WeatherState = {
            current: nextWeather.type,
            name: nextWeather.name,
            icon: nextWeather.icon,
            desc: nextWeather.desc,
            effectLabel: nextWeather.effectLabel,
            durationLeft: weatherTimer,
          };
          broadcast({ type: 'weather_update', payload: weatherState, timestamp: Date.now() });
          broadcast({
            type: 'chat',
            payload: {
              id: `sys_gmweather_${Date.now()}`,
              channel: 'system',
              sender: '坍界天候预警台',
              senderTitle: 'GM 调度',
              text: `【GM调度】野外天气已切换为「${nextWeather.name}」！`,
              timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
            },
          });
          break;
        }
      }
    } catch (err) {
      console.error('Error handling WebSocket message:', err);
    }
  });

  ws.on('close', () => {
    const leaving = clients.get(playerId);
    clients.delete(playerId);
    if (leaving) {
      broadcast({
        type: 'player_left',
        payload: { playerId, name: leaving.player.name },
        timestamp: Date.now(),
      });
      broadcast({
        type: 'chat',
        payload: {
          id: `sys_leave_${Date.now()}`,
          channel: 'world',
          sender: '全区频道',
          senderTitle: '离线通知',
          text: `🚪 玩家 [${leaving.player.name}] 已断开战区同步。当前在线: ${clients.size} 人`,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        },
      });
    }
  });
});

// Setup Vite middlewares in development or static serve in production
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  // 双栈监听（IPv4+IPv6）：localhost 在某些系统优先解析到 ::1，只绑 0.0.0.0 会导致浏览器打不开
  server.listen(PORT, () => {
    console.log(`[Rift Walker MMORPG] Server running on http://0.0.0.0:${PORT}`);
    console.log(`[Rift Walker MMORPG] Realtime WebSocket gateway active at ws://0.0.0.0:${PORT}/ws`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
