import {
  OnlinePlayer,
  BuildingEntity,
  WeatherState,
  RaidEvent,
  NetMessage,
  MapZoneId,
} from '../types/game';

export interface NetworkCallbacks {
  onInit: (data: {
    selfId: string;
    selfPlayer: OnlinePlayer;
    players: OnlinePlayer[];
    buildings: BuildingEntity[];
    weather: WeatherState;
  }) => void;
  onPlayerJoined: (player: OnlinePlayer) => void;
  onPlayerLeft: (playerId: string, name: string) => void;
  onPlayerSync: (player: OnlinePlayer) => void;
  onBuildingPlaced: (building: BuildingEntity) => void;
  onRaidResult: (raidEvent: RaidEvent) => void;
  onWeatherUpdate: (weather: WeatherState) => void;
  onChatMessage: (msg: any) => void;
  onConnectionChange: (connected: boolean, ping: number) => void;
  onGMStatus: (ok: boolean, error?: string) => void;
  onPvpHit?: (hit: { attackerId: string; attackerName: string; damage: number }) => void;
}

export class NetworkManager {
  private ws: WebSocket | null = null;
  private callbacks: NetworkCallbacks;
  public isConnected: boolean = false;
  public ping: number = 0;
  private pingInterval: any = null;
  private lastPingSent: number = 0;
  private reconnectTimer: any = null;
  private disposed: boolean = false; // 销毁后不再重连（防幽灵连接）
  public selfId: string = '';

  constructor(callbacks: NetworkCallbacks) {
    this.callbacks = callbacks;
  }

  public connect() {
    this.disposed = false;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.callbacks.onConnectionChange(true, this.ping);
        this.startPingLoop();
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

      this.ws.onclose = () => {
        this.isConnected = false;
        this.stopPingLoop();
        this.callbacks.onConnectionChange(false, 0);
        console.warn('[Multiplayer] Connection closed. Retrying in 2.5s...');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.error('[Multiplayer] WebSocket error:', err);
      };
    } catch (e) {
      console.error('[Multiplayer] Failed to initialize WebSocket:', e);
      this.scheduleReconnect();
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
      if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
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
    this.send({
      type: 'building_placed',
      payload: building,
    });
  }

  public attemptRaid(targetId: string, supplyId: string, supplyName: string) {
    this.send({
      type: 'raid_attempt',
      payload: { targetId, supplyId, supplyName },
    });
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
    this.send({ type: 'player_sync', payload: { mapId: `home_${targetPlayerId}` as any, x: 0, y: 9 } });
  }
  public goHome(selfId: string) {
    this.send({ type: 'player_sync', payload: { mapId: `home_${selfId}` as any, x: 0, y: 9 } });
  }

  private handleMessage(msg: NetMessage) {
    switch (msg.type) {
      case 'init': {
        this.selfId = msg.payload.selfId;
        this.callbacks.onInit(msg.payload);
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
        if (this.lastPingSent > 0) {
          this.ping = Math.max(12, Date.now() - this.lastPingSent);
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
    this.isConnected = false;
  }
}
