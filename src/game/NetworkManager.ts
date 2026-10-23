import {
  OnlinePlayer,
  BuildingEntity,
  WeatherState,
  RaidEvent,
  NetMessage,
  MapZoneId,
} from '../types/game';
import type { GameStateSnapshot } from '../../server/worldState';
import { StateDecoder } from './stateSync';

export interface NetworkCallbacks {
  onGameState?: (state: GameStateSnapshot) => void;
  onInit: (data: {
    selfId: string;
    selfPlayer: OnlinePlayer;
    players: OnlinePlayer[];
    buildings: BuildingEntity[];
    weather: WeatherState;
    gameState?: GameStateSnapshot;
  }) => void;
  onPlayerJoined: (player: OnlinePlayer) => void;
  onPlayerLeft: (playerId: string, name: string) => void;
  onPlayerSync: (player: OnlinePlayer) => void;
  onBuildingPlaced: (building: BuildingEntity) => void;
  onRaidResult: (raidEvent: RaidEvent) => void;
  onWeatherUpdate: (weather: WeatherState) => void;
  onChatMessage: (msg: any) => void;
  onConnectionChange: (connected: boolean, ping: number | null) => void;
  onGMStatus: (ok: boolean, error?: string) => void;
  onPvpHit?: (hit: { attackerId: string; attackerName: string; damage: number }) => void;
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private callbacks: NetworkCallbacks;
  public isConnected: boolean = false;
  public ping: number | null = null;
  private pingInterval: any = null;
  private lastPingSent: number = 0;
  private reconnectTimer: any = null;
  private disposed: boolean = false; // 销毁后不再重连（防幽灵连接）
  private sessionPending = false;
  private stateDecoder = new StateDecoder();
  private awaitingBaseline = false;
  public selfId: string = '';

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  public async connect() {
    this.disposed = false;
    if (this.sessionPending || (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.sessionPending = true;
      const session = await fetch('/api/session', { credentials: 'same-origin' });
      if (!session.ok) throw new Error('无法恢复玩家身份');
      if (this.disposed) return;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.stateDecoder.reset(); this.awaitingBaseline = false;
        this.isConnected = false; this.ping = null; this.lastPingSent = 0;
        this.callbacks.onConnectionChange(false, null);
        this.startPingLoop();
        this.send({ type: 'state_sync', payload: { version: 1 } });
        console.log('[Multiplayer] Connected to game server:', wsUrl);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: NetMessage = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (err) {
          console.error('[Multiplayer] Failed to parse message:', err);
        }
      };

      this.ws.onclose = (event) => {
        this.stateDecoder.reset(); this.awaitingBaseline = false;
        this.isConnected = false; this.ping = null; this.lastPingSent = 0;
        this.stopPingLoop();
        this.callbacks.onConnectionChange(false, null);
        if (event.code === 4001) {
          this.disposed = true;
          return;
        }
        console.warn('[Multiplayer] Connection closed. Retrying in 2.5s...');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[Multiplayer] WebSocket error:', err);
      };
    } catch (e) {
      console.error('[Multiplayer] Failed to initialize WebSocket:', e);
      this.scheduleReconnect();
    } finally {
      this.sessionPending = false;
    }
  }

  private scheduleReconnect() {
    if (this.disposed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (this.disposed) return;
      this.connect();
    }, 2500);
  }

  private startPingLoop() {
    this.stopPingLoop();
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN && this.lastPingSent === 0) {
        this.lastPingSent = Date.now();
        this.send({ type: 'ping', payload: {} });
      }
    }, 3000);
  }

  private stopPingLoop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  public send(msg: NetMessage) {
    if (!this.isConnected && (msg.type === 'game_action' || msg.type === 'player_sync')) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  public syncPlayerState(state: {
    x: number;
    y: number;
    angle: number;
    mapId: MapZoneId;
    hp: number;
    shield: number;
    level: number;
    isFiring: boolean;
    isDashing: boolean;
    currentAction?: string;
  }) {
    this.send({
      type: 'player_sync',
      payload: state,
    });
  }

  public placeBuilding(building: {
    type: string;
    name: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    mapId: MapZoneId;
    material?: 'wood' | 'stone' | 'iron';
  }) {
    this.gameAction('build', { buildType: building.type, x: building.x, y: building.y });
  }

  public attemptRaid(targetId: string, supplyId: string, supplyName: string) {
    this.gameAction('raid', { targetId, supplyId });
  }

  public gameAction(action: string, payload: Record<string, unknown> = {}) {
    let requestId: string;
    if (typeof crypto.randomUUID === 'function') {
      requestId = crypto.randomUUID();
    } else {
      // LAN HTTP has getRandomValues, but randomUUID requires a secure context.
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      requestId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
    }
    this.send({ type: 'game_action', payload: { ...payload, action, requestId } });
    return requestId;
  }

  public sendChat(channel: 'world' | 'team' | 'system', text: string) {
    this.send({
      type: 'chat',
      payload: { channel, text },
    });
  }

  public gmAuth(token: string) {
    this.send({ type: 'gm_auth', payload: { token } });
  }

  public requestWeather(weather: string) {
    this.send({ type: 'weather_set', payload: { weather } });
  }

  public sendPvpHit(targetId: string, damage: number) {
    this.send({ type: 'pvp_hit', payload: { targetId, damage } });
  }

  public visitHome(targetPlayerId: string) {
    this.gameAction('enter_camp', { campId: `home_${targetPlayerId}` });
  }
  public goHome(selfId: string) {
    this.gameAction('enter_camp', { campId: `home_${selfId}` });
  }

  private markGameplayReady() {
    if (this.isConnected) return;
    this.isConnected = true;
    this.callbacks.onConnectionChange(true, this.ping);
  }

  private handleMessage(msg: NetMessage) {
    switch (msg.type) {
      case 'game_state': {
        this.stateDecoder.reset(); this.awaitingBaseline = false;
        this.callbacks.onGameState?.(msg.payload);
        this.markGameplayReady();
        break;
      }
      case 'game_state_patch': {
        const state = this.stateDecoder.decode(msg.payload);
        if (state) {
          this.awaitingBaseline = false;
          this.callbacks.onGameState?.(state);
          this.markGameplayReady();
        } else if (!this.awaitingBaseline) {
          this.awaitingBaseline = true;
          this.isConnected = false; this.ping = null; this.lastPingSent = 0;
          this.callbacks.onConnectionChange(false, null);
          this.send({ type: 'state_sync', payload: { version: 1 } });
        }
        break;
      }
      case 'init': {
        this.stateDecoder.reset(); this.awaitingBaseline = false;
        this.selfId = msg.payload.selfId;
        this.callbacks.onInit(msg.payload);
        if (msg.payload.gameState) this.markGameplayReady();
        break;
      }

      case 'player_joined': {
        this.callbacks.onPlayerJoined(msg.payload);
        break;
      }

      case 'player_left': {
        this.callbacks.onPlayerLeft(msg.payload.playerId, msg.payload.name);
        break;
      }

      case 'player_sync': {
        this.callbacks.onPlayerSync(msg.payload);
        break;
      }

      case 'building_placed': {
        this.callbacks.onBuildingPlaced(msg.payload);
        break;
      }

      case 'raid_result': {
        this.callbacks.onRaidResult(msg.payload);
        break;
      }

      case 'weather_update': {
        this.callbacks.onWeatherUpdate(msg.payload);
        break;
      }

      case 'chat': {
        this.callbacks.onChatMessage(msg.payload);
        break;
      }

      case 'gm_auth_result': {
        this.callbacks.onGMStatus?.(!!msg.payload?.ok, msg.payload?.error);
        break;
      }

      case 'pong': {
        if (this.isConnected && this.lastPingSent > 0) {
          this.ping = Math.max(0, Date.now() - this.lastPingSent);
          this.lastPingSent = 0;
          this.callbacks.onConnectionChange(true, this.ping);
        }
        break;
      }
      case 'pvp_hit': {
        this.callbacks.onPvpHit?.(msg.payload);
        break;
      }
    }
  }

  public disconnect() {
    this.stateDecoder.reset(); this.awaitingBaseline = false;
    this.disposed = true;
    this.stopPingLoop();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      // 先解绑回调，防止 close 事件触发幽灵重连
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.isConnected = false; this.ping = null; this.lastPingSent = 0;
  }
}
