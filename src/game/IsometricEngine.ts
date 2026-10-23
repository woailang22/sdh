import { soundManager } from '../audio/soundManager';
import { calcRangedDamage, rollCrit, weatherCritBonus, MELEE, aggroRangeFor, isEnraged, calcMonsterHit, absorbShieldFirst } from './combat';
import { ACID_SHIELD_DRAIN, WEATHER_DURATION, weatherInfo } from './weather';
import { SUBMAPS, displayName, regionOf, lootResourceOf } from './maps';
import { groundBaseColor, hash2 as hash2Pure, withAlpha, themeAccent, drawSoftShadow, healthBarColor, weatherTint, themeHaze } from './visualTheme';
import type { GroundTheme } from './visualTheme';
import { groupBuildingsIntoHouses, houseCorners, HOUSE_WALL_H, type HouseGroup } from './house';
import { drawHouseLayer, drawWaterHousePlatform, waterHousePlatformBounds } from './houseRenderer';
import { frameContent, angleToSurvivorFrame, interactableSprite, buildingSprite } from './art';
import { isHostile, canOperateDoor } from './diplomacy';
import { CHUNK_SIZE, WORLD_MIN, WORLD_MAX, generateWorldChunk, worldToChunk, worldThemeAt, worldLocationAt, worldIsRoad, type WorldChunk } from './world';
import { findPath, isPositionBlocked, hasLineOfSight } from './navigation';
import { campExitPosition } from './home';
import { BUILD_RECIPES } from './buildingRecipes';
import { recordRenderFailure } from './renderDiagnostics';
import { generateWorldScenery, type WorldScenery } from './worldScenery';
import { ROADSIDE_USES, WORLD_ROADSIDE_STOPS, type RoadsideStop } from './worldRoutes';
import {
  MonsterEntity,
  InteractableEntity,
  Particle,
  SquadMember,
  BuildingEntity,
  WeatherType,
  WeatherState,
  MapZoneId,
  OnlinePlayer,
} from '../types/game';

export interface GameCallbacks {
  onRenderStatus?: (message: string | null) => void;
  onGameAction?: (action: string, payload?: Record<string, unknown>) => void;
  onCampInteract?: () => boolean;
  onOpenWorkbench: () => void;
  onLootFound: (item: string, count: number, resourceType?: 'wood' | 'stone' | 'scrap' | 'parts' | 'food' | 'ammo' | 'c4' | 'medical' | 'weapon' | 'armor' | 'credits' | 'shard' | 'blueprint' | 'pack') => void;
  // 三角洲式开箱：读条完成后打开搜刮面板，由玩家挑选（不再自动全拿）
  onOpenLootPanel?: (target: { id: string; name: string; items: { itemId: string; name: string; count: number }[] }) => void;
  onMonsterKilled: (monsterName: string, monsterMaxHp?: number) => void;
  onPlayerDamage: (damage: number) => void;
  onUpdateSquadStatus: (members: SquadMember[]) => void;
  onBuildingPlaced: (type: string, costWood: number, costStone: number, costScrap: number, costParts: number) => boolean;
  onOpenStorageBox: (building?: BuildingEntity) => void;
  onWeatherChange: (weather: WeatherState) => void;
  onMapZoneChange: (mapId: MapZoneId) => void;
  onOpenRaidModal?: (building: BuildingEntity) => void;
  onPlayerSyncNeeded?: (playerState: {
    x: number;
    y: number;
    angle: number;
    mapId: MapZoneId;
    hp: number;
    shield: number;
    level: number;
    isFiring: boolean;
    isDashing: boolean;
  }) => void;
  onPlayerDeathDrop?: (mapId: string) => void;
}

export interface MapWaypoint {
  targetMap: MapZoneId;
  name: string;
  x: number;
  y: number;
  icon: string;
  description: string;
  targetX: number;
  targetY: number;
}

interface GroundRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TILE_CELL_SIZE = 64;
const TILE_CELL_STRIDE = TILE_CELL_SIZE + 2;
const TILE_ATLAS_SIZE = 7 * TILE_CELL_STRIDE;

export class IsometricEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: GameCallbacks;

  // Viewport & Camera
  private width: number = 0;
  private height: number = 0;
  public camera = { x: 0, y: 0 };
  public mouse = { screenX: 0, screenY: 0, worldX: 0, worldY: 0, isDown: false };

  // Current Active Map Theme
  public currentMapId: MapZoneId = 'world';
  private worldChunks = new Map<string, WorldChunk>();
  private worldWindow = '';
  private serverBuildings: BuildingEntity[] = [];
  private serverDrops = new Map<string, InteractableEntity>();
  private monsterAuthority = false;
  private monsterTargets = new Map<string, { x: number; y: number }>();
  private movePath: { x: number; y: number }[] = [];
  public navigationTarget: { x: number; y: number; name: string } | null = null;
  public campEntrances: { id: string; ownerId: string; ownerName: string; x: number; y: number }[] = [];
  public friendlyPlayerIds: Set<string> = new Set();
  public campSize = 64;
  public inputBlocked = false;

  // Multiplayer Online State
  public localPlayerId: string = '';
  public onlinePlayers: Map<string, OnlinePlayer> = new Map();
  private syncTimer: number = 0;

  // Brightness setting (default high for crystal clear visibility)
  public brightnessMultiplier: number = 1.12;
  public isBrightMode: boolean = true;

  // Art sprite cache (/art/*, lazy-load on first use; missing/failed -> procedural fallback)
  public artImages: Map<string, HTMLImageElement> = new Map();

  // 按主题/变体共用地砖图集，64×64 采样按需烘焙。
  private tilePatchCache: Map<string, HTMLCanvasElement> = new Map();
  private tilePatchCells = new WeakMap<HTMLCanvasElement, Set<number>>();
  private tilePatchScratch: HTMLCanvasElement | null = null;
  private artRevision = 0;
  private groundTileChanges = new Set<string>();
  private worldScenery: WorldScenery[] = [];
  private sceneryCache = new WeakMap<WorldChunk, WorldScenery[]>();
  private groundCache: { canvas: HTMLCanvasElement; overlay?: HTMLCanvasElement; key: string; x: number; y: number } | null = null;
  private wallImages = new Map<string, HTMLCanvasElement>();
  private readonly listenerController = new AbortController();

  // Player Placed Floors (key: `${wx},${wy}`)
  public placedFloors: Map<string, { x: number; y: number; type: 'wood_floor' | 'stone_floor' | 'iron_floor' }> = new Map();

  // Inter-Map Physical Waypoint Gateways & Boundary Travel
  public mapWaypoints: MapWaypoint[] = [];
  public warpCooldown: number = 0;
  public zoneTransitionBanner: { text: string; subText: string; timer: number; maxTimer: number } | null = null;

  // Isometric Grid Config
  private readonly TILE_W = 64;
  private readonly TILE_H = 32;

  // Weather System
  public currentWeather: WeatherType = 'clear';
  public weatherDurationLeft: number = WEATHER_DURATION;
  private weatherDeadline = Date.now() + WEATHER_DURATION * 1000;
  private lightningFlash: number = 0;
  private nextLightningTime: number = 8;
  private fogOffsets: { x: number; y: number; speed: number; radius: number }[] = [];

  // Player State（单人末日生存零开局：徒手/无弹药，靠采集起家）
  public player = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    speed: 3.8,
    angle: 0,
    isFiring: false,
    fireTimer: 0,
    fireRate: 0.12,
    recoil: 0,
    isDashing: false,
    dashTimer: 0,
    hp: 100,
    maxHp: 100,
    shield: 0,
    maxShield: 50,
    stamina: 100,
    maxStamina: 100,
    satiety: 100, // 饱食度：随时间流失，归零扣HP，高饱食回血
    maxSatiety: 100,
    ammo: 0,
    maxAmmo: 30,
    reserveAmmo: 0,
  };

  // 求生装备加成（由 App 按装备栏每帧同步）
  public hasRangedWeapon: boolean = false; // 装备武器才能射击，否则左键为徒手/工具近战
  public rangedDamage: number = 124; // 土铳55 / 步枪124
  public rangedRange: number = 12; // 土铳10 / 步枪12，由 App 按装备同步
  public rangedSpread: number = 0.03; // 土铳0.09 / 步枪0.03
  public rangedCritChance: number = 0.25; // 基础暴击，雷暴天气+0.2
  public rangedCritMult: number = 1.3; // 步枪1.3 / 土铳1.5
  public toolKind: 'none' | 'axe' | 'pick' | 'rod' = 'none'; // 星露谷式工具分化：斧砍树/镐采矿/竿钓鱼
  public meleeDamage: number = 12; // 徒手12 / 持工具22
  public armorReduction: number = 0; // 防弹背心 0.15 减伤
  public shieldRegenAt: number = 0; // 护盾延迟回复起点（受伤后+5s，Task 5 接回复逻辑）
  public invulnUntil: number = -99; // 冲刺无敌帧结束时间点（Task 5 接 performDash）
  public shake: number = 0; // 受击震屏强度，每帧衰减（Task 5 接渲染）
  public hurtFlash: number = 0; // 受击红屏剩余秒数（Task 5 接渲染）
  // 采集技能产量加成（App 按伐木/采矿/垂钓等级同步）
  public skillWood: number = 1;
  public skillStone: number = 1;
  public skillFish: number = 1;
  private lastHurtAt: number = -99; // 上次受伤时间（搜刮打断用）
  private meleeTimer: number = 0;
  public gatherCooldown: number = 0; // 徒手采集读条防刷

  // Keyboard state & Movement Controls
  public keys: { [key: string]: boolean } = {};
  public targetMovePoint: { x: number; y: number } | null = null;
  public virtualJoystick: { x: number; y: number } = { x: 0, y: 0 };

  // Entities
  public monsters: MonsterEntity[] = [];
  public interactables: InteractableEntity[] = [];
  public buildings: BuildingEntity[] = [];
  private houseGroupSource: BuildingEntity[] | null = null;
  private houseGroupLength = -1;
  private houseGroups: HouseGroup[] = [];
  public particles: Particle[] = [];
  public activeSlot: number = 1; // 1-6

  // Build Mode state
  public isBuildMode: boolean = false;
  public selectedBuildType: string = 'iron_wall';
  public buildFacing: 'ew' | 'ns' = 'ew'; // 建造朝向（建造模式按 R 旋转）
  public editorFacing: 'ew' | 'ns' = 'ew'; // 编辑器放置朝向（编辑模式按 R 旋转）

  // 单人末日生存：无NPC队友，仅联机真人玩家（onlinePlayers）
  public teammates: {
    id: string;
    name: string;
    role: string;
    x: number;
    y: number;
    action?: string;
    hp: number;
    maxHp: number;
    shield: number;
    maxShield: number;
    hoverOffset?: number;
    targetLaser?: { x: number; y: number } | null;
  }[] = [];

  // Campfire position
  public campfire = { x: 2.6, y: 1.8, intensity: 1 };

  // Nearest interactable & building
  public nearestInteractable: InteractableEntity | null = null;
  public nearestBuilding: BuildingEntity | null = null;
  public lootProgress: number = 0;
  public isLooting: boolean = false;
  private lootingTimer: number = 0;
  private lootTarget: InteractableEntity | null = null; // 读条锁定的搜刮目标（防走开串台）
  private emptyHintTimer: number = 0; // 无弹药提示节流

  // Animation Loop
  private animFrameId: number = 0;
  private running = false;
  private disposed = false;
  private contextLost = false;
  private renderRetryAt = 0;
  private renderStatus: string | null = null;
  private lastRenderTime = 0;
  private lastTime: number = 0;
  private nextShotAt = 0;
  private gameTime: number = 0;
  private rainCount: number = 140;
  private rainDrops: { x: number; y: number; speed: number; len: number }[] = [];
  private groundSplashes: { x: number; y: number; radius: number; maxRadius: number; alpha: number }[] = [];

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.callbacks = callbacks;

    this.loadMapZone('world', 0, 9);
    this.initWeather();
    this.setupListeners();
    this.resize();
    canvas.addEventListener('contextlost', () => {
      this.contextLost = true;
      recordRenderFailure('Canvas context lost', { mapId: this.currentMapId, x: this.player.x, y: this.player.y });
      this.setRenderStatus('画面资源暂不可用，正在等待恢复');
      // The default Canvas 2D behavior restores the context. Do not cancel it.
    }, { signal: this.listenerController.signal });
    canvas.addEventListener('contextrestored', () => {
      this.contextLost = false;
      this.resetGraphics();
    }, { signal: this.listenerController.signal });
    // 仅加载实际绘制到的素材，不预加载未访问地图。
  }

  /**
   * 按需懒加载 /art 贴图：首次访问即创建并缓存（decoding=async）。
   * 取代首屏一次性预载全部素材（~20MB PNG 在启动瞬间把主线程解码线程占满 = 打开页面卡顿主因）。
   */
  private artImage(file: string): HTMLImageElement | null {
    if (typeof Image === 'undefined') return null;
    const src = `/art/${file}`;
    let img = this.artImages.get(src);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      img.addEventListener('load', () => {
        const tile = /^tile-(.+)-(a|b)\.png$/.exec(file);
        if (!tile && file !== 'texture-ground.png') return;
        if (tile && this.currentMapId === 'world') this.groundTileChanges.add(tile[1]);
        else this.artRevision++;
        // Only the loaded tile variant can have stale fallback patches.
        // Sprite sheets are drawn live and never invalidate cached terrain.
        if (tile) for (const [key, patch] of this.tilePatchCache) {
          if (!key.startsWith(`${tile[1]}${tile[2]}:`)) continue;
          patch.width = patch.height = 0;
          this.tilePatchCache.delete(key);
        }
      }, { once: true, signal: this.listenerController.signal });
      img.src = src;
      this.artImages.set(src, img);
    }
    return img;
  }

  /**
   * 贴图帧绘制：成功返回 true；图片未就绪/无帧/异常返回 false，
   * 调用方必须回退 procedural 绘制，保证首屏与离线可用。
   */
  private drawArtFrame(file: string, frame: string, dx: number, dy: number, dw: number, dh: number, inset = 0): boolean {
    const img = this.artImage(file);
    const r = frameContent(file, frame);
    if (!img || !r || !img.complete || img.naturalWidth === 0) return false;
    try {
      this.ctx.drawImage(img, r.x + inset, r.y + inset, r.width - inset * 2, r.height - inset * 2, dx, dy, dw, dh);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 世界坐标贴图：底部锚定在 (wx,wy) 地面点 + yOff，失败返回 false（调用方回退 procedural）。
   */
  private drawWorldSprite(file: string, frame: string, wx: number, wy: number, w: number, h: number, yOff = 0, alpha = 1): boolean {
    const s = this.toScreen(wx, wy);
    if (alpha !== 1) {
      this.ctx.save();
      this.ctx.globalAlpha = alpha;
    }
    const ok = this.drawArtFrame(file, frame, s.x - w / 2, s.y - h + yOff, w, h);
    if (alpha !== 1) this.ctx.restore();
    return ok;
  }

  /** 交互物贴图尝试：有规格表则画，无则返回 false。 */
  private tryInteractableSprite(type: string, wx: number, wy: number): boolean {
    const sp = interactableSprite(type);
    if (!sp) return false;
    return this.drawWorldSprite(sp.file, sp.frame, wx, wy, sp.w, sp.h, sp.yOff, sp.alpha);
  }

  /** 建筑贴图尝试：有规格表则画，无则返回 false（血条/名牌由调用方照常画）。 */
  private tryBuildingSprite(type: string, wx: number, wy: number): boolean {
    const sp = buildingSprite(type);
    if (!sp) return false;
    return this.drawWorldSprite(sp.file, sp.frame, wx, wy, sp.w, sp.h, sp.yOff, sp.alpha);
  }

  /** 本地玩家身体贴图（四向；枪械/名牌仍 procedural）。 */
  private drawSurvivorSprite(px: number, pyFeet: number, angle: number): boolean {
    const frame = angleToSurvivorFrame(angle);
    return this.drawArtFrame('char-survivor.png', frame, px - 17, pyFeet - 78, 34, 78);
  }

  /**
   * 地砖贴图主题：与地面 fill 分支同逻辑（camp 中心 plaza、活水/裂缝返回 null 走程序动画）。
   */
  private tileTextureKey(wx: number, wy: number, theme: string): string | null {
    if (theme === 'camp') {
      if (Math.hypot(wx, wy) < 3.8) return 'plaza';
      if (wx >= -6 && wx <= 6 && wy >= -5 && wy <= 5) return 'forest';
      return 'camp';
    }
    if (theme === 'urban' || theme === 'ruins') {
      return Math.abs(wx + wy) < 4.8 ? 'urban' : 'ruins';
    }
    if (theme === 'lake') {
      const isDock = (wx >= -2 && wx <= 4 && (wy === 0 || wy === -2 || wy === 2)) || (wx >= 1 && wx <= 3 && wy >= -3 && wy <= 3);
      if (isDock) return 'forest';
      if (wx < 3) return null;
      return 'marsh';
    }
    if (theme === 'marsh') return 'marsh';
    if (theme === 'quarry') return 'quarry';
    if (theme === 'forest') return 'forest';
    if (theme === 'field') return 'field';
    if (theme === 'plaza') return 'plaza';
    if (theme === 'rift') {
      if (Math.abs(wx - wy) < 1.8 || Math.abs(wx + wy) < 1.4) return null;
      return 'rift';
    }
    return 'camp';
  }

  /** 地砖图：B 缺失/未解码回退 A；都不在返回 null。 */
  private tileImage(theme: string, variant: 'a' | 'b'): HTMLImageElement | null {
    const get = (v: string) => this.artImage(`tile-${theme}-${v}.png`);
    const ok = (img: HTMLImageElement | null): img is HTMLImageElement =>
      !!img && img.complete && img.naturalWidth > 0;
    const primary = get(variant);
    if (ok(primary)) return primary;
    if (variant !== 'a') {
      const fallback = get('a');
      if (ok(fallback)) return fallback;
    }
    return null;
  }

  /**
   * 同主题/变体共用图集；64px 临时表面保持原遮罩，边缘复制避免小数像素串格。
   */
  private tilePatch(theme: string, variant: 'a' | 'b', px: number, py: number): HTMLCanvasElement | null {
    const ck = `${theme}${variant}:atlas`;
    const cell = py * 448 + px;
    const hit = this.tilePatchCache.get(ck);
    if (hit && this.tilePatchCells.get(hit)?.has(cell)) return hit;
    const img = this.tileImage(theme, variant);
    if (!img || typeof document === 'undefined') return null;
    const c = hit ?? document.createElement('canvas');
    if (!hit) c.width = c.height = TILE_ATLAS_SIZE;
    if (!this.tilePatchScratch) {
      this.tilePatchScratch = document.createElement('canvas');
      this.tilePatchScratch.width = this.tilePatchScratch.height = TILE_CELL_SIZE;
    }
    const scratch = this.tilePatchScratch, g = scratch.getContext('2d'), atlas = c.getContext('2d');
    if (!g || !atlas) return null;
    // Clear outside the clip too, so translucent edge pixels never accumulate.
    g.clearRect(0, 0, TILE_CELL_SIZE, TILE_CELL_SIZE);
    g.save();
    try {
      g.beginPath(); g.moveTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.lineTo(0, 32); g.closePath(); g.clip();
      g.drawImage(img, px, py, 64, 64, 0, 0, 64, 64);
    } finally { g.restore(); }
    const ax = px / TILE_CELL_SIZE * TILE_CELL_STRIDE + 1, ay = py / TILE_CELL_SIZE * TILE_CELL_STRIDE + 1;
    atlas.drawImage(scratch, ax, ay);
    atlas.drawImage(scratch, 0, 0, 64, 1, ax, ay - 1, 64, 1);
    atlas.drawImage(scratch, 0, 63, 64, 1, ax, ay + 64, 64, 1);
    atlas.drawImage(scratch, 0, 0, 1, 64, ax - 1, ay, 1, 64);
    atlas.drawImage(scratch, 63, 0, 1, 64, ax + 64, ay, 1, 64);
    this.tilePatchCache.set(ck, c);
    const cells = this.tilePatchCells.get(c) ?? new Set<number>();
    cells.add(cell); this.tilePatchCells.set(c, cells);
    return c;
  }

  /** 地砖贴图：世界锁定采样 + A/B 低概率散点混铺（B 是更暗变体，散点读作湿/磨损而非棋盘）。 */
  private drawTileTexture(wx: number, wy: number, sx: number, sy: number, theme: string) {
    const key = this.tileTextureKey(wx, wy, theme);
    if (!key) return;
    const variant = hash2Pure(wx * 31 + 7, wy * 17 + 3) < 0.22 ? 'b' : 'a';
    const snap = (v: number) => Math.floor(v / 64) * 64;
    const px = snap((((wx * 32) % 448) + 448) % 448);
    const py = snap((((wy * 32) % 448) + 448) % 448);
    const patch = this.tilePatch(key, variant, px, py);
    if (!patch) return;
    this.ctx.drawImage(patch, px / TILE_CELL_SIZE * TILE_CELL_STRIDE + 1, py / TILE_CELL_SIZE * TILE_CELL_STRIDE + 1, TILE_CELL_SIZE, TILE_CELL_SIZE, sx - 32, sy - 32, TILE_CELL_SIZE, TILE_CELL_SIZE);
  }

  // Switch / Load Map Zone
  public loadMapZone(mapId: MapZoneId, targetX: number = 0, targetY: number = 0) {
    this.warpToMap(mapId, targetX, targetY);
  }

  // Smooth Teleportation / Walking Boundary Warping across Maps
  public warpToMap(targetMap: MapZoneId, targetX: number = 0, targetY: number = 0, waypointName?: string) {
    this.setAuthoritativeDrops([]);
    this.warpCooldown = 2.5;
    this.currentMapId = targetMap;
    this.player.x = targetX;
    this.player.y = targetY;
    this.player.vx = 0;
    this.player.vy = 0;
    this.targetMovePoint = null;
    this.movePath = [];
    this.placedFloors.clear();
    this.camera.x = -(targetX - targetY) * (this.TILE_W / 2);
    this.camera.y = -(targetX + targetY) * (this.TILE_H / 2);

    // Load zone specific entities & waypoints
    this.initEntitiesForMap(targetMap);
    this.callbacks.onMapZoneChange(targetMap);
    soundManager.playLevelUp();

    // 单人模式：无NPC小队跟随传送（仅联机真人玩家各自传送）

    this.zoneTransitionBanner = {
      text: `正在进入: ${this.getMapName(targetMap)}`,
      subText: waypointName ? `通过 [${waypointName}] 穿越区域 · 地板与地貌已动态切换` : '地面与地貌已切换至当前区域特色',
      timer: 2.8,
      maxTimer: 2.8,
    };

    // Burst teleport particles
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * Math.PI * 2;
      this.particles.push({
        x: targetX,
        y: targetY,
        vx: Math.cos(angle) * 3,
        vy: Math.sin(angle) * 3,
        life: 0.7,
        maxLife: 0.7,
        color: '#38bdf8',
        size: 14,
        type: 'smoke',
      });
    }
  }

  public getMapName(id: MapZoneId): string {
    if (id === 'world') return `公共荒野 · ${worldLocationAt(this.player.x, this.player.y).name}`;
    if (String(id).startsWith('home_')) return '独立营地';
    return displayName(id);
  }

  public getGroundTheme() {
    if (this.currentMapId === 'world') return worldThemeAt(this.player.x, this.player.y);
    if (String(this.currentMapId).startsWith('home_')) return 'field';
    return SUBMAPS[this.currentMapId]?.theme ?? 'camp';
  }

  /** Swap only the nearby data window; the player and space remain continuous. */
  private refreshWorld(force = false) {
    if (this.currentMapId !== 'world') return;
    const center = worldToChunk(this.player.x, this.player.y);
    const windowKey = `${center.x},${center.y}`;
    if (!force && windowKey === this.worldWindow) return;
    this.worldWindow = windowKey;
    const chunks: WorldChunk[] = [];
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      const cx = center.x + dx, cy = center.y + dy;
      if (cx * CHUNK_SIZE < WORLD_MIN || cx * CHUNK_SIZE >= WORLD_MAX || cy * CHUNK_SIZE < WORLD_MIN || cy * CHUNK_SIZE >= WORLD_MAX) continue;
      const key = `world:${cx}:${cy}`;
      let chunk = this.worldChunks.get(key);
      if (!chunk) chunk = generateWorldChunk(cx, cy);
      this.worldChunks.delete(key);
      this.worldChunks.set(key, chunk);
      chunks.push(chunk);
    }
    while (this.worldChunks.size > 64) this.worldChunks.delete(this.worldChunks.keys().next().value!);
    this.interactables = [...chunks.flatMap(c => c.interactables), ...this.serverDrops.values()];
    if (!this.monsterAuthority) this.monsters = chunks.flatMap(c => c.monsters);
    const changes = new Map(this.serverBuildings.map(b => [b.id, b]));
    this.buildings = chunks.flatMap(c => c.buildings).map(b => changes.get(b.id) ?? b);
    this.worldScenery = chunks.flatMap(chunk => {
      let scenery = this.sceneryCache.get(chunk);
      if (!scenery) { scenery = generateWorldScenery(chunk); this.sceneryCache.set(chunk, scenery); }
      return scenery;
    });
  }

  public setAuthoritativeBuildings(buildings: BuildingEntity[]) {
    this.serverBuildings = buildings;
    if (this.currentMapId === 'world') this.refreshWorld(true);
    else this.buildings = buildings.filter(b => b.mapId === this.currentMapId);
    this.placedFloors.clear();
    for (const b of this.buildings) if (b.type.endsWith('_floor')) {
      this.placedFloors.set(`${b.x},${b.y}`, { x: b.x, y: b.y, type: b.type as 'wood_floor' | 'stone_floor' | 'iron_floor' });
    }
  }

  private currentHouseGroups() {
    if (this.houseGroupSource !== this.buildings || this.houseGroupLength !== this.buildings.length) {
      this.houseGroups = groupBuildingsIntoHouses(this.buildings);
      this.houseGroupSource = this.buildings;
      this.houseGroupLength = this.buildings.length;
    }
    return this.houseGroups;
  }

  public setAuthoritativeDrops(drops: { id: string; name: string; mapId: MapZoneId; x: number; y: number }[]) {
    const next = new Map<string, InteractableEntity>();
    for (const drop of drops) if (drop.mapId === this.currentMapId) {
      const entity = this.serverDrops.get(drop.id) ?? {
        id: drop.id, name: drop.name, type: 'box', x: drop.x, y: drop.y,
        radius: 2.8, available: true, prompt: '[E/F 搜索掉落包]', searchDuration: 0.6, stock: 1,
      };
      Object.assign(entity, { name: drop.name, x: drop.x, y: drop.y });
      next.set(drop.id, entity);
    }
    if (this.nearestInteractable && this.serverDrops.has(this.nearestInteractable.id) && !next.has(this.nearestInteractable.id)) this.nearestInteractable = null;
    if (this.lootTarget && this.serverDrops.has(this.lootTarget.id) && !next.has(this.lootTarget.id)) {
      this.isLooting = false; this.lootTarget = null; this.lootingTimer = 0; this.lootProgress = 0;
    }
    this.interactables = this.interactables.filter(it => !this.serverDrops.has(it.id) && !next.has(it.id));
    this.serverDrops = next;
    this.interactables.push(...next.values());
  }

  public setResourceStates(nodes: { id: string; stock: number; respawnAt: number }[]) {
    const states = new Map(nodes.map(n => [n.id, n]));
    for (const it of this.interactables) {
      const state = states.get(it.id);
      if (state) { it.stock = state.stock; it.respawnAt = state.respawnAt; }
    }
  }

  public setAuthoritativeMonsters(monsters: MonsterEntity[]) {
    this.monsterAuthority = true;
    const previous = new Map(this.monsters.map(m => [m.id, m]));
    this.monsterTargets = new Map(monsters.map(m => [m.id, { x: m.x, y: m.y }]));
    this.monsters = monsters.map(next => {
      const old = previous.get(next.id);
      if (!old) return { ...next };
      if (next.hp < old.hp) this.addTextParticle(next.x, next.y - 1.2, `-${Math.ceil(old.hp - next.hp)}`, '#fb923c');
      if (next.state === 'dead' && old.state !== 'dead') this.callbacks.onMonsterKilled(next.name, next.maxHp);
      const { x, y } = old;
      Object.assign(old, next);
      if (next.state !== 'dead' && Math.hypot(next.x - x, next.y - y) < 4) { old.x = x; old.y = y; }
      return old;
    });
  }

  public receiveAuthoritativeDamage(amount: number) {
    this.lastHurtAt = this.gameTime;
    this.shieldRegenAt = this.gameTime + 5;
    this.hurtFlash = 0.4;
    this.shake = Math.min(10, this.shake + 4);
    this.isLooting = false;
    this.lootTarget = null;
    this.lootingTimer = 0;
    this.lootProgress = 0;
    this.addTextParticle(this.player.x, this.player.y - 1.2, `-${Math.ceil(amount)}`, '#ef4444');
    soundManager.playHit(false);
  }

  public navigateTo(x: number, y: number) {
    this.movePath = findPath(this.player, { x, y }, this.buildings);
    this.targetMovePoint = this.movePath.at(-1) ?? null;
  }

  private initEntitiesForMap(mapId: MapZoneId) {
    if (mapId === 'world') {
      this.mapWaypoints = [];
      this.worldWindow = '';
      this.refreshWorld();
      return;
    }
    if (String(mapId).startsWith('home_')) {
      this.interactables = [];
      this.monsters = [];
      this.buildings = [];
      this.mapWaypoints = [];
      return;
    }
    // 数据驱动：实体/门/怪/建筑全部来自 maps.ts（地图编辑器改的就是这份数据）
    const isHomeInst = String(mapId).startsWith('home_') && String(mapId) !== 'home_base';
    const tplId = isHomeInst ? 'home_base' : mapId;
    const def = (SUBMAPS as any)[tplId] ?? SUBMAPS['camp_plaza'];
    const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
    this.interactables = clone(def.interactables);
    this.monsters = clone(def.monsters);
    this.buildings = clone(def.buildings);
    this.mapWaypoints = clone(def.gates).map((g: any) => ({
      targetMap: g.targetMap,
      name: g.name,
      x: g.x,
      y: g.y,
      icon: g.icon ?? '🚪',
      description: g.desc ?? '',
      targetX: g.targetX,
      targetY: g.targetY,
    }));
    if (isHomeInst) {
      const instOwner = String(mapId).slice(5);
      for (const b of this.buildings) {
        if (b.id === 'home_anchor_tpl') {
          b.ownerId = instOwner;
          b.ownerName = instOwner === this.localPlayerId ? '我的营地' : `玩家营地·${instOwner.slice(-4)}`;
        }
      }
      const cached = (this as any)._serverBuildings as import('../types/game').BuildingEntity[] | undefined;
      if (cached) {
        const mine = cached.filter((x) => String(x.mapId) === String(mapId));
        for (const m of mine) {
          if (!this.buildings.some((x) => x.id === m.id)) this.buildings.push({ ...m });
        }
      }
    }

    // 编辑器覆盖（localStorage）：只替换采集物与建筑，怪按数据刷
    try {
      const raw = localStorage.getItem('sdc_map_override_' + mapId);
      if (raw) {
        const o = JSON.parse(raw) as { interactables?: InteractableEntity[]; buildings?: BuildingEntity[] };
        if (Array.isArray(o.interactables)) this.interactables = o.interactables;
        if (Array.isArray(o.buildings)) this.buildings = o.buildings;
      }
    } catch { /* 覆盖损坏则忽略 */ }

    // 资源节点储量初始化（采集上限：采空后按 respawnSec 恢复）
    const STOCK_DEFAULTS: Record<string, { stock: number; respawn: number }> = {
      tree: { stock: 6, respawn: 75 },
      boulder: { stock: 6, respawn: 75 },
      scrap: { stock: 4, respawn: 90 },
      car: { stock: 4, respawn: 90 },
      van: { stock: 4, respawn: 120 },
      shelves: { stock: 3, respawn: 120 },
      med_cabinet: { stock: 3, respawn: 150 },
      ammo_crate: { stock: 3, respawn: 150 },
      box: { stock: 3, respawn: 120 },
      pond: { stock: 5, respawn: 45 },
      crystal: { stock: 4, respawn: 240 },
    };
    this.interactables.forEach((it) => {
      if (it.stock !== undefined) return; // 编辑器导入自带储量则保留
      const cfg = STOCK_DEFAULTS[it.type];
      if (cfg) {
        it.stock = cfg.stock;
        it.maxStock = cfg.stock;
        it.respawnSec = cfg.respawn;
        it.respawnAt = 0;
      } else {
        it.stock = Infinity;
        it.maxStock = Infinity;
      }
    });
    return;

    // ===== 以下为 LEGACY 硬编码地图（已迁移至 maps.ts，保留待清理）=====
    this.interactables = [];
    this.monsters = [];
    this.buildings = [];
    this.mapWaypoints = [];

    if (false) { // LEGACY sanctuary
      // 1. 恒界 · 开拓者安全营地与领地保护区 (80x80 大地图，领地保护覆盖)
      // Checkpoint gates at border perimeters (±34 tiles)
      this.mapWaypoints = [
        { targetMap: 'highway', name: '东岭省道公路哨卡道闸', x: 34.0, y: 0.0, icon: '🛣️', description: '出征前往 废弃省道公路与加油站 (争夺区)', targetX: -32.0, targetY: 0.0 },
        { targetMap: 'pond', name: '翠湖渔港木栈桥出口', x: 0.0, y: 34.0, icon: '🎣', description: '前往 坍界湿地废墟与钓鱼台', targetX: 0.0, targetY: -32.0 },
        { targetMap: 'forest', name: '北山密林隘口防御闸门', x: 0.0, y: -34.0, icon: '🌲', description: '前往 变异黑松林与花岗岩采石场', targetX: 0.0, targetY: 32.0 },
        { targetMap: 'rift_core', name: '灰港裂隙防线重装大门', x: -34.0, y: 0.0, icon: '⚠️', description: '深入 坍界裂隙异象核心 (极度危险红区)', targetX: 32.0, targetY: 0.0 },
      ];

      // Scavengeable Containers & Functional POIs
      // 营地定位：建造/制造大本营，不产野外物资（木/石/废铁/食物请去野外地图）
      this.interactables = [
        // Central Camp Plaza
        {
          id: 'workbench_1',
          name: '前哨军工重型制造台',
          type: 'workbench',
          x: 3.5,
          y: 1.5,
          radius: 2.5,
          prompt: '[E/F 打开军工制造]',
          available: true,
        },
      ];

      // Buildings: Camp center anchor core + Demonstration player base in Flat Building Plain
      this.buildings = [
        { id: 'anchor_1', type: 'anchor_core', name: '开拓团 · 坍界锚点水晶核心', x: 0.0, y: 0.0, hp: 6000, maxHp: 6000, level: 3, ownerName: '恒界开拓团' },
        { id: 'camp_turret_1', type: 'turret', name: '营地电弧防卫塔', x: 4.5, y: -4.5, hp: 1200, maxHp: 1200, level: 2, fireCooldown: 0, ownerName: '恒界开拓团' },
        { id: 'camp_storage_1', type: 'storage_box', name: '前哨公共储物箱', x: -3.0, y: 0.5, hp: 800, maxHp: 800, level: 2, ownerName: '恒界开拓团' },
        // Sample demonstration player territory with 5000HP Safe Door in the Flat Plain (x: 18, y: -4)
        { id: 'demo_safe_door', type: 'safe_door', name: '行者【夜刃】领地防爆安全门 [5000HP 可突袭]', x: 18.0, y: -4.0, hp: 5000, maxHp: 5000, level: 2, isOpen: false, isLocked: true, ownerId: 'demo_player_nightblade', ownerName: '夜刃 · 狂野猎手', mapId: 'sanctuary', material: 'iron', storedLoot: [
          { name: '高聚合爆破C4装药', count: 4, icon: '💣' },
          { name: '坍界高纯晶核', count: 15, icon: '💎' },
          { name: '废土高级信用点', count: 2800, icon: '💰' },
        ]},
        { id: 'demo_wall_1', type: 'iron_wall', name: '战术重合金铁墙', x: 16.0, y: -4.0, hp: 850, maxHp: 850, level: 1, ownerName: '夜刃 · 狂野猎手' },
        { id: 'demo_wall_2', type: 'iron_wall', name: '战术重合金铁墙', x: 20.0, y: -4.0, hp: 850, maxHp: 850, level: 1, ownerName: '夜刃 · 狂野猎手' },
        { id: 'demo_chest', type: 'storage_box', name: '夜刃的私人战备保险箱', x: 18.0, y: -6.0, hp: 600, maxHp: 600, level: 1, ownerName: '夜刃 · 狂野猎手' },
      ];

      // Sanctuary peaceful patrolling dummies or zero aggressive monsters
      this.monsters = [];

    } else if (false) { // LEGACY highway
      // 2. 野外 · 废弃省道公路与77号加油站 (80x80 大地图，争夺区)
      this.mapWaypoints = [
        { targetMap: 'sanctuary', name: '公路西侧营地安全检查站', x: -34.0, y: 0.0, icon: '⛺', description: '返回 恒界 · 开拓者安全营地', targetX: 32.0, targetY: 0.0 },
        { targetMap: 'rift_core', name: '省道断桥坍界高危裂缝口', x: 34.0, y: 0.0, icon: '⚠️', description: '深入 灰港坍界裂隙核心 (极度危险红区)', targetX: -32.0, targetY: 0.0 },
      ];

      this.interactables = [
        // 77号加油站便利店集群 (x: 4 to 12, y: -16 to -8)
        {
          id: 'van_highway_boss',
          name: '77号站长运载厢式货车',
          type: 'van',
          x: 4.0,
          y: -10.0,
          radius: 3.2,
          prompt: '[E/F 破拆搜刮站长货车]',
          available: true,
          searchDuration: 2.2,
          lootTable: [
            { itemId: 'fuel', name: '重载高纯度柴油罐', count: 4 },
            { itemId: 'c4_explosive', name: '高爆C4塑胶炸药', count: 2 },
            { itemId: 'scrap', name: '精炼车身钢板', count: 40 },
          ],
        },
        {
          id: 'shelves_gas_store',
          name: '便利店破损食品货架',
          type: 'shelves',
          x: 8.0,
          y: -14.0,
          radius: 2.5,
          prompt: '[E/F 搜刮便利店货架]',
          available: true,
          searchDuration: 1.5,
          lootTable: [
            { itemId: 'food', name: '战术能量肉排', count: 12 },
            { itemId: 'water', name: '高纯度饮用水', count: 8 },
            { itemId: 'credits', name: '散落钞票', count: 650 },
          ],
        },
        {
          id: 'med_cabinet_highway',
          name: '加油站墙式应急医疗箱',
          type: 'med_cabinet',
          x: 12.0,
          y: -12.0,
          radius: 2.2,
          prompt: '[E/F 搜刮急救医疗物资]',
          available: true,
          searchDuration: 1.6,
          lootTable: [
            { itemId: 'medkit', name: '纳米急救箱', count: 3 },
            { itemId: 'antidote', name: '抗酸蚀解毒剂', count: 2 },
            { itemId: 'vest', name: '军用防弹背心', count: 1 },
          ],
        },
        {
          id: 'safe_box_store',
          name: '便利店收银台保险箱',
          type: 'box',
          x: 10.0,
          y: -16.0,
          radius: 2.4,
          prompt: '[E/F 解码搜刮保险箱]',
          available: true,
          searchDuration: 2.5,
          lootTable: [
            { itemId: 'credits', name: '废土高级信用凭证', count: 1500 },
            { itemId: 'shard', name: '高纯度紫晶石', count: 5 },
          ],
        },
        // 公路主干道残骸
        {
          id: 'car_highway_truck',
          name: '废弃公路重卡车头',
          type: 'car',
          x: -6.0,
          y: 2.0,
          radius: 3.0,
          prompt: '[E/F 搜寻重卡备件]',
          available: true,
          searchDuration: 1.8,
          lootTable: [{ itemId: 'scrap', name: '重载合金钢梁', count: 45 }, { itemId: 'part', name: '重型变速箱齿轮', count: 4 }],
        },
        {
          id: 'car_highway_oil',
          name: '大型油罐车残骸',
          type: 'car',
          x: 15.0,
          y: 4.0,
          radius: 3.2,
          prompt: '[E/F 搜刮残存燃油与板材]',
          available: true,
          searchDuration: 2.0,
          lootTable: [{ itemId: 'fuel', name: '高纯度燃油', count: 6 }, { itemId: 'scrap', name: '厚重防爆钢板', count: 35 }],
        },
        {
          id: 'ammo_crate_highway',
          name: '路障军用弹药箱',
          type: 'ammo_crate',
          x: -16.0,
          y: -4.0,
          radius: 2.4,
          prompt: '[E/F 破译搜刮弹药箱]',
          available: true,
          searchDuration: 1.8,
          lootTable: [
            { itemId: 'ammo', name: '7.62mm 步枪穿甲弹药包', count: 60 },
            { itemId: 'c4_explosive', name: '高爆C4炸药', count: 2 },
            { itemId: 'rifle', name: '战术突击步枪', count: 1 },
          ],
        },
        // 新增：公路南侧枯死行道树（木）与追尾轿车（废铁/零件）
        {
          id: 'road_dead_tree',
          name: '枯死行道树',
          type: 'tree',
          x: -12.0,
          y: 10.0,
          radius: 2.6,
          prompt: '[E/F 砍伐枯树]',
          available: true,
          searchDuration: 1.6,
          lootTable: [{ itemId: 'wood', name: '干枯行道木', count: 30 }],
        },
        {
          id: 'car_highway_wreck_2',
          name: '连环追尾轿车堆',
          type: 'car',
          x: 0.0,
          y: 12.0,
          radius: 3.0,
          prompt: '[E/F 破拆事故车]',
          available: true,
          searchDuration: 1.8,
          lootTable: [
            { itemId: 'scrap', name: '事故车废铁', count: 35 },
            { itemId: 'part', name: '车载电子元件', count: 3 },
          ],
        },
      ];

      // 叛军据点拥有高耐久安全门
      this.buildings = [
        {
          id: 'wild_safe_gate_alpha',
          type: 'safe_door',
          name: '裂隙铁血掠夺者 · 重装防爆安全门 [4200HP 可突袭]',
          x: 22.0,
          y: -6.0,
          hp: 4200,
          maxHp: 6000,
          level: 2,
          isOpen: false,
          isLocked: true,
          ownerId: 'npc_raider_boss',
          ownerName: '裂隙铁血掠夺者联盟',
          mapId: 'highway',
          material: 'iron',
          storedLoot: [
            { name: '坍界暗物质晶核', count: 20, icon: '💎' },
            { name: '军用钛合金复合装甲板', count: 10, icon: '🛡️' },
            { name: '破界级等离子步枪蓝图', count: 1, icon: '📜' },
            { name: '废土高级信用点', count: 3200, icon: '💰' },
          ],
        },
        { id: 'rebel_wall_1', type: 'iron_wall', name: '重装合金墙', x: 20.0, y: -6.0, hp: 850, maxHp: 850, level: 1, ownerName: '掠夺者前哨' },
        { id: 'rebel_wall_2', type: 'iron_wall', name: '重装合金墙', x: 24.0, y: -6.0, hp: 850, maxHp: 850, level: 1, ownerName: '掠夺者前哨' },
        { id: 'rebel_chest', type: 'storage_box', name: '掠夺者军火大储物箱', x: 22.0, y: -8.0, hp: 500, maxHp: 500, level: 1, ownerName: '掠夺者前哨' },
      ];

      this.monsters = [
        { id: 'hm1', name: '变异公路漫游暴徒', x: 6.0, y: -4.0, hp: 450, maxHp: 450, speed: 2.0, damage: 26, state: 'roam', animTime: 0, attackCooldown: 0 },
        { id: 'hm2', name: '辐射畸变狂暴猎犬', x: -8.0, y: -6.0, hp: 320, maxHp: 320, speed: 2.7, damage: 22, state: 'roam', animTime: 0.3, attackCooldown: 0 },
        { id: 'hm3', name: '蚀体·恶瘴魑精英', x: 20.0, y: 6.0, hp: 550, maxHp: 550, speed: 1.8, damage: 32, state: 'roam', animTime: 0.8, attackCooldown: 0 },
        { id: 'hm4', name: '变异公路漫游暴徒', x: -18.0, y: 4.0, hp: 450, maxHp: 450, speed: 2.0, damage: 26, state: 'roam', animTime: 0.5, attackCooldown: 0 },
      ];

    } else if (false) { // LEGACY pond
      // 3. 野外 · 坍界湿地废墟与钓鱼港 (80x80 大地图)
      this.mapWaypoints = [
        { targetMap: 'sanctuary', name: '湿地北向栈道返回营地', x: 0.0, y: -34.0, icon: '⛺', description: '返回 恒界 · 开拓者安全营地', targetX: 0.0, targetY: 32.0 },
        { targetMap: 'forest', name: '湿地东侧伐木小道', x: 34.0, y: 0.0, icon: '🌲', description: '穿过 水岸前往北山密林采石场', targetX: -32.0, targetY: 0.0 },
      ];

      this.interactables = [
        {
          id: 'dock_1',
          name: '一号深水钓台',
          type: 'pond',
          x: 0.0,
          y: 6.0,
          radius: 2.8,
          prompt: '[E/F 抛竿垂钓]',
          available: true,
          lootTable: [{ itemId: 'fish', name: '变异黄颡鱼', count: 2 }, { itemId: 'fish2', name: '裂隙荧光金鳟', count: 1 }],
        },
        {
          id: 'dock_2',
          name: '二号浅滩钓台',
          type: 'pond',
          x: -6.0,
          y: 12.0,
          radius: 2.8,
          prompt: '[E/F 抛竿垂钓]',
          available: true,
          lootTable: [{ itemId: 'fish', name: '异变青鱼', count: 2 }, { itemId: 'box', name: '水下锈蚀铁盒', count: 1 }],
        },
        {
          id: 'dock_chest_1',
          name: '渔港栈道补给木箱',
          type: 'box',
          x: 4.0,
          y: 2.0,
          radius: 2.2,
          prompt: '[E/F 搜索补给箱]',
          available: true,
          searchDuration: 1.4,
          lootTable: [{ itemId: 'medkit', name: '防水医疗包', count: 2 }, { itemId: 'ammo', name: '防水步枪弹药', count: 40 }],
        },
        {
          id: 'sunken_boat_wreck',
          name: '搁浅快艇残骸',
          type: 'car',
          x: -12.0,
          y: 16.0,
          radius: 3.2,
          prompt: '[E/F 破拆快艇残骸]',
          available: true,
          searchDuration: 2.0,
          lootTable: [{ itemId: 'scrap', name: '轻量船用铝板', count: 35 }, { itemId: 'battery', name: '高耐腐蚀电池', count: 2 }],
        },
        // 新增：湖畔白杨（木）与滩涂岩（石）
        {
          id: 'lakeside_poplar',
          name: '湖畔白杨',
          type: 'tree',
          x: 10.0,
          y: -6.0,
          radius: 2.6,
          prompt: '[E/F 砍伐白杨]',
          available: true,
          searchDuration: 1.6,
          lootTable: [{ itemId: 'wood', name: '白杨木', count: 30 }],
        },
        {
          id: 'shore_rock',
          name: '滩涂岩',
          type: 'boulder',
          x: -4.0,
          y: -14.0,
          radius: 2.6,
          prompt: '[E/F 敲取滩涂岩]',
          available: true,
          searchDuration: 1.8,
          lootTable: [{ itemId: 'stone', name: '滩涂碎石', count: 25 }],
        },
      ];

      this.monsters = [
        { id: 'pm1', name: '水泽蚀化妖', x: -4.0, y: 8.0, hp: 380, maxHp: 380, speed: 2.0, damage: 20, state: 'roam', animTime: 0, attackCooldown: 0 },
        { id: 'pm2', name: '蚀体·泥沼潜伏者', x: 8.0, y: 14.0, hp: 440, maxHp: 440, speed: 1.6, damage: 24, state: 'roam', animTime: 0.6, attackCooldown: 0 },
      ];

    } else if (false) { // LEGACY forest
      // 4. 野外 · 变异黑松林与花岗岩采石场 (80x80 大地图)
      this.mapWaypoints = [
        { targetMap: 'sanctuary', name: '黑松林南向归途道闸', x: 0.0, y: 34.0, icon: '⛺', description: '返回 恒界 · 开拓者安全营地', targetX: 0.0, targetY: -32.0 },
        { targetMap: 'rift_core', name: '采石深处高能异化裂隙', x: -34.0, y: 0.0, icon: '⚠️', description: '深入 坍界裂隙异象核心', targetX: 32.0, targetY: 0.0 },
      ];

      this.interactables = [
        {
          id: 'timber_tree_1',
          name: '高耸红松古木',
          type: 'tree',
          x: -6.0,
          y: -8.0,
          radius: 2.6,
          prompt: '[E/F 砍伐红松]',
          available: true,
          searchDuration: 1.6,
          lootTable: [{ itemId: 'wood', name: '优质红松木', count: 30 }],
        },
        {
          id: 'quarry_stone_1',
          name: '大型露天花岗岩矿床',
          type: 'boulder',
          x: 12.0,
          y: -10.0,
          radius: 2.8,
          prompt: '[E/F 镐击开采花岗岩]',
          available: true,
          searchDuration: 1.8,
          lootTable: [{ itemId: 'stone', name: '重装花岗石块', count: 40 }, { itemId: 'iron_ore', name: '伴生铁矿', count: 6 }],
        },
        {
          id: 'bulldozer_wreck',
          name: '重型采石推土机残骸',
          type: 'car',
          x: 8.0,
          y: 6.0,
          radius: 3.2,
          prompt: '[E/F 破拆重型工程机械]',
          available: true,
          searchDuration: 2.2,
          lootTable: [{ itemId: 'scrap', name: '耐磨特种锰钢板', count: 50 }, { itemId: 'part', name: '液压千斤顶活塞', count: 5 }],
        },
        {
          id: 'ammo_forest_box',
          name: '深林佣兵战术军火箱',
          type: 'ammo_crate',
          x: -14.0,
          y: -12.0,
          radius: 2.4,
          prompt: '[E/F 搜刮高爆物资]',
          available: true,
          searchDuration: 1.8,
          lootTable: [
            { itemId: 'c4_explosive', name: '高爆C4炸药', count: 3 },
            { itemId: 'thermite_charge', name: '微型铝热熔切弹', count: 4 },
          ],
        },
        // 新增：密林伐木场与采石点（营地不产物资，木/石来这里）
        {
          id: 'timber_tree_2',
          name: '伐木场云杉',
          type: 'tree',
          x: -2.0,
          y: 14.0,
          radius: 2.6,
          prompt: '[E/F 砍伐云杉]',
          available: true,
          searchDuration: 1.6,
          lootTable: [{ itemId: 'wood', name: '优质云杉木', count: 30 }],
        },
        {
          id: 'timber_tree_3',
          name: '林间枯立木',
          type: 'tree',
          x: 16.0,
          y: 2.0,
          radius: 2.6,
          prompt: '[E/F 砍伐枯木]',
          available: true,
          searchDuration: 1.6,
          lootTable: [{ itemId: 'wood', name: '干燥枯木', count: 30 }],
        },
        {
          id: 'quarry_stone_2',
          name: '次生采石场岩壁',
          type: 'boulder',
          x: 4.0,
          y: 16.0,
          radius: 2.8,
          prompt: '[E/F 开采石料]',
          available: true,
          searchDuration: 1.8,
          lootTable: [{ itemId: 'stone', name: '花岗石料', count: 40 }],
        },
        {
          id: 'logging_truck_wreck',
          name: '侧翻运材卡车',
          type: 'car',
          x: 0.0,
          y: -16.0,
          radius: 3.2,
          prompt: '[E/F 破拆运材车]',
          available: true,
          searchDuration: 2.0,
          lootTable: [
            { itemId: 'scrap', name: '车架废钢', count: 30 },
            { itemId: 'wood', name: '散落原木', count: 20 },
            { itemId: 'part', name: '传动轴齿轮', count: 3 },
          ],
        },
      ];

      // 佣兵秘密前哨拥有安全门
      this.buildings = [
        {
          id: 'wild_safe_gate_beta',
          type: 'safe_door',
          name: '深林佣兵前哨密封安全门 [5500HP 可突袭]',
          x: -16.0,
          y: 8.0,
          hp: 5500,
          maxHp: 5500,
          level: 2,
          isOpen: false,
          isLocked: true,
          ownerId: 'npc_forest_syndicate',
          ownerName: '深林佣兵兵团',
          mapId: 'forest',
          material: 'iron',
          storedLoot: [
            { name: '军用战术急救针剂', count: 12, icon: '💉' },
            { name: '坍界高纯晶石', count: 16, icon: '💎' },
            { name: '高聚合爆破炸药', count: 5, icon: '🧨' },
          ],
        },
        { id: 'forest_wall_1', type: 'stone_wall', name: '重条石防线', x: -14.0, y: 8.0, hp: 600, maxHp: 600, level: 1, ownerName: '佣兵哨卡' },
        { id: 'forest_wall_2', type: 'stone_wall', name: '重条石防线', x: -18.0, y: 8.0, hp: 600, maxHp: 600, level: 1, ownerName: '佣兵哨卡' },
      ];

      this.monsters = [
        { id: 'fm1', name: '密林蚀化狂暴巨熊', x: -10.0, y: -4.0, hp: 680, maxHp: 680, speed: 1.9, damage: 36, state: 'roam', animTime: 0, attackCooldown: 0 },
        { id: 'fm2', name: '密林暗影潜行兽', x: 6.0, y: -14.0, hp: 350, maxHp: 350, speed: 2.4, damage: 24, state: 'roam', animTime: 0.4, attackCooldown: 0 },
        { id: 'fm3', name: '蚀化幼体', x: 14.0, y: 12.0, hp: 260, maxHp: 260, speed: 2.3, damage: 16, state: 'roam', animTime: 0.8, attackCooldown: 0 },
      ];

    } else if (false) { // LEGACY rift_core
      // 5. 红区 · 坍界裂隙异象核心 (80x80 大地图，极度危险)
      this.mapWaypoints = [
        { targetMap: 'highway', name: '省道前线突围哨卡', x: 34.0, y: 0.0, icon: '🛣️', description: '撤离至 废弃省道公路', targetX: -32.0, targetY: 0.0 },
        { targetMap: 'sanctuary', name: '空间锚定紧急跃迁通道', x: 0.0, y: 34.0, icon: '⛺', description: '紧急跃迁撤回 恒界开拓营地安全区', targetX: 0.0, targetY: -32.0 },
      ];

      this.interactables = [
        {
          id: 'rift_anomaly_core',
          name: '坍界裂隙异象核心',
          type: 'crystal',
          x: 0.0,
          y: 0.0,
          radius: 3.5,
          prompt: '[E/F 提取异象原晶]',
          available: true,
          searchDuration: 2.5,
          lootTable: [
            { itemId: 'shard', name: '高纯度坍界紫晶', count: 6 },
            { itemId: 'plasma', name: '虚空高能等离子聚合体', count: 4 },
          ],
        },
        {
          id: 'rift_spire_1',
          name: '虚空晶簇矿脉',
          type: 'crystal',
          x: -12.0,
          y: -10.0,
          radius: 2.8,
          prompt: '[E/F 采掘紫晶簇]',
          available: true,
          searchDuration: 1.8,
          lootTable: [{ itemId: 'shard', name: '紫晶原矿', count: 4 }],
        },
        {
          id: 'void_titanium_cache',
          name: '遗落先锋钛合金密封宝箱',
          type: 'box',
          x: 12.0,
          y: 12.0,
          radius: 2.6,
          prompt: '[E/F 解锁高阶宝箱]',
          available: true,
          searchDuration: 2.2,
          lootTable: [
            { itemId: 'blueprint', name: '破界级等离子步枪蓝图', count: 1 },
            { itemId: 'dark_core', name: '坍界暗物质晶核', count: 12 },
            { itemId: 'credits', name: '高级信用凭证', count: 2500 },
            { itemId: 'rifle', name: '战术突击步枪', count: 1 },
            { itemId: 'vest', name: '军用防弹背心', count: 1 },
          ],
        },
      ];

      this.monsters = [
        { id: 'rm1', name: '深渊霸主·恶瘴巨兽 (领主BOSS)', x: 0.0, y: -6.0, hp: 1600, maxHp: 1600, speed: 2.3, damage: 45, state: 'roam', animTime: 0, attackCooldown: 0 },
        { id: 'rm2', name: '多足蚀化潜行兽', x: -14.0, y: 8.0, hp: 480, maxHp: 480, speed: 2.5, damage: 28, state: 'roam', animTime: 0.2, attackCooldown: 0 },
        { id: 'rm3', name: '多足蚀化潜行兽', x: 14.0, y: -8.0, hp: 480, maxHp: 480, speed: 2.5, damage: 28, state: 'roam', animTime: 0.5, attackCooldown: 0 },
        { id: 'rm4', name: '虚空撕裂幼体', x: -8.0, y: -16.0, hp: 320, maxHp: 320, speed: 2.6, damage: 20, state: 'roam', animTime: 0.7, attackCooldown: 0 },
      ];
    }

    // 资源节点储量初始化（采集上限：采空后按 respawnSec 恢复）
    const STOCK_CFG: Record<string, { stock: number; respawn: number }> = {
      tree: { stock: 6, respawn: 75 },
      boulder: { stock: 6, respawn: 75 },
      scrap: { stock: 4, respawn: 90 },
      car: { stock: 4, respawn: 90 },
      van: { stock: 4, respawn: 120 },
      shelves: { stock: 3, respawn: 120 },
      med_cabinet: { stock: 3, respawn: 150 },
      ammo_crate: { stock: 3, respawn: 150 },
      box: { stock: 3, respawn: 120 },
      pond: { stock: 5, respawn: 45 },
      crystal: { stock: 4, respawn: 240 },
    };
    this.interactables.forEach((it) => {
      const cfg = STOCK_CFG[it.type];
      if (cfg) {
        it.stock = cfg.stock;
        it.maxStock = cfg.stock;
        it.respawnSec = cfg.respawn;
        it.respawnAt = 0;
      } else {
        it.stock = Infinity;
        it.maxStock = Infinity;
      }
    });
  }

  private initWeather() {
    this.rainDrops = [];
    for (let i = 0; i < this.rainCount; i++) {
      this.rainDrops.push({
        x: Math.random() * 2400,
        y: Math.random() * 1400,
        speed: 14 + Math.random() * 6,
        len: 16 + Math.random() * 10,
      });
    }

    this.fogOffsets = [];
    for (let i = 0; i < 6; i++) {
      this.fogOffsets.push({
        x: Math.random() * 1600,
        y: Math.random() * 900,
        speed: 15 + Math.random() * 20,
        radius: 180 + Math.random() * 120,
      });
    }
  }

  public setWeather(newWeather: WeatherType, durationLeft: number = WEATHER_DURATION) {
    this.currentWeather = newWeather;
    this.weatherDurationLeft = Math.max(0, durationLeft);
    this.weatherDeadline = Date.now() + this.weatherDurationLeft * 1000;
    const weatherData = this.getWeatherInfo(newWeather);
    this.callbacks.onWeatherChange(weatherData);

    if (newWeather === 'thunder') {
      this.triggerLightning();
    }
  }

  public cycleNextWeather() {
    const list: WeatherType[] = ['rain', 'thunder', 'fog', 'clear', 'acid_rain'];
    const nextIdx = (list.indexOf(this.currentWeather) + 1) % list.length;
    this.setWeather(list[nextIdx]);
  }

  public getWeatherInfo(type: WeatherType): WeatherState {
    return weatherInfo(type, this.weatherDurationLeft);
  }

  private triggerLightning() {
    this.lightningFlash = 1.0;
    soundManager.playThunder();
  }

  public resize() {
    this.width = this.canvas.parentElement?.clientWidth || window.innerWidth;
    this.height = this.canvas.parentElement?.clientHeight || window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  public clearKeys() {
    this.keys = {};
    this.virtualJoystick = { x: 0, y: 0 };
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.isFiring = false;
    this.mouse.isDown = false;
  }

  private setupListeners() {
    const options = { signal: this.listenerController.signal };
    window.addEventListener('resize', () => this.resize(), options);

    // Window blur / focus safety - prevents keys getting permanently stuck on Alt-Tab or clicking out
    window.addEventListener('blur', () => {
      this.clearKeys();
    }, options);
    window.addEventListener('focus', () => {
      this.clearKeys();
    }, options);

    window.addEventListener('keydown', (e) => {
      if (this.inputBlocked) return;
      // If typing inside an input box or textarea, ignore game controls
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const key = e.key.toLowerCase();
      const code = e.code.toLowerCase();

      this.keys[key] = true;
      this.keys[code] = true;

      // Cancel click-to-move when physical keyboard directional keys are pressed
      if (['w', 'a', 's', 'd', 'keyw', 'keya', 'keys', 'keyd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key) ||
          ['w', 'a', 's', 'd', 'keyw', 'keya', 'keys', 'keyd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(code)) {
        this.targetMovePoint = null;
      }

      // 快捷栏 1-10（0 = 第10格，背包扩容后可用）
      if (['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].includes(e.key)) {
        this.activeSlot = e.key === '0' ? 10 : parseInt(e.key);
        soundManager.playClick();
      }

      if (key === 'r' || code === 'keyr') {
        if (this.editMode) {
          this.editorFacing = this.editorFacing === 'ew' ? 'ns' : 'ew';
          soundManager.playClick();
          this.addTextParticle(this.player.x, this.player.y - 1.5, `编辑朝向：${this.editorFacing === 'ew' ? '东西向' : '南北向'}`, '#c4b5fd');
        } else if (this.isBuildMode) {
          this.buildFacing = this.buildFacing === 'ew' ? 'ns' : 'ew';
          soundManager.playClick();
          this.addTextParticle(this.mouse.worldX, this.mouse.worldY - 1.0, `墙体朝向：${this.buildFacing === 'ew' ? '东西⟷' : '南北'}`, '#38bdf8');
        } else {
          this.reloadWeapon();
        }
      }

      if (key === 'f' || key === 'e' || code === 'keyf' || code === 'keye') {
        this.triggerInteraction();
      }

      if (key === 'b' || code === 'keyb') {
        this.isBuildMode = !this.isBuildMode;
        soundManager.playClick();
      }

      if (e.code === 'Space' && !this.player.isDashing && this.player.stamina >= 30) {
        this.performDash();
      }
    }, options);

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      const code = e.code.toLowerCase();
      this.keys[key] = false;
      this.keys[code] = false;
    }, options);

    // Right-click on ground to Click-to-Move (Auto-Pathing, 编辑器模式下右键改为删除)
    this.canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.editMode || this.inputBlocked) return;
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldPos = this.toWorld(screenX, screenY);

      this.navigateTo(worldPos.x, worldPos.y);
      soundManager.playClick();
      this.addTextParticle(worldPos.x, worldPos.y - 0.6, '📍 跑动指令', '#38bdf8');
    }, options);

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.screenX = e.clientX - rect.left;
      this.mouse.screenY = e.clientY - rect.top;
      const worldPos = this.toWorld(this.mouse.screenX, this.mouse.screenY);
      this.mouse.worldX = worldPos.x;
      this.mouse.worldY = worldPos.y;
    }, options);

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.inputBlocked) return;
      // 地图编辑器模式：左键放置 / 右键删除
      if (this.editMode) {
        const rect = this.canvas.getBoundingClientRect();
        const worldPos = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
        if (e.button === 0) {
          if (this.editorPaletteKind === 'building') this.editorPlaceBuilding(this.editorBuilding, worldPos.x, worldPos.y);
          else this.editorPlace(worldPos.x, worldPos.y);
        } else if (e.button === 2) this.editorRemoveNearest(worldPos.x, worldPos.y);
        return;
      }
      if (e.button === 0) {
        if (this.isBuildMode) {
          this.tryPlaceBuilding();
          return;
        }
        this.mouse.isDown = true;
        this.player.isFiring = true;
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.screenX = e.clientX - rect.left;
        this.mouse.screenY = e.clientY - rect.top;
        const origin = this.toScreen(this.player.x, this.player.y);
        this.player.angle = Math.atan2(this.mouse.screenY - origin.y, this.mouse.screenX - origin.x);
        try {
          this.tryFireRangedWeapon(performance.now());
        } catch (error) {
          this.clearKeys();
          recordRenderFailure(error, { source: 'input', phase: 'fire', mapId: this.currentMapId, x: this.player.x, y: this.player.y });
          console.error('[game input]', error);
          this.setRenderStatus('射击操作发生错误，错误信息已保留');
        }
      }
    }, options);

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouse.isDown = false;
        this.player.isFiring = false;
      }
    }, options);
  }

  public toScreen(wx: number, wy: number): { x: number; y: number } {
    const sx = (wx - wy) * (this.TILE_W / 2) + this.camera.x + this.width / 2;
    const sy = (wx + wy) * (this.TILE_H / 2) + this.camera.y + this.height / 2;
    return { x: sx, y: sy };
  }

  public toWorld(sx: number, sy: number): { x: number; y: number } {
    const relX = sx - this.camera.x - this.width / 2;
    const relY = sy - this.camera.y - this.height / 2;
    const wx = relX / this.TILE_W + relY / this.TILE_H;
    const wy = relY / this.TILE_H - relX / this.TILE_W;
    return { x: wx, y: wy };
  }

  public applyPvpHit(damage: number, attackerName: string) {
    const now = this.gameTime;
    if (now < this.invulnUntil) return;
    const reduced = Math.max(1, Math.floor(damage * (1 - this.armorReduction)));
    if (this.player.shield > 0) {
      const soaked = Math.min(this.player.shield, reduced);
      this.player.shield -= soaked;
      this.player.hp -= (reduced - soaked);
    } else {
      this.player.hp -= reduced;
    }
    this.hurtFlash = 0.6;
    this.shake = Math.min(8, this.shake + 4);
    this.shieldRegenAt = now + 5;
    this.addTextParticle(this.player.x, this.player.y - 1.6, `-${reduced}! 来自 ${attackerName}`, '#f87171');
    if (this.player.hp <= 0) {
      this.player.hp = this.player.maxHp;
      this.player.shield = this.player.maxShield;
      this.callbacks.onPlayerDeathDrop?.(this.currentMapId);
      this.warpToMap('camp_plaza', 0, 9, '被击倒·营地苏醒');
      this.addTextParticle(0, 8, '你被敌对玩家击倒，已在营地苏醒（物品保留）', '#facc15');
    }
  }

  public setAuthoritativeAmmo(total: number) {
    this.player.ammo = Math.max(0, Math.min(this.player.ammo, this.player.maxAmmo, total));
    this.player.reserveAmmo = total - this.player.ammo;
  }

  public reloadWeapon() {
    if (this.player.ammo < this.player.maxAmmo && this.player.reserveAmmo > 0) {
      soundManager.playReload();
      const needed = this.player.maxAmmo - this.player.ammo;
      const amount = Math.min(needed, this.player.reserveAmmo);
      this.player.ammo += amount;
      this.player.reserveAmmo -= amount;
      this.addTextParticle(this.player.x, this.player.y - 1.2, 'RELOADED', '#38bdf8');
    }
  }

  public performDash() {
    this.player.isDashing = true;
    this.player.dashTimer = 0.22;
    this.player.stamina -= 30;
    this.invulnUntil = this.gameTime + 0.22;
    for (let i = 0; i < 6; i++) {
      this.particles.push({
        x: this.player.x + (Math.random() - 0.5) * 0.4,
        y: this.player.y + (Math.random() - 0.5) * 0.4,
        vx: 0,
        vy: 0,
        life: 0.3,
        maxLife: 0.3,
        color: 'rgba(56, 189, 248, 0.4)',
        size: 16,
        type: 'smoke',
      });
    }
  }

  public tryPlaceBuilding() {
    const placeX = Math.round(this.mouse.worldX);
    const placeY = Math.round(this.mouse.worldY);

    if (this.callbacks.onGameAction) {
      this.callbacks.onGameAction('build', { buildType: this.selectedBuildType, x: placeX, y: placeY, facing: this.buildFacing });
      return;
    }

    const distToPlayer = Math.hypot(this.player.x - placeX, this.player.y - placeY);
    if (distToPlayer > 4.5) {
      this.addTextParticle(placeX, placeY - 0.5, '距离过远 (需身周 4.5 格以内)', '#ef4444');
      return;
    }

    const costs: { [key: string]: { wood: number; stone: number; scrap: number; parts: number; hp: number; name: string } } = {
      wood_floor: { wood: 4, stone: 0, scrap: 0, parts: 0, hp: 300, name: '原木板材地板' },
      stone_floor: { wood: 0, stone: 6, scrap: 0, parts: 0, hp: 550, name: '石质防爆地砖' },
      iron_floor: { wood: 0, stone: 0, scrap: 6, parts: 0, hp: 800, name: '铁制网纹格栅' },
      wood_wall: { wood: 6, stone: 0, scrap: 0, parts: 0, hp: 350, name: '加固原木围墙' },
      stone_wall: { wood: 0, stone: 8, scrap: 0, parts: 0, hp: 600, name: '厚重条石防护墙' },
      iron_wall: { wood: 0, stone: 0, scrap: 6, parts: 0, hp: 850, name: '战术重合金铁墙' },
      glass_wall: { wood: 0, stone: 0, scrap: 5, parts: 1, hp: 400, name: '钢化玻璃观察墙' },
      door: { wood: 4, stone: 0, scrap: 4, parts: 1, hp: 650, name: '自动防卫电控门' },
      safe_door: { wood: 0, stone: 10, scrap: 20, parts: 4, hp: 5000, name: '高耐久重装防爆安全门' },
      storage_box: { wood: 8, stone: 0, scrap: 2, parts: 0, hp: 400, name: '战术领地储物箱' },
      workbench: { wood: 10, stone: 5, scrap: 4, parts: 1, hp: 500, name: '机械工程工作台' },
      electric_core: { wood: 0, stone: 0, scrap: 12, parts: 2, hp: 600, name: '电磁防卫核心' },
      flame_core: { wood: 0, stone: 0, scrap: 12, parts: 2, hp: 600, name: '聚能烈焰燃芯' },
      turret: { wood: 0, stone: 0, scrap: 15, parts: 2, hp: 750, name: '自律防御电击塔' },
      spikes: { wood: 6, stone: 0, scrap: 2, parts: 0, hp: 300, name: '拒马铁刺陷阱' },
      anchor_core: { wood: 0, stone: 20, scrap: 20, parts: 3, hp: 1200, name: '坍界下锚核心' },
    };

    const costInfo = costs[this.selectedBuildType] || costs.iron_wall;
    const canAfford = this.callbacks.onBuildingPlaced(
      this.selectedBuildType,
      costInfo.wood,
      costInfo.stone,
      costInfo.scrap,
      costInfo.parts
    );

    if (!canAfford) {
      this.addTextParticle(placeX, placeY - 0.5, '建造材料不足', '#ef4444');
      return;
    }

    // 1. If it's a Floor type, register to placedFloors
    if (this.selectedBuildType.endsWith('_floor')) {
      const floorType = this.selectedBuildType as 'wood_floor' | 'stone_floor' | 'iron_floor';
      this.placedFloors.set(`${placeX},${placeY}`, {
        x: placeX,
        y: placeY,
        type: floorType,
      });
      soundManager.playCraft();
      this.addTextParticle(placeX, placeY - 0.8, `铺设成功: ${costInfo.name}`, '#f59e0b');
      return;
    }

    // 2. Otherwise add to interactive buildings
    const newBuilding: BuildingEntity = {
      id: `b_${Date.now()}`,
      type: this.selectedBuildType as any,
      name: costInfo.name,
      x: placeX,
      y: placeY,
      hp: costInfo.hp,
      maxHp: costInfo.hp,
      level: 1,
      isOpen: false,
      isLocked: true,
      ownerId: this.localPlayerId,
      ownerName: '我方先锋领地',
      mapId: this.currentMapId,
      fireCooldown: 0,
      facing: this.buildFacing,
    };

    this.buildings.push(newBuilding);
    const sb = ((this as any)._serverBuildings ?? []) as import('../types/game').BuildingEntity[];
    sb.push({ ...newBuilding });
    (this as any)._serverBuildings = sb;
    soundManager.playCraft();
    this.addTextParticle(placeX, placeY - 1.0, `建造成功: ${costInfo.name}`, '#10b981');
  }

  private campInteractionIsNearest(): boolean {
    const distance = (target: { x: number; y: number }) => Math.hypot(this.player.x - target.x, this.player.y - target.y);
    const portalDistance = this.currentMapId === 'world'
      ? Math.min(Infinity, ...this.campEntrances.map(distance))
      : distance(campExitPosition(this.campSize));
    const target = this.nearestBuilding ?? this.nearestInteractable;
    return portalDistance <= 3 && portalDistance <= (target ? distance(target) : Infinity);
  }

  private isRaidTarget(building: BuildingEntity): boolean {
    return building.hp > 0 && !building.type.endsWith('_floor') && !!building.ownerId && building.ownerId !== this.localPlayerId && !this.friendlyPlayerIds.has(building.ownerId);
  }

  public triggerInteraction() {
    if (this.callbacks.onGameAction) {
      if (this.campInteractionIsNearest() && this.callbacks.onCampInteract?.()) return;
      const b = this.nearestBuilding;
      if (b && hasLineOfSight(this.player, b, this.buildings, b.id)) {
        if (this.isRaidTarget(b)) {
          this.callbacks.onOpenRaidModal?.(b); return;
        }
        if (b.hp <= 0 || b.type.includes('wall') || ['campfire', 'bed', 'furnace', 'farm_plot', 'research_table'].includes(b.type)) {
          this.callbacks.onOpenStorageBox(b); return;
        }
        if (b.type === 'door' || b.type === 'safe_door') {
          this.callbacks.onGameAction('toggle_door', { targetId: b.id });
          return;
        }
        if (b.type === 'storage_box' || b.type === 'turret' || b.type === 'anchor_core') {
          this.callbacks.onOpenStorageBox(b);
          return;
        }
        if (b.type === 'workbench') { this.callbacks.onOpenWorkbench(); return; }
        if (b.ownerId && b.ownerId !== this.localPlayerId && String(this.currentMapId).startsWith('home_')) {
          this.callbacks.onOpenRaidModal?.(b); return;
        }
      }
      const it = this.nearestInteractable;
      if (!it || !hasLineOfSight(this.player, it, this.buildings) || this.gatherCooldown > 0 || this.isLooting) return;
      if (it.type === 'workbench') { this.callbacks.onOpenWorkbench(); return; }
      if ((it.stock ?? 1) <= 0) { this.gatherCooldown = 0.8; this.addTextParticle(it.x, it.y, '已采空，稍后再来', '#f59e0b'); return; }
      this.isLooting = true;
      this.lootTarget = it;
      this.lootingTimer = it.searchDuration ?? 1.2;
      return;
    }
    // Inter-map Waypoint Fast Travel on [F]
    const closeWp = this.mapWaypoints.find((w) => Math.hypot(this.player.x - w.x, this.player.y - w.y) < 3.0);
    if (closeWp) {
      this.warpToMap(closeWp.targetMap, closeWp.targetX, closeWp.targetY, closeWp.name);
      return;
    }

    if (this.nearestBuilding) {
      if (this.nearestBuilding.type === 'door') {
        if (this.nearestBuilding.ownerId && this.nearestBuilding.ownerId !== this.localPlayerId && !isHostile(this.localPlayerId, this.nearestBuilding.ownerId, this.currentMapId)) {
          this.addTextParticle(this.nearestBuilding.x, this.nearestBuilding.y - 1.0, '中立建筑，无需破拆', '#94a3b8');
          return;
        }
        if (this.nearestBuilding.ownerId && this.nearestBuilding.ownerId !== this.localPlayerId && isHostile(this.localPlayerId, this.nearestBuilding.ownerId, this.currentMapId)) {
          soundManager.playClick();
          this.callbacks.onOpenRaidModal?.(this.nearestBuilding);
          return;
        }
        this.nearestBuilding.isOpen = !this.nearestBuilding.isOpen;
        soundManager.playClick();
        this.addTextParticle(
          this.nearestBuilding.x,
          this.nearestBuilding.y - 1.0,
          this.nearestBuilding.isOpen ? '防卫门 已开启' : '防卫门 已闭锁',
          '#38bdf8'
        );
        return;
      }
      if (this.nearestBuilding.type === 'safe_door') {
        const isOwner = canOperateDoor(this.localPlayerId, { ownerId: this.nearestBuilding.ownerId, type: 'safe_door' });
        if (isOwner) {
          this.nearestBuilding.isOpen = !this.nearestBuilding.isOpen;
          this.nearestBuilding.isLocked = !this.nearestBuilding.isOpen;
          soundManager.playClick();
          this.addTextParticle(
            this.nearestBuilding.x,
            this.nearestBuilding.y - 1.0,
            this.nearestBuilding.isOpen ? '领地安全门 [已开启]' : '领地安全门 [已加固闭锁]',
            '#10b981'
          );
        } else {
          // Enemy or wild outpost safe door -> open Raid/Breach UI!
          soundManager.playClick();
          this.callbacks.onOpenRaidModal?.(this.nearestBuilding);
        }
        return;
      }
      if (this.nearestBuilding.type === 'storage_box') {
        soundManager.playLoot();
        this.callbacks.onOpenStorageBox(this.nearestBuilding);
        return;
      }
    }

    if (!this.nearestInteractable) return;

    if (this.nearestInteractable.type === 'workbench') {
      soundManager.playClick();
      this.callbacks.onOpenWorkbench();
      return;
    }

    const it = this.nearestInteractable;
    // 采集上限：采空的节点要等恢复
    if ((it.stock ?? 1) <= 0) {
      const left = Math.max(1, Math.ceil((it.respawnAt ?? 0) - this.gameTime));
      this.addTextParticle(this.player.x, this.player.y - 1.2, `资源枯竭，${left}s后恢复…换个点吧`, '#f87171');
      soundManager.playClick();
      return;
    }

    if (it.type === 'pond') {
      if (this.gatherCooldown > 0) return;
      if (this.player.stamina < 4) {
        this.addTextParticle(this.player.x, this.player.y - 1.2, '太累了！吃点东西或歇会…', '#facc15');
        return;
      }
      this.gatherCooldown = 0.9;
      this.player.stamina -= 4;
      // 钓竿：一次两条（星露谷式工具分化）
      const fishN = this.toolKind === 'rod' ? 2 : 1;
      soundManager.playSplash();
      this.addTextParticle(this.player.x, this.player.y - 1.2, `🎣 钓获: 异变青鱼 ×${fishN}（进背包，饿了记得吃）`, '#38bdf8');
      this.callbacks.onLootFound('异变青鱼', fishN, 'food');
      this.consumeStock(it);
      return;
    }

    if (it.type === 'tree') {
      if (this.gatherCooldown > 0) return;
      if (this.player.stamina < 4) {
        this.addTextParticle(this.player.x, this.player.y - 1.2, '太累了！吃点东西或歇会…', '#facc15');
        return;
      }
      this.gatherCooldown = 0.9;
      this.player.stamina -= 4;
      // 石斧砍树 +60%，伐木技能再加成
      const yieldCount = Math.max(1, Math.round(6 * (this.toolKind === 'axe' ? 1.6 : 1) * this.skillWood));
      soundManager.playCraft();
      this.addTextParticle(this.player.x, this.player.y - 1.2, `🪓 伐木: 优质原木 ×${yieldCount}`, '#10b981');
      this.callbacks.onLootFound('优质原木', yieldCount, 'wood');
      this.consumeStock(it);
      return;
    }

    if (it.type === 'boulder') {
      if (this.gatherCooldown > 0) return;
      if (this.player.stamina < 4) {
        this.addTextParticle(this.player.x, this.player.y - 1.2, '太累了！吃点东西或歇会…', '#facc15');
        return;
      }
      this.gatherCooldown = 0.9;
      this.player.stamina -= 4;
      // 矿镐采石 +60%，采矿技能再加成
      const yieldCount = Math.max(1, Math.round(5 * (this.toolKind === 'pick' ? 1.6 : 1) * this.skillStone));
      soundManager.playCraft();
      this.addTextParticle(this.player.x, this.player.y - 1.2, `⛏️ 采石: 坚固条石 ×${yieldCount}`, '#94a3b8');
      this.callbacks.onLootFound('坚固条石', yieldCount, 'stone');
      this.consumeStock(it);
      return;
    }

    // 读条搜刮：废品/车辆/货架/医疗/弹药/箱子（按各自 searchDuration）
    if (it.lootTable) {
      if (this.isLooting) return;
      this.isLooting = true;
      this.lootTarget = it;
      this.lootingTimer = it.searchDuration ?? 1.0;
      soundManager.playLoot();
    }
  }

  // 扣储量：采空则记恢复时间点
  public consumeStock(it: InteractableEntity, n: number = 1) {
    if (!isFinite(it.stock ?? 1)) return;
    it.stock = Math.max(0, (it.stock ?? 1) - n);
    if (it.stock <= 0) {
      it.respawnAt = this.gameTime + (it.respawnSec ?? 90);
    }
  }

  // ===== 地图编辑器 =====
  public editMode: boolean = false;
  public editorPalette: InteractableEntity['type'] = 'tree';
  public editorPaletteKind: 'item' | 'building' = 'item';
  public editorBuilding: string = 'iron_wall';

  public setEditMode(on: boolean) {
    this.editMode = on;
    this.player.isFiring = false;
    this.mouse.isDown = false;
    this.clearKeys();
  }

  private editorDefaultLoot(type: InteractableEntity['type']): InteractableEntity['lootTable'] {
    switch (type) {
      case 'tree': return [{ itemId: 'wood', name: '优质原木', count: 30 }];
      case 'boulder': return [{ itemId: 'stone', name: '花岗石料', count: 40 }];
      case 'scrap': return [{ itemId: 'scrap', name: '废铁', count: 25 }];
      case 'car': case 'van':
        return [{ itemId: 'scrap', name: '车辆废铁', count: 35 }, { itemId: 'part', name: '机械零件', count: 3 }];
      case 'shelves': return [{ itemId: 'food', name: '干粮', count: 8 }];
      case 'med_cabinet': return [{ itemId: 'bandage', name: '绷带', count: 3 }];
      case 'ammo_crate': return [{ itemId: 'ammo', name: '步枪弹药', count: 30 }];
      case 'box': return [{ itemId: 'scrap', name: '箱中废料', count: 15 }];
      case 'pond': return [{ itemId: 'fish', name: '异变青鱼', count: 2 }];
      case 'crystal': return [{ itemId: 'shard', name: '紫晶原矿', count: 4 }];
      default: return undefined;
    }
  }

  public editorPlace(wx: number, wy: number): InteractableEntity {
    const type = this.editorPalette;
    const names: Record<string, string> = {
      tree: '编辑器·树木', boulder: '编辑器·岩石', scrap: '编辑器·废品堆',
      car: '编辑器·车辆残骸', van: '编辑器·货车残骸', shelves: '编辑器·货架',
      med_cabinet: '编辑器·医疗柜', ammo_crate: '编辑器·弹药箱', box: '编辑器·箱子',
      workbench: '编辑器·工作台', campfire: '编辑器·篝火', pond: '编辑器·钓点',
      crystal: '编辑器·晶簇',
    };
    const it: InteractableEntity = {
      id: `ed_${Date.now().toString(36)}_${Math.floor(Math.random() * 999)}`,
      name: names[type] ?? '编辑器·物件',
      type,
      x: Math.round(wx),
      y: Math.round(wy),
      radius: 2.8,
      prompt: '[E/F 采集]',
      available: true,
      searchDuration: 1.6,
      lootTable: this.editorDefaultLoot(type),
      stock: type === 'workbench' || type === 'campfire' ? Infinity : 5,
      maxStock: type === 'workbench' || type === 'campfire' ? Infinity : 5,
      respawnSec: 90,
      respawnAt: 0,
    };
    this.interactables.push(it);
    this.persistEditorMap();
    soundManager.playClick();
    this.addTextParticle(it.x, it.y - 1.2, `已放置：${it.name}`, '#4ade80');
    return it;
  }

  public editorRemoveNearest(wx: number, wy: number): boolean {
    let bestItem: InteractableEntity | null = null;
    let bestD = 2.5;
    for (const it of this.interactables) {
      const d = Math.hypot(it.x - wx, it.y - wy);
      if (d < bestD) { bestD = d; bestItem = it; }
    }
    let bestB: BuildingEntity | null = null;
    let bestBd = 2.0;
    for (const b of this.buildings) {
      const d = Math.hypot(b.x - wx, b.y - wy);
      if (d < bestBd) { bestBd = d; bestB = b; }
    }
    if (bestB && (!bestItem || bestBd <= bestD)) {
      this.buildings = this.buildings.filter((x) => x.id !== bestB!.id);
      this.persistEditorMap();
      soundManager.playClick();
      this.addTextParticle(wx, wy - 1.2, `已删除建筑：${bestB.name}`, '#f87171');
      return true;
    }
    if (!bestItem) return false;
    this.interactables = this.interactables.filter((i) => i.id !== bestItem!.id);
    this.persistEditorMap();
    soundManager.playClick();
    this.addTextParticle(wx, wy - 1.2, `已删除：${bestItem.name}`, '#f87171');
    return true;
  }

  // 编辑器放置建筑（墙/门/箱/塔/陷阱，箱子自带物资包）
  public editorPlaceBuilding(type: string, wx: number, wy: number): BuildingEntity {
    const specs: Record<string, { hp: number; name: string }> = {
      wood_wall: { hp: 350, name: '编辑器·原木围墙' },
      stone_wall: { hp: 600, name: '编辑器·条石墙' },
      iron_wall: { hp: 850, name: '编辑器·合金墙' },
      glass_wall: { hp: 400, name: '编辑器·观察墙' },
      door: { hp: 650, name: '编辑器·电控门' },
      safe_door: { hp: 5000, name: '编辑器·防爆安全门' },
      storage_box: { hp: 400, name: '编辑器·储物箱' },
      turret: { hp: 750, name: '编辑器·防卫塔' },
      spikes: { hp: 300, name: '编辑器·铁刺陷阱' },
    };
    const spec = specs[type] ?? { hp: 500, name: '编辑器·建筑' };
    const b: BuildingEntity = {
      id: `edb_${Date.now().toString(36)}_${Math.floor(Math.random() * 999)}`,
      type: type as BuildingEntity['type'],
      name: spec.name,
      x: Math.round(wx),
      y: Math.round(wy),
      hp: spec.hp,
      maxHp: spec.hp,
      level: 1,
      ownerId: 'gm_author',
      ownerName: '地图作者',
      facing: this.editorFacing,
    };
    if (type === 'safe_door') {
      b.isOpen = false;
      b.isLocked = true;
      b.material = 'iron';
      b.storedLoot = [
        { name: '坍界高纯晶石', count: 10, icon: '💎' },
        { name: '高聚合爆破装药', count: 2, icon: '💣' },
        { name: '战备信用凭证', count: 1500, icon: '💰' },
      ];
    }
    if (type === 'storage_box') {
      b.storedLoot = [
        { name: '优质特种合金废铁', count: 20, icon: '⚙️' },
        { name: '纳米急救医疗箱', count: 1, icon: '💉' },
        { name: '战术能量合剂', count: 4, icon: '🥩' },
      ];
    }
    if (type === 'door') {
      b.isOpen = false;
      b.isLocked = false;
    }
    this.buildings.push(b);
    this.persistEditorMap();
    soundManager.playClick();
    this.addTextParticle(b.x, b.y - 1.2, `已放置：${b.name}`, '#4ade80');
    return b;
  }

  public editorOverrideKey() {
    return 'sdc_map_override_' + this.currentMapId;
  }

  public persistEditorMap() {
    try {
      localStorage.setItem(this.editorOverrideKey(), JSON.stringify({
        interactables: this.interactables,
        buildings: this.buildings,
        savedAt: Date.now(),
      }));
    } catch { /* ignore */ }
  }

  public editorHasOverride(): boolean {
    try {
      return !!localStorage.getItem(this.editorOverrideKey());
    } catch {
      return false;
    }
  }

  public editorClearOverride() {
    try {
      localStorage.removeItem(this.editorOverrideKey());
    } catch { /* ignore */ }
    this.initEntitiesForMap(this.currentMapId);
  }

  public editorExport(): string {
    return JSON.stringify({ mapId: this.currentMapId, interactables: this.interactables, buildings: this.buildings }, null, 2);
  }

  public editorImportJson(json: string): boolean {
    try {
      const o = JSON.parse(json) as { interactables?: InteractableEntity[]; buildings?: BuildingEntity[] };
      if (!Array.isArray(o.interactables)) return false;
      this.interactables = o.interactables;
      if (Array.isArray(o.buildings)) this.buildings = o.buildings;
      this.persistEditorMap();
      return true;
    } catch {
      return false;
    }
  }

  private setRenderStatus(message: string | null) {
    if (this.renderStatus === message) return;
    this.renderStatus = message;
    this.callbacks.onRenderStatus?.(message);
  }

  private clearWallImages() {
    for (const image of this.wallImages.values()) image.width = image.height = 0;
    this.wallImages.clear();
  }

  private resetGraphics() {
    this.clearWallImages();
    for (const patch of this.tilePatchCache.values()) patch.width = patch.height = 0;
    this.tilePatchCache.clear();
    if (this.tilePatchScratch) this.tilePatchScratch.width = this.tilePatchScratch.height = 0;
    this.tilePatchScratch = null;
    this.tilePatchCells = new WeakMap();
    this.groundTileChanges.clear();
    if (this.groundCache) {
      this.groundCache.canvas.width = this.groundCache.canvas.height = 0;
      if (this.groundCache.overlay) this.groundCache.overlay.width = this.groundCache.overlay.height = 0;
    }
    this.groundCache = null;
    this.canvas.width = Math.max(1, this.width);
    this.canvas.height = Math.max(1, this.height);
    this.ctx = this.canvas.getContext('2d')!;
  }

  public start() {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastTime = performance.now();
    this.lastRenderTime = this.lastTime;
    const frameInterval = 1000 / 60;
    const loop = (time: number) => {
      if (!this.running) return;
      // Schedule before any game work: a failed frame must not kill the loop.
      this.animFrameId = requestAnimationFrame(loop);
      const dt = Math.min((time - this.lastTime) / 1000, 0.1);
      this.lastTime = time;
      if (!document.hidden && !this.contextLost && time >= this.renderRetryAt) {
        let phase = 'update';
        try {
          this.update(dt);
          const elapsed = time - this.lastRenderTime;
          if (elapsed >= frameInterval) {
            phase = 'render';
            this.lastRenderTime = time - (elapsed % frameInterval);
            this.render();
            this.setRenderStatus(null);
          }
        } catch (error) {
          recordRenderFailure(error, {
            source: 'frame', phase, mapId: this.currentMapId, x: this.player.x, y: this.player.y,
            interaction: this.lootTarget ? { id: this.lootTarget.id, type: this.lootTarget.type, stock: this.lootTarget.stock, progress: this.lootProgress } : null,
          });
          console.error('[game frame]', error);
          this.setRenderStatus('画面发生错误，正在重新绘制');
          this.renderRetryAt = time + 500;
          this.resetGraphics();
        }
      } else {
        this.lastRenderTime = time;
      }
    };
    this.animFrameId = requestAnimationFrame(loop);
  }

  public stop() {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = 0;
    }
  }

  public dispose() {
    this.stop();
    this.clearWallImages();
    this.disposed = true;
    this.listenerController.abort();
    this.clearKeys();
    for (const patch of this.tilePatchCache.values()) patch.width = patch.height = 0;
    this.tilePatchCache.clear();
    if (this.tilePatchScratch) this.tilePatchScratch.width = this.tilePatchScratch.height = 0;
    this.tilePatchScratch = null;
    this.tilePatchCells = new WeakMap();
    this.groundTileChanges.clear();
    this.artImages.clear();
    this.worldChunks.clear();
    this.worldScenery = [];
    this.sceneryCache = new WeakMap();
    this.monsterTargets.clear();
    if (this.groundCache) {
      this.groundCache.canvas.width = this.groundCache.canvas.height = 0;
      if (this.groundCache.overlay) this.groundCache.overlay.width = this.groundCache.overlay.height = 0;
    }
    this.groundCache = null;
  }

  // --- UPDATE LOOP ---
  private update(dt: number) {
    this.gameTime += dt;
    this.refreshWorld();

    // Weather timer
    const previousWeatherSecond = Math.ceil(this.weatherDurationLeft);
    this.weatherDurationLeft = Math.max(0, this.callbacks.onGameAction ? (this.weatherDeadline - Date.now()) / 1000 : this.weatherDurationLeft - dt);
    if (this.weatherDurationLeft <= 0 && !this.callbacks.onGameAction) {
      this.cycleNextWeather();
    } else if (Math.ceil(this.weatherDurationLeft) !== previousWeatherSecond) {
      this.callbacks.onWeatherChange(this.getWeatherInfo(this.currentWeather));
    }

    if (this.currentWeather === 'thunder') {
      this.nextLightningTime -= dt;
      if (this.nextLightningTime <= 0) {
        this.nextLightningTime = 7 + Math.random() * 8;
        this.triggerLightning();
      }
    }

    if (this.lightningFlash > 0) {
      this.lightningFlash = Math.max(0, this.lightningFlash - 2.5 * dt);
    }

    // Fog banks
    this.fogOffsets.forEach((fog) => {
      fog.x += fog.speed * dt;
      if (fog.x > this.width + 300) {
        fog.x = -300;
        fog.y = Math.random() * this.height;
      }
    });

    // Player 8-direction screen-relative movement (W: Up, S: Down, A: Left, D: Right)
    let screenDirX = 0;
    let screenDirY = 0;

    const isUp = Boolean(this.keys['w'] || this.keys['keyw'] || this.keys['arrowup']);
    const isDown = Boolean(this.keys['s'] || this.keys['keys'] || this.keys['arrowdown']);
    const isLeft = Boolean(this.keys['a'] || this.keys['keya'] || this.keys['arrowleft']);
    const isRight = Boolean(this.keys['d'] || this.keys['keyd'] || this.keys['arrowright']);

    if (isUp) screenDirY -= 1;
    if (isDown) screenDirY += 1;
    if (isLeft) screenDirX -= 1;
    if (isRight) screenDirX += 1;

    // Support On-Screen Tactical D-Pad / Virtual Joystick
    if (this.virtualJoystick.x !== 0 || this.virtualJoystick.y !== 0) {
      screenDirX = this.virtualJoystick.x;
      screenDirY = this.virtualJoystick.y;
      this.targetMovePoint = null;
    }

    let mx = 0;
    let my = 0;
    let pathDistance = Infinity;
    let pathPoint: { x: number; y: number } | null = null;

    if (screenDirX !== 0 || screenDirY !== 0) {
      // Physical keyboard or virtual joystick direction
      this.targetMovePoint = null;
      const sLen = Math.hypot(screenDirX, screenDirY);
      const normScreenX = screenDirX / sLen;
      const normScreenY = screenDirY / sLen;

      // Inverted isometric projection:
      // normScreenX moves along (TILE_W): dx = +1, dy = -1
      // normScreenY moves along (TILE_H): dx = +1, dy = +1
      mx = normScreenX * 0.5 + normScreenY;
      my = -normScreenX * 0.5 + normScreenY;

      const wLen = Math.hypot(mx, my);
      if (wLen > 0) {
        mx = mx / wLen;
        my = my / wLen;
      }
    } else if (this.targetMovePoint) {
      // Right-Click to Move Auto-Pathing
      if (this.movePath.length && Math.hypot(this.movePath[0].x - this.player.x, this.movePath[0].y - this.player.y) < 0.2) this.movePath.shift();
      const next = this.movePath[0] ?? this.targetMovePoint;
      pathPoint = next;
      const tdx = next.x - this.player.x;
      const tdy = next.y - this.player.y;
      const dist = Math.hypot(tdx, tdy);
      if (dist > 0.12) {
        mx = tdx / dist;
        my = tdy / dist;
        pathDistance = dist;
      } else {
        // Arrived at destination
        this.targetMovePoint = null;
      }
    }

    const len = Math.hypot(mx, my);
    const speed = this.player.isDashing ? this.player.speed * 2.2 : this.player.speed;
    if (len > 0) {
      this.player.vx = mx * speed;
      this.player.vy = my * speed;
      // Automatic movement stops at each point, then spends the remaining time on the next.
      let remainingTime = dt;
      do {
        const movementTime = Math.min(remainingTime, pathDistance / speed);
        const nextX = this.player.x + this.player.vx * movementTime;
        if (!isPositionBlocked(nextX, this.player.y, this.buildings)) this.player.x = nextX;
        const nextY = this.player.y + this.player.vy * movementTime;
        if (!isPositionBlocked(this.player.x, nextY, this.buildings)) this.player.y = nextY;
        remainingTime -= movementTime;
        if (!pathPoint || Math.hypot(this.player.x - pathPoint.x, this.player.y - pathPoint.y) > 1e-6 || !this.movePath.length) break;
        this.movePath.shift();
        const next = this.movePath[0];
        if (!next) break;
        pathPoint = next;
        const dx = next.x - this.player.x, dy = next.y - this.player.y;
        pathDistance = Math.hypot(dx, dy);
        this.player.vx = pathDistance ? dx / pathDistance * speed : 0;
        this.player.vy = pathDistance ? dy / pathDistance * speed : 0;
      } while (remainingTime > 1e-9);
    } else {
      this.player.vx = 0;
      this.player.vy = 0;
    }

    // Real Expansive Map Boundaries (-38.0 to +38.0, 80x80 large open world grid)
    const minBound = this.currentMapId === 'world' ? WORLD_MIN + 0.5 : -this.campSize / 2 + 0.5;
    const maxBound = this.currentMapId === 'world' ? WORLD_MAX - 0.5 : this.campSize / 2 - 0.5;
    this.player.x = Math.max(minBound, Math.min(maxBound, this.player.x));
    this.player.y = Math.max(minBound, Math.min(maxBound, this.player.y));

    // Walking across physical checkpoint gates & waypoint portals
    if (this.warpCooldown > 0) {
      this.warpCooldown -= dt;
    } else if (!this.callbacks.onGameAction) {
      // Walked directly into an outpost gateway portal trigger circle (radius 2.4)
      const nearWp = this.mapWaypoints.find((w) => Math.hypot(this.player.x - w.x, this.player.y - w.y) < 2.4);
      if (nearWp) {
        this.warpToMap(nearWp.targetMap, nearWp.targetX, nearWp.targetY, nearWp.name);
      }
    }

    // Zone banner countdown
    if (this.zoneTransitionBanner) {
      this.zoneTransitionBanner.timer -= dt;
      if (this.zoneTransitionBanner.timer <= 0) {
        this.zoneTransitionBanner = null;
      }
    }

    if (this.player.stamina < this.player.maxStamina) {
      const regenRate = this.player.satiety <= 0 ? 6 : 20;
      this.player.stamina = Math.min(this.player.maxStamina, this.player.stamina + regenRate * dt);
    }

    // 护盾延迟回复：脱战5s后每秒回8点，酸雨天不回复反腐蚀
    if (!this.callbacks.onGameAction) {
      if (this.currentWeather === 'acid_rain' && !this.currentMapId.startsWith('home_')) {
        this.player.shield = Math.max(0, this.player.shield - ACID_SHIELD_DRAIN * dt);
      } else if (this.gameTime >= this.shieldRegenAt && this.player.shield < this.player.maxShield) {
        this.player.shield = Math.min(this.player.maxShield, this.player.shield + 8 * dt);
      }
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - 30 * dt);
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    // 饱食度：随时间流失；归零扣HP；高饱食缓慢回血
    this.gatherCooldown = Math.max(0, this.gatherCooldown - dt);
    this.player.satiety = Math.max(0, this.player.satiety - 0.25 * dt);
    if (this.player.satiety <= 0) {
      this.player.hp -= 2.5 * dt;
      if (Math.random() < 0.02) {
        this.addTextParticle(this.player.x, this.player.y - 1.4, '饥饿难耐…HP流失！找吃的！', '#f87171');
      }
    } else if (this.player.satiety > 50 && this.player.hp < this.player.maxHp) {
      this.player.hp = Math.min(this.player.maxHp, this.player.hp + 1.2 * dt);
    }

    // 倒地：巡逻队救回庇护所（物品保留），致敬参考站的低惩罚
    if (this.player.hp <= 0 && !this.callbacks.onGameAction) {
      soundManager.playThunder();
      this.player.hp = Math.round(this.player.maxHp * 0.6);
      this.player.satiety = 40;
      this.player.stamina = this.player.maxStamina;
      this.player.ammo = 0;
      this.callbacks.onPlayerDeathDrop?.(this.currentMapId);
      this.warpToMap('camp_plaza', 0, 0, '重伤获救');
      this.addTextParticle(0, -1.5, '你在废土上倒下…掉落部分背包（30s可回捡）', '#f87171');
    }

    if (this.player.isDashing) {
      this.player.dashTimer -= dt;
      if (this.player.dashTimer <= 0) {
        this.player.isDashing = false;
      }
    }

    // Camera follow lerp
    const targetCamX = -(this.player.x - this.player.y) * (this.TILE_W / 2);
    const targetCamY = -(this.player.x + this.player.y) * (this.TILE_H / 2);
    this.camera.x += (targetCamX - this.camera.x) * 6 * dt;
    this.camera.y += (targetCamY - this.camera.y) * 6 * dt;

    // 建筑碰撞：墙/关闭的门/设施挡人，开着的门可穿行进入室内
    for (const b of this.callbacks.onGameAction ? [] : this.buildings) {
      if (b.type === 'spikes') continue;
      if ((b.type === 'door' || b.type === 'safe_door') && b.isOpen) continue;
      const dx = this.player.x - b.x;
      const dy = this.player.y - b.y;
      const d = Math.hypot(dx, dy);
      const minD = 0.85;
      if (d < minD) {
        if (d > 0.0001) {
          this.player.x = b.x + (dx / d) * minD;
          this.player.y = b.y + (dy / d) * minD;
        } else {
          this.player.x = b.x + minD;
        }
      }
    }

    // Player aim
    const playerScreen = this.toScreen(this.player.x, this.player.y);
    this.player.angle = Math.atan2(this.mouse.screenY - playerScreen.y, this.mouse.screenX - playerScreen.x);

    // Shooting（选中槽为武器+有弹才能开火，否则左键为徒手/工具近战）
    const shotTime = performance.now();
    this.player.fireTimer = Math.max(0, (this.nextShotAt - shotTime) / 1000);
    if (this.player.isFiring && this.hasRangedWeapon && this.player.ammo > 0 && !this.isBuildMode) {
      this.tryFireRangedWeapon(shotTime);
    } else {
      // 有枪无弹：有备弹自动装填，无备弹则提示去向（2秒一次，免刷屏）
      if (this.player.isFiring && !this.isBuildMode && this.hasRangedWeapon && this.player.ammo <= 0) {
        if (this.player.reserveAmmo > 0) {
          this.meleeTimer -= dt;
          if (this.meleeTimer <= 0) {
            this.meleeTimer = 0.8;
            this.reloadWeapon();
          }
        } else {
          this.emptyHintTimer -= dt;
          if (this.emptyHintTimer <= 0) {
            this.emptyHintTimer = 2.0;
            this.addTextParticle(this.player.x, this.player.y - 1.4, '没有弹药！搜弹药箱 / 工作台制造', '#f87171');
            soundManager.playClick();
          }
        }
      }
      // Melee：扇形挥击 + 击退，落空也耗体力防空挥刷怪
      if (this.player.isFiring && !this.isBuildMode && !this.hasRangedWeapon) {
        this.meleeTimer -= dt;
        if (this.meleeTimer <= 0 && this.player.stamina >= MELEE.stamina) {
          const remote = this.aimedRemoteTarget(this.player.angle, MELEE.range);
          if (remote) this.callbacks.onGameAction?.('attack', { targetId: remote.id });
          const targets = this.monsters.filter((m) => {
            if (m.state === 'dead') return false;
            const dist = Math.hypot(m.x - this.player.x, m.y - this.player.y);
            if (dist > MELEE.range) return false;
            const origin = this.toScreen(this.player.x, this.player.y), point = this.toScreen(m.x, m.y);
            const ang = Math.atan2(point.y - origin.y, point.x - origin.x);
            let diff = Math.abs(this.player.angle - ang);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            return diff < MELEE.arc && hasLineOfSight(this.player, m, this.buildings);
          });
          if (targets.length > 0) {
            this.meleeTimer = MELEE.cooldown;
            this.player.stamina -= MELEE.stamina;
            if (this.monsterAuthority && !remote) this.callbacks.onGameAction?.('attack', { monsterId: targets[0].id });
            for (const target of targets.slice(0, 3)) {
              if (this.monsterAuthority) continue;
              target.hp -= this.meleeDamage;
              target.state = 'chase';
              const d = Math.max(0.001, Math.hypot(target.x - this.player.x, target.y - this.player.y));
              target.x += ((target.x - this.player.x) / d) * MELEE.knockback;
              target.y += ((target.y - this.player.y) / d) * MELEE.knockback;
              soundManager.playHit(false);
              this.addTextParticle(target.x, target.y - 1.2, `-${this.meleeDamage}`, '#fdba74');
              this.particles.push({
                x: target.x,
                y: target.y,
                vx: (Math.random() - 0.5) * 2,
                vy: (Math.random() - 0.5) * 2,
                life: 0.25,
                maxLife: 0.25,
                color: '#fdba74',
                size: 5,
                type: 'spark',
              });
              if (target.hp <= 0) {
                target.state = 'dead';
                this.addTextParticle(target.x, target.y - 1.5, '已击杀', '#ec4899');
                this.callbacks.onMonsterKilled(target.name, target.maxHp);
                const mx = target.spawnX ?? 3.0;
                const my = target.spawnY ?? -4.0;
                const dead = target;
                setTimeout(() => {
                  dead.hp = dead.maxHp;
                  dead.state = 'roam';
                  dead.windup = 0;
                  dead.x = mx + (Math.random() - 0.5) * 6;
                  dead.y = my + (Math.random() - 0.5) * 4;
                }, 12000);
              }
            }
          } else {
            // 挥空：短CD + 照样扣体力
            this.meleeTimer = 0.25;
            this.player.stamina -= 2;
          }
        }
      }
    }

    if (this.player.recoil > 0) {
      this.player.recoil = Math.max(0, this.player.recoil - 40 * dt);
    }

    // Network Sync Throttle (20Hz)
    this.syncTimer += dt;
    if (this.syncTimer >= 0.05) {
      this.syncTimer = 0;
      this.callbacks.onPlayerSyncNeeded?.({
        x: this.player.x,
        y: this.player.y,
        angle: this.player.angle,
        mapId: this.currentMapId,
        hp: this.player.hp,
        shield: this.player.shield,
        level: 1,
        isFiring: this.player.isFiring,
        isDashing: this.player.isDashing,
      });
    }

    // Turret AI：集火最近的怪；尖刺： standing 怪每秒掉血
    this.buildings.forEach((b) => {
      if (this.monsterAuthority || (this.callbacks.onGameAction && this.currentMapId.startsWith('home_'))) return;
      if (b.type === 'spikes') {
        const victim = this.monsters.find((m) => m.state !== 'dead' && Math.hypot(m.x - b.x, m.y - b.y) < 1.0);
        if (victim) {
          victim.hp -= 20 * dt;
          victim.state = 'chase';
          if (Math.random() < 0.1) {
            this.addTextParticle(victim.x, victim.y - 1.0, '-20 铁刺', '#f59e0b');
          }
          if (victim.hp <= 0) {
            victim.state = 'dead';
            this.callbacks.onMonsterKilled(victim.name, victim.maxHp);
            const mx = victim.spawnX ?? 3.0;
            const my = victim.spawnY ?? -4.0;
            const dead = victim;
            setTimeout(() => {
              dead.hp = dead.maxHp;
              dead.state = 'roam';
              dead.windup = 0;
              dead.x = mx + (Math.random() - 0.5) * 6;
              dead.y = my + (Math.random() - 0.5) * 4;
            }, 12000);
          }
        }
      }
      if (b.type === 'turret') {
        b.fireCooldown = (b.fireCooldown || 0) - dt;
        if ((b.fireCooldown || 0) <= 0) {
          let best: typeof this.monsters[number] | null = null;
          let bestD = 7.0;
          for (const m of this.monsters) {
            if (m.state === 'dead') continue;
            const d = Math.hypot(m.x - b.x, m.y - b.y);
            if (d < bestD) { bestD = d; best = m; }
          }
          if (best) {
            const target = best;
            b.fireCooldown = 1.0;
            target.hp -= 45;
            target.state = 'chase';
            soundManager.playHit(true);
            this.addTextParticle(target.x, target.y - 1.2, '-45 电击', '#06b6d4');

            this.particles.push({
              x: b.x,
              y: b.y,
              vx: (target.x - b.x) * 10,
              vy: (target.y - b.y) * 10,
              life: 0.15,
              maxLife: 0.15,
              color: '#38bdf8',
              size: 4,
              type: 'laser',
            });

            if (target.hp <= 0) {
              target.state = 'dead';
              this.callbacks.onMonsterKilled(target.name, target.maxHp);
            }
          }
        }
      }
    });

    // Looting（三角洲式：读条→开箱面板挑选；移动/受伤打断）
    if (this.isLooting) {
      const k = this.keys;
      const moving = !!(
        k['w'] || k['keyw'] || k['arrowup'] ||
        k['s'] || k['keys'] || k['arrowdown'] ||
        k['a'] || k['keya'] || k['arrowleft'] ||
        k['d'] || k['keyd'] || k['arrowright'] ||
        this.virtualJoystick.x !== 0 || this.virtualJoystick.y !== 0 ||
        this.targetMovePoint
      );
      if (moving || this.gameTime - this.lastHurtAt < 1.0) {
        this.isLooting = false;
        this.lootProgress = 0;
        this.lootTarget = null;
        this.addTextParticle(this.player.x, this.player.y - 1.2, moving ? '移动打断了搜索…' : '受伤打断了搜索！', '#f87171');
        soundManager.playClick();
      } else {
        const total = this.lootTarget?.searchDuration ?? 1.0;
        this.lootingTimer -= dt;
        this.lootProgress = Math.max(0, Math.min(1, 1 - this.lootingTimer / total));
        if (this.lootingTimer <= 0) {
          this.isLooting = false;
          this.lootProgress = 0;
          const target = this.lootTarget;
          this.lootTarget = null;
          if (target && this.callbacks.onGameAction) {
            const gather = ['tree', 'boulder', 'pond', 'crystal'].includes(target.type);
            this.callbacks.onGameAction(gather ? 'gather' : 'search', { targetId: target.id });
            this.gatherCooldown = 0.2;
          } else if (target?.lootTable && (target.stock ?? 1) > 0) {
            soundManager.playLoot();
            this.addTextParticle(this.player.x, this.player.y - 1.8, `🔍 ${target.name}：挑能带走的！`, '#4ade80');
            this.callbacks.onOpenLootPanel?.({
              id: target.id,
              name: target.name,
              items: target.lootTable.map((l) => ({ itemId: l.itemId, name: l.name, count: l.count })),
            });
          }
        }
      }
    }

    // 资源刷新：枯竭节点到点恢复
    for (const it of this.callbacks.onGameAction ? [] : this.interactables) {
      if (isFinite(it.maxStock ?? 0) && (it.stock ?? 1) <= 0 && this.gameTime >= (it.respawnAt ?? Infinity)) {
        it.stock = it.maxStock;
      }
    }

    // Monsters
    this.monsters.forEach((m) => {
      if (this.monsterAuthority) {
        const target = this.monsterTargets.get(m.id);
        if (target && m.state !== 'dead') {
          m.x += (target.x - m.x) * Math.min(1, dt * 12);
          m.y += (target.y - m.y) * Math.min(1, dt * 12);
        }
        m.animTime += dt;
        return;
      }
      if (m.state === 'dead') return;
      m.animTime += dt;
      if (m.windup === undefined) m.windup = 0;
      if (m.spawnX === undefined) m.spawnX = m.x;
      if (m.spawnY === undefined) m.spawnY = m.y;

      // 回拉：追出出生点 14 格则脱战回血回家
      const homeDist = Math.hypot(m.x - m.spawnX, m.y - m.spawnY);
      if (homeDist > 14) {
        m.state = 'roam';
        m.windup = 0;
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.1 * dt * 10);
        m.x += (m.spawnX - m.x) * Math.min(1, 1.5 * dt);
        m.y += (m.spawnY - m.y) * Math.min(1, 1.5 * dt);
        return;
      }

      const dx = this.player.x - m.x;
      const dy = this.player.y - m.y;
      const dist = Math.hypot(dx, dy);
      const risk = this.currentMapId.startsWith('marsh_rift') ? 'EXTREME'
        : this.currentMapId.startsWith('town_ruins') || this.currentMapId.startsWith('mtn_deep') || this.currentMapId.startsWith('marsh_bog') ? 'HIGH'
        : this.currentMapId.startsWith('camp') ? 'SAFE' : 'LOW';
      const aggro = aggroRangeFor(risk, this.currentWeather);

      if (dist < aggro && aggro > 0) {
        // 狂暴：血量<30% 移速+30% 伤害+25%
        const enraged = isEnraged(m.hp, m.maxHp);
        const spd = m.speed * (enraged ? 1.3 : 1);
        m.state = 'chase';
        if (dist > 0.001) {
          m.x += (dx / dist) * spd * dt;
          m.y += (dy / dist) * spd * dt;
        }

        // 分离：同类挤在一起时互相推开，防叠罗汉
        for (const o of this.monsters) {
          if (o === m || o.state === 'dead') continue;
          const ox = m.x - o.x;
          const oy = m.y - o.y;
          const od = Math.hypot(ox, oy);
          if (od < 0.9 && od > 0.001) {
            m.x += (ox / od) * 1.2 * dt;
            m.y += (oy / od) * 1.2 * dt;
          }
        }

        this.buildings.forEach((b) => {
          if ((b.type === 'iron_wall' || (b.type === 'door' && !b.isOpen)) && Math.hypot(b.x - m.x, b.y - m.y) < 1.1) {
            b.hp -= 8 * dt;
            if (Math.random() < 0.08) {
              this.addTextParticle(b.x, b.y - 1.0, '-8 耐久', '#f87171');
            }
          }
        });

        if (dist < 1.4) {
          // 前摇：首次进入先预警 0.35s，期间只闪红不扣血
          if (m.attackCooldown <= 0 && (m.windup ?? 0) <= 0) {
            m.windup = 0.35;
            m.state = 'attack';
            this.addTextParticle(m.x, m.y - 1.4, '!', '#f87171');
          } else if ((m.windup ?? 0) > 0) {
            m.windup = Math.max(0, (m.windup ?? 0) - dt);
            if (m.windup === 0) {
              m.attackCooldown = 1.2;
              const raw = m.damage * (enraged ? 1.25 : 1);
              const dmg = calcMonsterHit(raw, this.armorReduction);
              const res = absorbShieldFirst(this.player.shield, this.player.hp, dmg);
              // 冲刺无敌帧：invulnUntil 内免伤（Task 5 接 performDash 写入）
              if (this.gameTime < this.invulnUntil) {
                this.addTextParticle(this.player.x, this.player.y - 0.8, '闪避!', '#38bdf8');
              } else {
                this.player.shield = Math.max(0, res.shield);
                this.player.hp = Math.max(0, res.hp);
                this.shake = Math.min(10, this.shake + 4);
                this.hurtFlash = 0.35;
                this.shieldRegenAt = this.gameTime + 5;
                this.callbacks.onPlayerDamage(dmg);
                this.callbacks.onGameAction?.('damage', { monsterId: m.id });
                this.lastHurtAt = this.gameTime;
                this.addTextParticle(this.player.x, this.player.y - 0.8, `-${dmg}`, '#ef4444');
                soundManager.playHit(false);
              }
            }
          } else {
            m.attackCooldown -= dt;
          }
        } else {
          m.windup = 0;
          m.attackCooldown -= dt;
        }
      } else {
        m.state = 'roam';
        m.windup = 0;
        m.x += Math.cos(m.animTime * 0.8) * 0.4 * dt;
        m.y += Math.sin(m.animTime * 0.8) * 0.4 * dt;
      }
    });

    // Squad Teammates Dynamic Tactical AI & Assist
    // 1. Sapper Allen (Heavy Demolition & Melee Defense)
    const allen = this.teammates.find((t) => t.id === 'allen');
    if (allen) {
      const targetX = this.player.x - 1.4;
      const targetY = this.player.y + 0.8;
      const distToLeader = Math.hypot(targetX - allen.x, targetY - allen.y);
      if (distToLeader > 0.4) {
        allen.x += ((targetX - allen.x) / distToLeader) * Math.min(distToLeader * 2.2, 4.0) * dt;
        allen.y += ((targetY - allen.y) / distToLeader) * Math.min(distToLeader * 2.2, 4.0) * dt;
      }
      // Melee hammer smash if monster is close
      const nearbyMonster = this.monsters.find((m) => m.state !== 'dead' && Math.hypot(m.x - allen.x, m.y - allen.y) < 2.0);
      if (nearbyMonster && Math.random() < 0.04) {
        nearbyMonster.hp -= 35;
        soundManager.playHit(true);
        this.addTextParticle(nearbyMonster.x, nearbyMonster.y - 1.2, '-35 破拆重锤', '#f59e0b');
        if (nearbyMonster.hp <= 0) {
          nearbyMonster.state = 'dead';
          this.callbacks.onMonsterKilled(nearbyMonster.name, nearbyMonster.maxHp);
        }
      }
    }

    // 2. Tech Vivian (Ranged SMG & Shield Maintenance Field)
    const vivian = this.teammates.find((t) => t.id === 'vivian');
    if (vivian) {
      const targetX = this.player.x + 1.4;
      const targetY = this.player.y + 0.8;
      const distToLeader = Math.hypot(targetX - vivian.x, targetY - vivian.y);
      if (distToLeader > 0.4) {
        vivian.x += ((targetX - vivian.x) / distToLeader) * Math.min(distToLeader * 2.2, 4.0) * dt;
        vivian.y += ((targetY - vivian.y) / distToLeader) * Math.min(distToLeader * 2.2, 4.0) * dt;
      }
      // Ranged pulse fire
      const monsterTarget = this.monsters.find((m) => m.state !== 'dead' && Math.hypot(m.x - vivian.x, m.y - vivian.y) < 5.5);
      if (monsterTarget && Math.random() < 0.04) {
        monsterTarget.hp -= 22;
        this.addTextParticle(monsterTarget.x, monsterTarget.y - 1.0, '-22 脉冲激光', '#2dd4bf');
        this.particles.push({
          x: vivian.x,
          y: vivian.y,
          vx: (monsterTarget.x - vivian.x) * 8,
          vy: (monsterTarget.y - vivian.y) * 8,
          life: 0.12,
          maxLife: 0.12,
          color: '#2dd4bf',
          size: 3,
          type: 'laser',
        });
        if (monsterTarget.hp <= 0) {
          monsterTarget.state = 'dead';
          this.callbacks.onMonsterKilled(monsterTarget.name, monsterTarget.maxHp);
        }
      }
      // Periodic tactical nano-shield maintenance aura
      if (Math.random() < 0.008 && this.player.shield < this.player.maxShield) {
        this.player.shield = Math.min(this.player.maxShield, this.player.shield + 25);
        this.addTextParticle(this.player.x, this.player.y - 1.4, '+25 护盾维保', '#06b6d4');
      }
    }

    // 3. Hummingbird Drone (Scout & Target Laser)
    const drone = this.teammates.find((t) => t.id === 'drone');
    if (drone) {
      const targetX = this.player.x;
      const targetY = this.player.y - 1.2;
      drone.x += (targetX - drone.x) * 3.5 * dt;
      drone.y += (targetY - drone.y) * 3.5 * dt;
      drone.hoverOffset = Math.sin(this.gameTime * 3.5) * 0.16;

      const target = this.monsters.find((m) => m.state !== 'dead' && Math.hypot(m.x - drone.x, m.y - drone.y) < 6.5);
      if (target) {
        drone.targetLaser = { x: target.x, y: target.y };
        if (Math.random() < 0.04) {
          target.hp -= 20;
          this.addTextParticle(target.x, target.y - 1.0, '-20 伴飞激光', '#38bdf8');
          if (target.hp <= 0) {
            target.state = 'dead';
            this.callbacks.onMonsterKilled(target.name, target.maxHp);
          }
        }
      } else {
        drone.targetLaser = null;
      }
    }

    // Proximity
    let closestInteractable: InteractableEntity | null = null;
    let minDist = 3.0;
    this.interactables.forEach((item) => {
      const d = Math.hypot(this.player.x - item.x, this.player.y - item.y);
      if (d < item.radius && d < minDist && hasLineOfSight(this.player, item, this.buildings)) {
        minDist = d;
        closestInteractable = item;
      }
    });
    this.nearestInteractable = closestInteractable;

    let closestBuilding: BuildingEntity | null = null;
    let minBuildDist = 2.4;
    this.buildings.forEach((b) => {
      if (b.type.endsWith('_floor')) return;
      if (b.hp <= 0 && b.type !== 'storage_box' && b.ownerId !== this.localPlayerId && !this.friendlyPlayerIds.has(b.ownerId ?? '')) return;
      if (b.type.includes('wall') && ((!b.ownerId) || (b.ownerId === this.localPlayerId && b.hp >= b.maxHp))) return;
      const d = Math.hypot(this.player.x - b.x, this.player.y - b.y);
      if (d < minBuildDist && hasLineOfSight(this.player, b, this.buildings, b.id)) {
        minBuildDist = d;
        closestBuilding = b;
      }
    });
    this.nearestBuilding = closestBuilding;
    const gatherTarget = this.nearestInteractable as InteractableEntity | null;
    if (this.callbacks.onGameAction && !this.isLooting && this.gatherCooldown <= 0 && (this.keys.e || this.keys.f) && gatherTarget && ['tree', 'boulder', 'pond', 'crystal'].includes(gatherTarget.type)) this.triggerInteraction();

    // Sparks & Campfire
    if (this.getGroundTheme() === 'camp') {
      if (Math.random() < 0.7) {
        this.particles.push({
          x: -4.1 + (Math.random() - 0.5) * 0.3,
          y: 2.1 + (Math.random() - 0.5) * 0.3,
          vx: (Math.random() - 0.5) * 2.2,
          vy: -Math.random() * 2.5,
          life: 0.35,
          maxLife: 0.35,
          color: Math.random() > 0.4 ? '#f97316' : '#fde047',
          size: 2.5 + Math.random() * 2,
          type: 'spark',
        });
      }

      if (Math.random() < 0.4) {
        this.particles.push({
          x: this.campfire.x + (Math.random() - 0.5) * 0.4,
          y: this.campfire.y + (Math.random() - 0.5) * 0.4,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -1.2 - Math.random() * 1.0,
          life: 0.8,
          maxLife: 0.8,
          color: '#fb923c',
          size: 3,
          type: 'fire',
        });
      }
    } else if (this.getGroundTheme() === 'rift') {
      // Floating purple magma embers
      if (Math.random() < 0.6) {
        this.particles.push({
          x: (Math.random() - 0.5) * 8,
          y: (Math.random() - 0.5) * 8,
          vx: (Math.random() - 0.5) * 0.8,
          vy: -1.0 - Math.random() * 1.5,
          life: 0.9,
          maxLife: 0.9,
          color: '#c026d3',
          size: 3 + Math.random() * 3,
          type: 'fire',
        });
      }
    }

    // Particles update
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }

    // Rain update
    if (this.currentWeather !== 'clear') {
      for (let i = 0; i < this.rainDrops.length; i++) {
        const r = this.rainDrops[i];
        r.y += r.speed;
        r.x -= r.speed * 0.32;
        if (r.y > this.height) {
          r.y = -20;
          r.x = Math.random() * (this.width + 300);
          if (Math.random() < 0.12) {
            this.groundSplashes.push({
              x: r.x,
              y: Math.min(this.height - 20, Math.random() * this.height),
              radius: 1,
              maxRadius: 6 + Math.random() * 6,
              alpha: 0.5,
            });
          }
        }
      }

      for (let i = this.groundSplashes.length - 1; i >= 0; i--) {
        const sp = this.groundSplashes[i];
        sp.radius += 18 * dt;
        sp.alpha -= 1.8 * dt;
        if (sp.alpha <= 0) {
          this.groundSplashes.splice(i, 1);
        }
      }
    }
  }

  // 掉落物归类（与 maps.ts 共用）
  private mapLootToResource(itemId: string) {
    return lootResourceOf(itemId);
  }

  private aimedRemoteTarget(angle: number, range: number): OnlinePlayer | undefined {
    const origin = this.toScreen(this.player.x, this.player.y);
    return [...this.onlinePlayers.values()].filter(p => {
      if (p.id === this.localPlayerId || this.friendlyPlayerIds.has(p.id) || p.mapId !== this.currentMapId || p.hp <= 0) return false;
      if (Math.hypot(p.x - this.player.x, p.y - this.player.y) > range || !hasLineOfSight(this.player, p, this.buildings)) return false;
      const screen = this.toScreen(p.x, p.y);
      let difference = Math.abs(angle - Math.atan2(screen.y - origin.y, screen.x - origin.x));
      difference = Math.min(difference, Math.PI * 2 - difference);
      return difference < 0.24;
    }).sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))[0];
  }

  private worldAimDirection(angle: number): { x: number; y: number } {
    // Aim is a screen angle; particles move in the isometric world plane.
    const x = Math.cos(angle) / this.TILE_W + Math.sin(angle) / this.TILE_H;
    const y = Math.sin(angle) / this.TILE_H - Math.cos(angle) / this.TILE_W;
    const length = Math.hypot(x, y);
    return { x: x / length, y: y / length };
  }

  private tryFireRangedWeapon(shotTime: number) {
    if (!this.hasRangedWeapon || this.player.ammo <= 0 || this.isBuildMode || shotTime < this.nextShotAt) return;
    this.nextShotAt = shotTime + this.player.fireRate * 1000;
    this.player.fireTimer = this.player.fireRate;
    this.player.ammo -= 1;
    this.player.recoil = 8;
    soundManager.playGunshot();

    const muzzleDist = 0.8;
    const direction = this.worldAimDirection(this.player.angle);
    const flashWorldX = this.player.x + direction.x * muzzleDist;
    const flashWorldY = this.player.y + direction.y * muzzleDist;
    this.spawnMuzzleFlash(flashWorldX, flashWorldY);
    this.fireBullet(flashWorldX, flashWorldY, this.player.angle);
  }

  private fireBullet(startX: number, startY: number, angle: number) {
    const range = this.rangedRange;
    const spread = this.rangedSpread;
    const target = this.aimedRemoteTarget(angle, range);
    const origin = this.toScreen(this.player.x, this.player.y);
    const monster = !target ? this.monsters.filter(m => {
      if (m.state === 'dead' || Math.hypot(m.x - this.player.x, m.y - this.player.y) > range || !hasLineOfSight(this.player, m, this.buildings)) return false;
      const point = this.toScreen(m.x, m.y);
      let diff = Math.abs(angle - Math.atan2(point.y - origin.y, point.x - origin.x));
      diff = Math.min(diff, Math.PI * 2 - diff);
      return diff < 0.28 + spread;
    }).sort((a, b) => Math.hypot(a.x - this.player.x, a.y - this.player.y) - Math.hypot(b.x - this.player.x, b.y - this.player.y))[0] : undefined;
    this.callbacks.onGameAction?.('fire', { angle, ...(target ? { targetId: target.id } : monster ? { monsterId: monster.id } : {}) });

    const direction = this.worldAimDirection(angle);
    this.particles.push({
      x: startX,
      y: startY,
      vx: direction.x * 35,
      vy: direction.y * 35,
      life: 0.12,
      maxLife: 0.12,
      color: '#fef08a',
      size: 3,
      type: 'laser',
    });

    if (this.monsterAuthority) return;
    for (const m of this.monsters) {
      if (m.state === 'dead') continue;
      const dist = Math.hypot(m.x - startX, m.y - startY);
      const origin = this.toScreen(this.player.x, this.player.y);
      const monsterScreen = this.toScreen(m.x, m.y);
      const angleToMonster = Math.atan2(monsterScreen.y - origin.y, monsterScreen.x - origin.x);
      let angleDiff = Math.abs(angle - angleToMonster);
      if (angleDiff > Math.PI) angleDiff = Math.PI * 2 - angleDiff;
      // 散布：土铳容差大但要求近，步枪容差小但射程远
      const tolerance = 0.28 + spread;

      if (!target && dist < range && (angleDiff < tolerance || dist < 1.2) && hasLineOfSight(this.player, m, this.buildings)) {
        const critChance = Math.min(0.6, this.rangedCritChance + weatherCritBonus(this.currentWeather));
        const isCrit = rollCrit(critChance);
        const damage = calcRangedDamage(this.rangedDamage, dist, range, isCrit, this.rangedCritMult);
        m.hp -= damage;
        m.state = 'chase';
        soundManager.playHit(isCrit);

        this.addTextParticle(m.x, m.y - 1.2, `-${damage}`, isCrit ? '#facc15' : '#fb923c');

        for (let i = 0; i < 8; i++) {
          this.particles.push({
            x: m.x,
            y: m.y,
            vx: (Math.random() - 0.5) * 3,
            vy: (Math.random() - 0.5) * 3,
            life: 0.4,
            maxLife: 0.4,
            color: '#a855f7',
            size: 4 + Math.random() * 4,
            type: 'smoke',
          });
        }

        if (m.hp <= 0) {
          m.state = 'dead';
          this.addTextParticle(m.x, m.y - 1.5, '已击杀', '#ec4899');
          this.callbacks.onMonsterKilled(m.name, m.maxHp);
          const mx = m.spawnX ?? 3.0;
          const my = m.spawnY ?? -4.0;
          const dead = m;
          setTimeout(() => {
            dead.hp = dead.maxHp;
            dead.state = 'roam';
            dead.windup = 0;
            dead.x = mx + (Math.random() - 0.5) * 6;
            dead.y = my + (Math.random() - 0.5) * 4;
          }, 12000);
        }
        break;
      }
    }
  }

  private spawnMuzzleFlash(x: number, y: number) {
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 0.1,
        y: y + (Math.random() - 0.5) * 0.1,
        vx: (Math.random() - 0.5) * 1.5,
        vy: (Math.random() - 0.5) * 1.5,
        life: 0.08,
        maxLife: 0.08,
        color: '#fef08a',
        size: 5 + Math.random() * 4,
        type: 'spark',
      });
    }
  }

  public addTextParticle(x: number, y: number, text: string, color: string) {
    this.particles.push({
      x,
      y,
      vx: 0,
      vy: -0.8,
      life: 0.9,
      maxLife: 0.9,
      color,
      size: 14,
      type: 'text',
      text,
    });
  }

  private drawTargetMoveMarker(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    const pulse = (Math.sin(this.gameTime * 8) + 1) * 0.5;
    const r1 = 12 + pulse * 6;
    const r2 = 5;

    // Glowing target ground ring
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, r1, r1 * 0.5, 0, 0, Math.PI * 2);
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = '#06b6d4';
    this.ctx.shadowBlur = 8;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, r2, r2 * 0.5, 0, 0, Math.PI * 2);
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.fill();

    // Line from player to target
    const ps = this.toScreen(this.player.x, this.player.y);
    this.ctx.beginPath();
    this.ctx.setLineDash([4, 4]);
    this.ctx.moveTo(ps.x, ps.y);
    this.ctx.lineTo(s.x, s.y);
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();
    this.ctx.setLineDash([]);
    this.ctx.restore();
  }

  // --- RENDER ENGINE ---
  private isWorldAreaVisible(x0: number, y0: number, x1 = x0, y1 = y0) {
    const left = this.toScreen(x0, y1).x;
    const right = this.toScreen(x1, y0).x;
    const top = this.toScreen(x0, y0).y - 180;
    const bottom = this.toScreen(x1, y1).y + 40;
    return right >= -128 && left <= this.width + 128 && bottom >= -128 && top <= this.height + 128;
  }

  private render() {
    this.ctx.clearRect(0, 0, this.width, this.height);
    // 受击震屏（combat）：帧级平移，restore 在方法末尾
    this.ctx.save();
    if (this.shake > 0) {
      this.ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    // 1. Comprehensive Map-Specific Seamless Isometric Tile Ground!
    this.renderMapGround();

    // 1.5 Click-to-Move Target Waypoint Indicator
    if (this.targetMovePoint) {
      this.drawTargetMoveMarker(this.targetMovePoint.x, this.targetMovePoint.y);
    }

    // 2. Y-Sorted Entities & Map Props
    const renderList: { yDepth: number; render: () => void }[] = [];
    const gtheme = this.getGroundTheme();

    // Map Specific Props & Natural Flora（按地形主题，同主题多图复用）
    if (this.currentMapId === 'world') {
      for (const prop of this.worldScenery) {
        if (!this.isWorldAreaVisible(prop.x, prop.y)) continue;
        renderList.push({ yDepth: prop.x + prop.y, render: () => this.drawWorldScenery(prop) });
      }
      for (const stop of WORLD_ROADSIDE_STOPS) {
        const x = Math.sign(stop.x) * 5;
        if (this.isWorldAreaVisible(x, stop.y)) renderList.push({ yDepth: x + stop.y, render: () => this.drawRoadsideSign(stop) });
      }
    } else if (gtheme === 'camp') {
      // 纪念篝火 + 纯观赏植被（可交互物由 drawInteractable 真实绘制，不再摆假模型）
      renderList.push({ yDepth: this.campfire.x + this.campfire.y, render: () => this.drawCampfire(this.campfire.x, this.campfire.y) });
      renderList.push({ yDepth: -7 + -3, render: () => this.drawPineTree(-7, -3) });
      renderList.push({ yDepth: 7 + -3, render: () => this.drawPineTree(7, -3) });
      renderList.push({ yDepth: -5 + -6, render: () => this.drawPineTree(-5, -6) });
      renderList.push({ yDepth: 6 + -6, render: () => this.drawPineTree(6, -6) });
      renderList.push({ yDepth: -8 + 2, render: () => this.drawOakTree(-8, 2) });
      renderList.push({ yDepth: 8 + 2, render: () => this.drawOakTree(8, 2) });
      renderList.push({ yDepth: -6 + 3, render: () => this.drawFence(-6, 3, 4) });
    } else if (gtheme === 'field' || gtheme === 'plaza') {
      // 外圩/工坊点缀：松树与围栏
      renderList.push({ yDepth: -7 + -3, render: () => this.drawPineTree(-7, -3) });
      renderList.push({ yDepth: 7 + 3, render: () => this.drawPineTree(7, 3) });
      renderList.push({ yDepth: -6 + 3, render: () => this.drawFence(-6, 3, 4) });
    } else if (gtheme === 'urban' || gtheme === 'ruins') {
      // Highway: 只留荒漠灌木，车辆/油罐/箱子由真实交互物绘制
      renderList.push({ yDepth: -6.0 + 1.0, render: () => this.drawWastelandShrub(-6.0, 1.0) });
      renderList.push({ yDepth: 5.0 + -4.0, render: () => this.drawWastelandShrub(5.0, -4.0) });
      renderList.push({ yDepth: 7.0 + 3.0, render: () => this.drawWastelandShrub(7.0, 3.0) });
    } else if (gtheme === 'lake' || gtheme === 'marsh') {
      // Pond: 只留芦苇睡莲与岸树，钓台/箱子由真实交互物绘制
      renderList.push({ yDepth: -1.0 + -1.0, render: () => this.drawReedsAndLilies(-1.0, -1.0) });
      renderList.push({ yDepth: 2.0 + 1.0, render: () => this.drawReedsAndLilies(2.0, 1.0) });
      renderList.push({ yDepth: -3.0 + 2.0, render: () => this.drawReedsAndLilies(-3.0, 2.0) });
      renderList.push({ yDepth: 1.0 + -3.0, render: () => this.drawReedsAndLilies(1.0, -3.0) });
      renderList.push({ yDepth: 6.0 + 1.0, render: () => this.drawOakTree(6.0, 1.0) });
      renderList.push({ yDepth: 5.0 + -4.0, render: () => this.drawPineTree(5.0, -4.0) });
    } else if (gtheme === 'forest' || gtheme === 'quarry') {
      // Forest: Dense conifer stands, boulders, quarry slabs
      renderList.push({ yDepth: -2.5 + -2.0, render: () => this.drawPineTree(-2.5, -2.0) });
      renderList.push({ yDepth: 3.0 + -2.5, render: () => this.drawPineTree(3.0, -2.5) });
      renderList.push({ yDepth: -5.0 + 2.0, render: () => this.drawPineTree(-5.0, 2.0) });
      renderList.push({ yDepth: 5.0 + 3.0, render: () => this.drawPineTree(5.0, 3.0) });
      renderList.push({ yDepth: -1.0 + -5.0, render: () => this.drawPineTree(-1.0, -5.0) });
      renderList.push({ yDepth: -4.0 + -4.0, render: () => this.drawPineTree(-4.0, -4.0) });
      renderList.push({ yDepth: 2.0 + 4.5, render: () => this.drawPineTree(2.0, 4.5) });
    } else if (gtheme === 'rift') {
      // Rift: 移除原点假方尖碑（与异象核心交互物重叠），保留尖塔与晶簇
      renderList.push({ yDepth: -3.5 + 2.5, render: () => this.drawRiftSpire(-3.5, 2.5) });
      renderList.push({ yDepth: 3.5 + -2.5, render: () => this.drawRiftSpire(3.5, -2.5) });
      renderList.push({ yDepth: -2.0 + -3.0, render: () => this.drawRiftCrystallineFlora(-2.0, -3.0) });
      renderList.push({ yDepth: 4.0 + 1.5, render: () => this.drawRiftCrystallineFlora(4.0, 1.5) });
      renderList.push({ yDepth: -5.0 + 0.0, render: () => this.drawRiftCrystallineFlora(-5.0, 0.0) });
    }

    // Gameplay Interactables（采集/搜刮点：逐个绘制真实模型+标记，不再隐身）
    this.interactables.forEach((it) => {
      if (!this.isWorldAreaVisible(it.x, it.y)) return;
      // Dry-land fishing spots need water below all depth-sorted entities.
      if (it.type === 'pond' && this.currentMapId === 'world' && worldThemeAt(it.x, it.y) !== 'lake') {
        const s = this.toScreen(it.x, it.y);
        this.ctx.save(); this.ctx.fillStyle = '#315e69'; this.ctx.strokeStyle = '#78a89a'; this.ctx.lineWidth = 1.5;
        this.ctx.beginPath(); this.ctx.ellipse(s.x, s.y + 8, 62, 27, 0, 0, Math.PI * 2);
        this.ctx.fill(); this.ctx.stroke(); this.ctx.restore();
      }
      renderList.push({
        yDepth: it.x + it.y,
        render: () => this.drawInteractable(it),
      });
    });

    // Buildings（闭合院与屋内箱子一次画完，箱子压在上层保证可见）
    // Floors are already painted in the ground cache, not as shadow-casting entities.
    const allHouseGroups = this.currentHouseGroups();
    if (this.currentMapId === 'world') for (const g of allHouseGroups) {
      if (g.members.length < 8 || !g.door?.id.startsWith('world:') || worldThemeAt(g.cx, g.cy) !== 'lake') continue;
      const b = waterHousePlatformBounds(g.members, g.door);
      if (this.isWorldAreaVisible(b.x0, b.y0, b.x1, b.y1)) drawWaterHousePlatform(this.ctx, g.members, g.door, (x, y) => this.toScreen(x, y));
    }
    const houseGroups = allHouseGroups.filter(g => {
      const { x0, x1, y0, y1 } = houseCorners(g.members);
      return this.isWorldAreaVisible(x0, y0, x1, y1);
    });
    const interiorIds = new Set<string>();
    houseGroups.forEach((g) => {
      if (g.members.length >= 8 && !g.roofFloors) {
        const { x0, x1, y0, y1 } = houseCorners(g.members);
        this.buildings.forEach((b) => {
          if ((b.type === 'storage_box' || b.type === 'workbench') && b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1) {
            interiorIds.add(b.id);
          }
        });
      }
    });
    houseGroups.forEach((g) => {
      const isSingleWall = g.members.length === 1 && g.door === null;
      const isClosedHouse = g.members.length >= 8;
      if (isClosedHouse) {
        const depths = g.members.map((m) => m.x + m.y);
        const { x0, x1, y0, y1 } = houseCorners(g.members);
        const inside = this.buildings.filter((b) => interiorIds.has(b.id) && b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1);
        renderList.push({ yDepth: Math.min(...depths) - 0.1, render: () => this.drawHouse(g.members, g.door, 'back', g.roofFloors) });
        renderList.push({
          yDepth: Math.max(...depths),
          render: () => {
            this.drawHouse(g.members, g.door, 'front', g.roofFloors);
            inside.forEach((b) => this.drawBuilding(b));
          },
        });
      } else if (isSingleWall) {
        const b = g.members[0];
        if (interiorIds.has(b.id)) return;
        renderList.push({
          yDepth: b.x + b.y,
          render: () => this.drawBuilding(b),
        });
      } else {
        g.members.forEach((b) => {
          renderList.push({
            yDepth: b.x + b.y,
            render: () => this.drawBuilding(b),
          });
        });
      }
    });

    // Monsters
    this.monsters.forEach((m) => {
      if (m.state !== 'dead') {
        renderList.push({
          yDepth: m.x + m.y,
          render: () => this.drawMonster(m),
        });
      }
    });

    // Local Player
    const entrances = this.currentMapId === 'world' ? this.campEntrances : [{ id: 'exit', ownerId: '', ownerName: '营地南侧出口', ...campExitPosition(this.campSize) }];
    for (const entrance of entrances) {
      renderList.push({ yDepth: entrance.x + entrance.y, render: () => {
        const p = this.toScreen(entrance.x, entrance.y);
        if (p.x < -80 || p.x > this.width + 80 || p.y < -80 || p.y > this.height + 80) return;
        this.ctx.save();
        this.ctx.strokeStyle = '#d6b67c'; this.ctx.lineWidth = 3;
        this.ctx.beginPath(); this.ctx.moveTo(p.x, p.y); this.ctx.lineTo(p.x, p.y - 55); this.ctx.stroke();
        this.ctx.fillStyle = entrance.ownerId === this.localPlayerId ? '#3f9276' : '#ab7544';
        this.ctx.fillRect(p.x + 1, p.y - 55, 28, 18);
        this.ctx.font = 'bold 12px sans-serif'; this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#fff4dc';
        this.ctx.fillText(entrance.id === 'exit' ? '南侧出口 [E/F]' : `${entrance.ownerName} · 营地入口 [E/F]`, p.x, p.y - 66);
        this.ctx.restore();
      } });
    }
    renderList.push({
      yDepth: this.player.x + this.player.y,
      render: () => this.drawPlayer(),
    });

    // Remote Online Players in current map zone
    this.onlinePlayers.forEach((op) => {
      if (op.id !== this.localPlayerId && op.mapId === this.currentMapId) {
        renderList.push({
          yDepth: op.x + op.y,
          render: () => this.drawRemotePlayer(op),
        });
      }
    });

    // Squad Teammates: Allen & Vivian & Drone
    const allen = this.teammates.find((t) => t.id === 'allen');
    if (allen) {
      renderList.push({
        yDepth: allen.x + allen.y,
        render: () => this.drawSapperAllen(allen),
      });
    }

    const vivian = this.teammates.find((t) => t.id === 'vivian');
    if (vivian) {
      renderList.push({
        yDepth: vivian.x + vivian.y,
        render: () => this.drawTechVivian(vivian),
      });
    }

    const drone = this.teammates.find((t) => t.id === 'drone');
    if (drone) {
      renderList.push({
        yDepth: drone.x + drone.y + 0.5,
        render: () => this.drawDrone(drone.x, drone.y, drone.hoverOffset ?? 0),
      });
    }

    // Inter-map Waypoint Portals
    this.mapWaypoints.forEach((wp) => {
      renderList.push({
        yDepth: wp.x + wp.y,
        render: () => this.drawWaypointPortal(wp),
      });
    });

    // Y-sorting
    renderList.sort((a, b) => a.yDepth - b.yDepth);
    renderList.forEach((item) => item.render());

    if (this.navigationTarget) {
      const target = this.navigationTarget;
      const distance = Math.hypot(target.x - this.player.x, target.y - this.player.y);
      this.ctx.save(); this.ctx.font = 'bold 13px sans-serif';
      this.ctx.textAlign = 'center'; this.ctx.fillStyle = '#fde6a4';
      this.ctx.fillText(`目的地：${target.name} · ${Math.ceil(distance)} 格 · (${Math.round(target.x)}, ${Math.round(target.y)})`, this.width / 2, 72);
      this.ctx.restore();
      if (distance < 3) this.navigationTarget = null;
    }

    // 3. Build Mode Ghost
    if (this.isBuildMode) {
      this.drawBuildGhost();
    }

    // 4. Particles
    this.renderParticles();

    // 5. Lighting
    this.renderDynamicLighting();

    // 6. Weather
    this.renderWeather();

    // 6.5 Theme atmosphere veil (map-*.jpg mood, always on)
    this.renderThemeAtmosphere();

    // 7. Interaction Prompts
    this.renderInteractionHUD();

    // 8. Zone Transition Banner
    this.renderZoneTransitionBanner();
    this.ctx.restore();
  }

  // --- SEAMLESS HIGH-FIDELITY ISOMETRIC GROUND RENDERER BY MAP ZONE ---
  private changedGroundTextureBounds(): GroundRect | undefined {
    const corners = [this.toWorld(0, 0), this.toWorld(this.width, 0), this.toWorld(0, this.height), this.toWorld(this.width, this.height)];
    const minX = Math.floor(Math.min(...corners.map(p => p.x))) - 3, maxX = Math.ceil(Math.max(...corners.map(p => p.x))) + 3;
    const minY = Math.floor(Math.min(...corners.map(p => p.y))) - 3, maxY = Math.ceil(Math.max(...corners.map(p => p.y))) + 3;
    let left = this.width, top = this.height, right = 0, bottom = 0;
    const theme = this.getGroundTheme();
    for (let wx = minX; wx <= maxX; wx++) for (let wy = minY; wy <= maxY; wy++) {
      if (this.placedFloors.has(`${wx},${wy}`)) continue;
      const tileTheme = this.currentMapId === 'world' ? worldThemeAt(wx, wy) : theme;
      if (this.currentMapId === 'world' && tileTheme === 'lake') continue;
      const key = this.tileTextureKey(wx, wy, tileTheme);
      if (!key || !this.groundTileChanges.has(key)) continue;
      const s = this.toScreen(wx, wy);
      left = Math.min(left, s.x - 33); top = Math.min(top, s.y - 33);
      right = Math.max(right, s.x + 33); bottom = Math.max(bottom, s.y + 33);
    }
    left = Math.max(0, Math.floor(left)); top = Math.max(0, Math.floor(top));
    right = Math.min(this.width, Math.ceil(right)); bottom = Math.min(this.height, Math.ceil(bottom));
    if (right > left && bottom > top) return { x: left, y: top, width: right - left, height: bottom - top };
  }

  private renderMapGround() {
    const theme = this.getGroundTheme();
    const animated = this.currentMapId !== 'world' && (theme === 'lake' || theme === 'marsh' || theme === 'rift');
    const margin = 128;
    const floors = Array.from(this.placedFloors, ([key, floor]) => `${key}:${floor.type}`).join(';');
    const key = `${this.currentMapId}:${this.width}:${this.height}:${this.artRevision}:${floors}`;
    let cache = this.groundCache;
    if (!cache) {
      const canvas = document.createElement('canvas');
      cache = this.groundCache = { canvas, key: '', x: 0, y: 0 };
    }
    const moving = Math.abs(this.camera.x - cache.x) > margin || Math.abs(this.camera.y - cache.y) > margin;
    if (cache.key !== key || moving || this.groundTileChanges.size > 0) {
      const width = this.width;
      const height = this.height;
      const ctx = this.ctx;
      const camera = this.camera;
      const shiftX = Math.round(camera.x - cache.x);
      const shiftY = Math.round(camera.y - cache.y);
      const scrolling = moving && cache.key === key && Math.abs(shiftX) < cache.canvas.width && Math.abs(shiftY) < cache.canvas.height;
      const partial = cache.key === key && (!moving || scrolling);
      const regions: GroundRect[] = [];
      if (scrolling) {
        // 整数像素平移旧画面，仅补画露出的边缘；两个区域不重叠，避免透明罩层叠加。
        if (shiftX !== 0) regions.push({ x: shiftX > 0 ? 0 : cache.canvas.width + shiftX, y: 0, width: Math.abs(shiftX), height: cache.canvas.height });
        if (shiftY !== 0) regions.push({ x: shiftX > 0 ? shiftX : 0, y: shiftY > 0 ? 0 : cache.canvas.height + shiftY, width: cache.canvas.width - Math.abs(shiftX), height: Math.abs(shiftY) });
      } else if (!partial) {
        cache.canvas.width = width + margin * 2;
        cache.canvas.height = height + margin * 2;
      }
      const groundCtx = cache.canvas.getContext('2d');
      if (!groundCtx) {
        this.renderMapGroundUncached();
        this.renderGroundDetails();
        return;
      }
      try {
        this.width = cache.canvas.width;
        this.height = cache.canvas.height;
        this.camera = partial ? { x: cache.x + (scrolling ? shiftX : 0), y: cache.y + (scrolling ? shiftY : 0) } : camera;
        if (partial && this.groundTileChanges.size > 0) {
          const changed = this.changedGroundTextureBounds();
          if (changed) regions.push(changed);
        }
        const paint = (surface: HTMLCanvasElement, context: CanvasRenderingContext2D, terrain: boolean) => {
          this.ctx = context;
          const draw = (region?: GroundRect) => {
            if (terrain) this.renderMapGroundUncached(false, region);
            if (!terrain || !animated) this.renderGroundDetails();
          };
          if (partial) {
            if (scrolling) {
              context.save();
              context.globalCompositeOperation = 'copy';
              context.drawImage(surface, shiftX, shiftY);
              context.restore();
            }
            for (const region of regions) {
              context.save();
              try {
                context.beginPath();
                context.rect(region.x, region.y, region.width, region.height);
                context.clip();
                context.clearRect(region.x, region.y, region.width, region.height);
                draw(region);
              } finally {
                context.restore();
              }
            }
          } else {
            draw();
          }
        };
        paint(cache.canvas, groundCtx, true);
        if (animated) {
          cache.overlay ??= document.createElement('canvas');
          if (!partial) {
            cache.overlay.width = this.width;
            cache.overlay.height = this.height;
          }
          const overlayCtx = cache.overlay.getContext('2d');
          if (overlayCtx) paint(cache.overlay, overlayCtx, false);
        } else {
          if (cache.overlay) cache.overlay.width = cache.overlay.height = 0;
          cache.overlay = undefined;
        }
        cache.key = key;
        cache.x = this.camera.x;
        cache.y = this.camera.y;
        this.groundTileChanges.clear();
      } finally {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.camera = camera;
      }
    }
    const dx = this.camera.x - cache.x - margin;
    const dy = this.camera.y - cache.y - margin;
    this.ctx.drawImage(cache.canvas, dx, dy);
    if (animated) {
      this.renderAnimatedGround(theme);
      if (cache.overlay) this.ctx.drawImage(cache.overlay, dx, dy);
    }
  }

  private renderAnimatedGround(theme: GroundTheme) {
    const corners = [this.toWorld(0, 0), this.toWorld(this.width, 0), this.toWorld(0, this.height), this.toWorld(this.width, this.height)];
    const minX = Math.floor(Math.min(...corners.map(c => c.x))) - 3;
    const maxX = Math.ceil(Math.max(...corners.map(c => c.x))) + 3;
    const minY = Math.floor(Math.min(...corners.map(c => c.y))) - 3;
    const maxY = Math.ceil(Math.max(...corners.map(c => c.y))) + 3;
    this.ctx.save();
    for (let wx = minX; wx <= maxX; wx++) {
      for (let wy = minY; wy <= maxY; wy++) {
        if (this.placedFloors.has(`${wx},${wy}`)) continue;
        const fissure = theme === 'rift' && (Math.abs(wx - wy) < 1.8 || Math.abs(wx + wy) < 1.4);
        if (!fissure && !(theme !== 'rift' && wx < 3)) continue;
        const s = this.toScreen(wx, wy);
        if (s.x < -64 || s.x > this.width + 64 || s.y < -64 || s.y > this.height + 64) continue;
        const dock = theme === 'lake' && ((wx >= -2 && wx <= 4 && (wy === 0 || wy === -2 || wy === 2)) || (wx >= 1 && wx <= 3 && wy >= -3 && wy <= 3));
        if (fissure || (theme === 'lake' && !dock)) {
          if (fissure) {
            const pulse = (Math.sin(this.gameTime * 4.5 + wx * 1.2 + wy * 1.2) + 1) * 0.5;
            this.ctx.fillStyle = pulse > 0.5 ? '#7e22ce' : '#6b21a8';
          } else {
            const wave = Math.sin(this.gameTime * 2.4 + wx * 0.8 + wy * 0.8);
            this.ctx.fillStyle = wave > 0 ? '#4a5862' : '#46545e';
          }
          this.ctx.beginPath();
          this.ctx.moveTo(s.x, s.y - this.TILE_H / 2);
          this.ctx.lineTo(s.x + this.TILE_W / 2, s.y);
          this.ctx.lineTo(s.x, s.y + this.TILE_H / 2);
          this.ctx.lineTo(s.x - this.TILE_W / 2, s.y);
          this.ctx.closePath();
          this.ctx.fill();
        }
        if (fissure) {
          this.ctx.fillStyle = '#fdf4ff';
          this.ctx.beginPath();
          this.ctx.ellipse(s.x, s.y, 6, 2.5, 0, 0, Math.PI * 2);
          this.ctx.fill();
        } else {
          this.drawWaterShimmer(wx, wy, s.x, s.y);
        }
      }
    }
    this.ctx.restore();
  }

  private drawWaterShimmer(wx: number, wy: number, sx: number, sy: number) {
    const waveA = Math.sin(this.gameTime * 2.5 + wx * 1.1 + wy * 0.7);
    const waveB = Math.cos(this.gameTime * 1.9 + wx * 0.7 - wy * 0.9);
    if (waveA + waveB > 0.8) {
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
      this.ctx.lineWidth = 1.3;
      this.ctx.beginPath();
      this.ctx.moveTo(sx - 12, sy + waveA * 1.5);
      this.ctx.quadraticCurveTo(sx, sy - 3 + waveB * 1.5, sx + 12, sy + waveA * 1.5);
      this.ctx.stroke();
    }
  }

  private renderMapGroundUncached(animated = true, bounds?: GroundRect) {
    this.ctx.save();

    // 1. Calculate camera visible isometric bounds with wide margins
    const area = bounds ?? { x: 0, y: 0, width: this.width, height: this.height };
    const tl = this.toWorld(area.x, area.y);
    const tr = this.toWorld(area.x + area.width, area.y);
    const bl = this.toWorld(area.x, area.y + area.height);
    const br = this.toWorld(area.x + area.width, area.y + area.height);

    const minWX = Math.floor(Math.min(tl.x, bl.x, tr.x, br.x)) - 3;
    const maxWX = Math.ceil(Math.max(tl.x, bl.x, tr.x, br.x)) + 3;
    const minWY = Math.floor(Math.min(tl.y, bl.y, tr.y, br.y)) - 3;
    const maxWY = Math.ceil(Math.max(tl.y, bl.y, tr.y, br.y)) + 3;

    // Dusty wasteland background tone based on map theme (matches map-*.jpg previews)
    const bgColors: { [key in MapZoneId]: string } = {
      world: '#4a4a3c',
      camp_plaza: '#4a4a3c',
      camp_workshop: '#4e4e48',
      camp_outskirts: '#505040',
      town_gas: '#4c4b46',
      town_street: '#4e4d48',
      town_ruins: '#524a3e',
      mtn_logging: '#4a4438',
      mtn_quarry: '#6e7276',
      mtn_deep: '#454034',
      marsh_docks: '#3d4a52',
      marsh_bog: '#4c4c38',
      marsh_rift: '#40363a',
      sanctuary: '#4a4a3c',
      highway: '#4c4b46',
      pond: '#3d4a52',
      forest: '#4a4438',
      rift_core: '#40363a',
      town_factory: '#50504a',
      mtn_peak: '#7d8894',
      marsh_abyss: '#453a40',
    };
    this.ctx.fillStyle = bgColors[this.currentMapId] || '#4a4a3c';
    this.ctx.fillRect(0, 0, this.width, this.height);

    const theme = this.getGroundTheme();

    // 2. Iterate all visible tiles and draw seamless customized isometric diamond tiles!
    for (let wx = minWX; wx <= maxWX; wx++) {
      for (let wy = minWY; wy <= maxWY; wy++) {
        const s = this.toScreen(wx, wy);
        // 逆变换包围盒包含大量屏幕外地砖，提前排除，避免提交无效绘制。
        if (s.x < area.x - 64 || s.x > area.x + area.width + 64 || s.y < area.y - 64 || s.y > area.y + area.height + 64) continue;

        // Tile diamond path
        this.ctx.beginPath();
        this.ctx.moveTo(s.x, s.y - this.TILE_H / 2);
        this.ctx.lineTo(s.x + this.TILE_W / 2, s.y);
        this.ctx.lineTo(s.x, s.y + this.TILE_H / 2);
        this.ctx.lineTo(s.x - this.TILE_W / 2, s.y);
        this.ctx.closePath();

        // A. Check if the player manually placed a floor here:
        const placed = this.placedFloors.get(`${wx},${wy}`);
        if (placed) {
          if (placed.type === 'wood_floor') {
            this.ctx.fillStyle = (wx + wy) % 2 === 0 ? '#a77348' : '#94633a';
            this.ctx.fill();
            this.ctx.strokeStyle = '#6f4320';
            this.ctx.lineWidth = 1;
            this.ctx.stroke();

            // Wood plank grain stripes & copper nail dots
            this.ctx.strokeStyle = 'rgba(78, 40, 16, 0.4)';
            this.ctx.beginPath();
            this.ctx.moveTo(s.x - 14, s.y - 4);
            this.ctx.lineTo(s.x + 14, s.y - 4);
            this.ctx.moveTo(s.x - 14, s.y + 4);
            this.ctx.lineTo(s.x + 14, s.y + 4);
            this.ctx.stroke();

            this.ctx.fillStyle = '#fde047';
            this.ctx.fillRect(s.x - 8, s.y - 5, 2, 2);
            this.ctx.fillRect(s.x + 8, s.y + 3, 2, 2);
            continue;
          } else if (placed.type === 'stone_floor') {
            this.ctx.fillStyle = (wx + wy) % 2 === 0 ? '#78889b' : '#607285';
            this.ctx.fill();
            this.ctx.strokeStyle = '#334155';
            this.ctx.lineWidth = 1.2;
            this.ctx.stroke();

            // Stone cross pavers
            this.ctx.strokeStyle = 'rgba(30, 41, 59, 0.5)';
            this.ctx.beginPath();
            this.ctx.moveTo(s.x, s.y - 12);
            this.ctx.lineTo(s.x, s.y + 12);
            this.ctx.stroke();
            continue;
          } else if (placed.type === 'iron_floor') {
            this.ctx.fillStyle = (wx + wy) % 2 === 0 ? '#475569' : '#334155';
            this.ctx.fill();
            this.ctx.strokeStyle = '#06b6d4';
            this.ctx.lineWidth = 1.5;
            this.ctx.stroke();

            // Metal grid diamond treads & corner cyan rivets
            this.ctx.fillStyle = '#38bdf8';
            this.ctx.fillRect(s.x - 12, s.y - 2, 3, 3);
            this.ctx.fillRect(s.x + 10, s.y - 2, 3, 3);
            continue;
          }
        }

        // B. Natural Map Terrain By Zone (theme-driven, low-contrast):
        if (this.currentMapId === 'world') {
          const tileTheme = worldThemeAt(wx, wy);
          const road = Math.hypot(wx, wy) >= 16 && worldIsRoad(wx, wy, 2);
          const woodlandTrail = tileTheme === 'forest' && Math.abs(wy - (22 + Math.sin(wx / 17) * 6)) < 1.1;
          this.ctx.fillStyle = road || woodlandTrail ? '#9a896b' : groundBaseColor(tileTheme, wx, wy);
          this.ctx.fill();
          this.ctx.globalAlpha = road ? 0.24 : tileTheme === 'forest' ? 0.43 : 0.36;
          if (tileTheme !== 'lake') this.drawTileTexture(wx, wy, s.x, s.y, tileTheme);
          this.ctx.globalAlpha = 1;
          this.drawWorldGroundDetail(wx, wy, s.x, s.y, tileTheme, road || woodlandTrail);
          continue;
        }
        const gkey = (theme === 'camp' || theme === 'plaza' || theme === 'field' || theme === 'urban' || theme === 'ruins' || theme === 'forest' || theme === 'quarry' || theme === 'lake' || theme === 'marsh' || theme === 'rift') ? theme : 'camp';
        if (theme === 'camp') {
          const inLivingBase = wx >= -6 && wx <= 6 && wy >= -5 && wy <= 5;
          const distToCenter = Math.hypot(wx, wy);
          if (distToCenter < 3.8) {
            this.ctx.fillStyle = groundBaseColor('plaza', wx, wy);
          } else if (inLivingBase) {
            this.ctx.fillStyle = groundBaseColor('forest', wx, wy);
          } else {
            this.ctx.fillStyle = groundBaseColor('camp', wx, wy);
          }
        } else if (theme === 'plaza') {
          this.ctx.fillStyle = groundBaseColor('plaza', wx, wy);
        } else if (theme === 'field') {
          this.ctx.fillStyle = groundBaseColor('field', wx, wy);
        } else if (theme === 'urban' || theme === 'ruins') {
          const distToExpressway = Math.abs(wx + wy);
          if (distToExpressway < 4.8) {
            this.ctx.fillStyle = groundBaseColor('urban', wx, wy);
          } else if (distToExpressway < 7.2) {
            this.ctx.fillStyle = groundBaseColor('ruins', wx, wy);
          } else {
            this.ctx.fillStyle = groundBaseColor('ruins', wx, wy);
          }
        } else if (theme === 'lake') {
          const isDock = (wx >= -2 && wx <= 4 && (wy === 0 || wy === -2 || wy === 2)) || (wx >= 1 && wx <= 3 && wy >= -3 && wy <= 3);
          if (isDock) {
            this.ctx.fillStyle = groundBaseColor('forest', wx, wy);
          } else if (wx < 3) {
            const wave = Math.sin(this.gameTime * 2.4 + wx * 0.8 + wy * 0.8);
            this.ctx.fillStyle = wave > 0 ? '#4a5862' : '#46545e';
          } else {
            this.ctx.fillStyle = groundBaseColor('marsh', wx, wy);
          }
        } else if (theme === 'marsh') {
          this.ctx.fillStyle = groundBaseColor('marsh', wx, wy);
        } else if (theme === 'quarry') {
          this.ctx.fillStyle = groundBaseColor('quarry', wx, wy);
        } else if (theme === 'forest') {
          this.ctx.fillStyle = groundBaseColor('forest', wx, wy);
        } else if (theme === 'rift') {
          if (Math.abs(wx - wy) < 1.8 || Math.abs(wx + wy) < 1.4) {
            const pulse = (Math.sin(this.gameTime * 4.5 + wx * 1.2 + wy * 1.2) + 1) * 0.5;
            this.ctx.fillStyle = pulse > 0.5 ? '#7e22ce' : '#6b21a8';
          } else {
            this.ctx.fillStyle = groundBaseColor('rift', wx, wy);
          }
        } else {
          this.ctx.fillStyle = groundBaseColor(gkey as 'camp', wx, wy);
        }

        this.ctx.fill();

        // 地砖贴图（tile-*-a/b 世界锁定采样；无图/水波/裂缝静默跳过 = 纯 flat）
        this.drawTileTexture(wx, wy, s.x, s.y, theme);

        // Only draw construction seams on human-made placed floors or camp central stonework, NEVER on natural lake/soil
        if (placed || (theme === 'camp' && Math.hypot(wx, wy) < 3.8)) {
          this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
          this.ctx.lineWidth = 1;
          this.ctx.stroke();
        }

        // --- DETAILED TILE SURFACE EMBELLISHMENTS ---
        // 1. Camp + Field:
        if (theme === 'camp' || theme === 'field') {
          const distToCenter = Math.hypot(wx, wy);
          if (distToCenter < 3.8) {
            // Central fortress stone tile paver bevels & center star
            this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
            this.ctx.strokeRect(s.x - 8, s.y - 4, 16, 8);
            if (wx === 0 && wy === 0) {
              this.ctx.fillStyle = '#38bdf8';
              this.ctx.shadowColor = '#06b6d4';
              this.ctx.shadowBlur = 12;
              this.ctx.beginPath();
              this.ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
              this.ctx.fill();
              this.ctx.shadowBlur = 0;
            }
          } else if (wx >= -6 && wx <= 6 && wy >= -5 && wy <= 5) {
            // Living quarters wood floor grain lines
            this.ctx.strokeStyle = 'rgba(67, 34, 13, 0.4)';
            this.ctx.beginPath();
            this.ctx.moveTo(s.x - 14, s.y);
            this.ctx.lineTo(s.x + 14, s.y);
            this.ctx.stroke();
            this.ctx.fillStyle = '#fef08a';
            this.ctx.fillRect(s.x - 8, s.y - 1, 2, 2);
            this.ctx.fillRect(s.x + 8, s.y - 1, 2, 2);
          } else {
            // Wild grass tufts
            if ((wx * 7 + wy * 13) % 5 === 0) {
              this.ctx.fillStyle = '#4ade80';
              this.ctx.fillRect(s.x - 2, s.y - 3, 2, 4);
              this.ctx.fillRect(s.x + 1, s.y - 4, 2, 5);
            }
            // 野花与小石子：统一用 withAlpha 低饱和点，不再用纯 #f9a8d4 高饱和方块
            const wildN = hash2Pure(wy * 3 + 11, wx * 5 + 7);
            if (wildN > 0.955) {
              this.ctx.fillStyle = withAlpha('#fde68a', 0.55);
              this.ctx.beginPath();
              this.ctx.arc(s.x + 6, s.y - 2, 1.6, 0, Math.PI * 2);
              this.ctx.fill();
            } else if (wildN < 0.045) {
              this.ctx.fillStyle = withAlpha('#94a3b8', 0.5);
              this.ctx.beginPath();
              this.ctx.arc(s.x - 7, s.y + 2, 1.4, 0, Math.PI * 2);
              this.ctx.fill();
            }
          }
        }

        // 1b. Plaza concrete joints:
        if (theme === 'plaza') {
          this.ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
          this.ctx.lineWidth = 1;
          this.ctx.strokeRect(s.x - 16, s.y - 8, 32, 16);
        }

        // 2. Highway:
        if (theme === 'urban' || theme === 'ruins') {
          const distToExp = Math.abs(wx + wy);
          if (distToExp === 0 && (wx - wy) % 2 === 0) {
            // Double yellow center dashed lines
            this.ctx.fillStyle = '#facc15';
            this.ctx.fillRect(s.x - 8, s.y - 3, 16, 2.5);
            this.ctx.fillRect(s.x - 8, s.y + 1, 16, 2.5);
          } else if (distToExp === 4) {
            // White continuous highway fog line
            this.ctx.fillStyle = '#f8fafc';
            this.ctx.fillRect(s.x - 10, s.y - 1, 20, 2);
          } else if (wx > 1 && wy < -1 && wx < 7 && wy > -7) {
            // Gas station concrete expansion joints & yellow safety stripes
            this.ctx.strokeStyle = 'rgba(30, 41, 59, 0.45)';
            this.ctx.strokeRect(s.x - 12, s.y - 6, 24, 12);
            if (wx === 2 || wy === -2) {
              this.ctx.fillStyle = '#eab308';
              this.ctx.fillRect(s.x - 4, s.y - 2, 8, 4);
            }
          } else if (distToExp < 7.2 && distToExp >= 4.8) {
            // Shoulder gravel stones
            this.ctx.fillStyle = '#94a3b8';
            this.ctx.fillRect(s.x - 3, s.y - 2, 2, 2);
            this.ctx.fillRect(s.x + 4, s.y + 1, 2, 2);
          } else if (distToExp >= 7.2) {
            // 荒漠碎石与干裂纹（城市废墟外围质感）
            const desN = this.hash2(wx * 2 + 3, wy * 2 + 9);
            if (desN > 0.86) {
              this.ctx.fillStyle = '#8a8a96';
              this.ctx.fillRect(s.x - 4, s.y - 1, 3, 2);
              this.ctx.fillRect(s.x + 3, s.y + 2, 2, 2);
            } else if (desN < 0.1) {
              this.ctx.strokeStyle = 'rgba(20, 14, 8, 0.5)';
              this.ctx.lineWidth = 1;
              this.ctx.beginPath();
              this.ctx.moveTo(s.x - 8, s.y + 2);
              this.ctx.lineTo(s.x + 2, s.y - 1);
              this.ctx.lineTo(s.x + 9, s.y + 3);
              this.ctx.stroke();
            }
          }
        }

        // 3. Pond + Marsh:
        if (theme === 'lake' || theme === 'marsh') {
          if (wx < 3) {
            if (animated) this.drawWaterShimmer(wx, wy, s.x, s.y);
          } else if (wx >= -2 && wx <= 4 && (wy === 0 || wy === -2 || wy === 2)) {
            // Wooden dock planks with bevels
            this.ctx.strokeStyle = 'rgba(67, 34, 13, 0.4)';
            this.ctx.beginPath();
            this.ctx.moveTo(s.x - 12, s.y - 4);
            this.ctx.lineTo(s.x + 12, s.y - 4);
            this.ctx.moveTo(s.x - 12, s.y + 4);
            this.ctx.lineTo(s.x + 12, s.y + 4);
            this.ctx.stroke();
          }
        }

        // 4. Forest + Quarry:
        if (theme === 'forest' || theme === 'quarry') {
          if (wx > 1) {
            // Quarry stone chisel marks & pyrite specks
            this.ctx.strokeStyle = 'rgba(51, 65, 85, 0.4)';
            this.ctx.beginPath();
            this.ctx.moveTo(s.x - 10, s.y);
            this.ctx.lineTo(s.x + 8, s.y - 2);
            this.ctx.stroke();
            this.ctx.fillStyle = '#fde047';
            this.ctx.fillRect(s.x + 2, s.y + 1, 1.5, 1.5);
          } else {
            // Forest floor fallen pine needles & wild mushrooms
            this.ctx.strokeStyle = 'rgba(120, 53, 15, 0.45)';
            this.ctx.beginPath();
            this.ctx.moveTo(s.x - 6, s.y - 2);
            this.ctx.lineTo(s.x + 4, s.y + 3);
            this.ctx.stroke();
            if ((wx * 3 + wy * 7) % 7 === 0) {
              // Bioluminescent wild mushroom dot
              this.ctx.fillStyle = '#34d399';
              this.ctx.beginPath();
              this.ctx.arc(s.x + 2, s.y - 2, 2.5, 0, Math.PI * 2);
              this.ctx.fill();
            }
          }
        }

        // 5. Rift Core:
        if (theme === 'rift') {
          if (Math.abs(wx - wy) < 1.8 || Math.abs(wx + wy) < 1.4) {
            // Rift energy fissure molten plasma core
            this.ctx.fillStyle = '#fdf4ff';
            this.ctx.beginPath();
            this.ctx.ellipse(s.x, s.y, 6, 2.5, 0, 0, Math.PI * 2);
            this.ctx.fill();
          } else {
            // 余烬火星（哈希分布，不闪烁）
            const embN = this.hash2(wx * 4 + 1, wy * 4 + 5);
            if (embN > 0.93) {
              this.ctx.fillStyle = embN > 0.97 ? '#fb923c' : '#f43f5e';
              this.ctx.fillRect(s.x - 1, s.y - 1, 2.5, 2.5);
            }
          }
        }
      }
    }

    // Camp cyan boundary perimeter
    if (theme === 'camp') {
      const anchorCenter = this.toScreen(0, 0);
      this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.75)';
      this.ctx.lineWidth = 2.5;
      this.ctx.setLineDash([10, 6]);
      this.ctx.beginPath();
      this.ctx.ellipse(anchorCenter.x, anchorCenter.y, 380, 190, -0.2, 0, Math.PI * 2);
      this.ctx.stroke();
      this.ctx.setLineDash([]);
    }

    this.ctx.restore();
  }

  private renderGroundDetails() {
    this.ctx.save();
    // 地标与噪点叠在动态水纹之上，保持码头、地基等细节可见。
    const def = SUBMAPS[this.currentMapId];
    if (def?.deco) {
      for (const d of def.deco) {
        const c1 = this.toScreen(d.x - d.w / 2, d.y - d.h / 2);
        const c2 = this.toScreen(d.x + d.w / 2, d.y - d.h / 2);
        const c3 = this.toScreen(d.x + d.w / 2, d.y + d.h / 2);
        const c4 = this.toScreen(d.x - d.w / 2, d.y + d.h / 2);
        const quad = () => {
          this.ctx.beginPath();
          this.ctx.moveTo(c1.x, c1.y);
          this.ctx.lineTo(c2.x, c2.y);
          this.ctx.lineTo(c3.x, c3.y);
          this.ctx.lineTo(c4.x, c4.y);
          this.ctx.closePath();
        };
        if (d.type === 'foundation') {
          // 倒塌建筑地基
          quad();
          this.ctx.fillStyle = 'rgba(12, 16, 24, 0.6)';
          this.ctx.fill();
          this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
          this.ctx.fillStyle = '#6b7280';
          for (let i = 0; i < 6; i++) {
            const hx = this.hash2(d.x * 10 + i, d.y * 10 - i);
            const px = c1.x + (c3.x - c1.x) * hx;
            const py = c1.y + (c3.y - c1.y) * this.hash2(d.x * 7 - i, d.y * 7 + i);
            this.ctx.fillRect(px, py, 4, 3);
          }
        } else if (d.type === 'crater') {
          // 弹坑
          const cc = this.toScreen(d.x, d.y);
          this.ctx.fillStyle = 'rgba(8, 8, 12, 0.65)';
          this.ctx.beginPath();
          this.ctx.ellipse(cc.x, cc.y, d.w * 16, d.h * 8, 0, 0, Math.PI * 2);
          this.ctx.fill();
          this.ctx.strokeStyle = 'rgba(60, 40, 25, 0.7)';
          this.ctx.lineWidth = 3;
          this.ctx.stroke();
        } else if (d.type === 'rubble') {
          // 碎石堆
          quad();
          this.ctx.fillStyle = 'rgba(90, 90, 100, 0.5)';
          this.ctx.fill();
          this.ctx.fillStyle = '#9ca3af';
          for (let i = 0; i < 5; i++) {
            const hx = this.hash2(d.x * 5 + i * 3, d.y * 5);
            this.ctx.fillRect(c4.x + (c2.x - c4.x) * hx, c4.y - 4 - i * 2, 3, 2);
          }
        } else if (d.type === 'farm') {
          // 农田：沃土 + 作物行
          quad();
          this.ctx.fillStyle = 'rgba(74, 52, 28, 0.75)';
          this.ctx.fill();
          this.ctx.strokeStyle = 'rgba(40, 26, 12, 0.8)';
          this.ctx.lineWidth = 1.5;
          this.ctx.stroke();
          this.ctx.fillStyle = '#4ade80';
          for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 5; c++) {
              const px = c1.x + ((c3.x - c1.x) * (c + 0.5)) / 5;
              const py = c1.y + ((c3.y - c1.y) * (r + 0.5)) / 3;
              this.ctx.fillRect(px - 1.5, py - 3, 3, 5);
            }
          }
        } else if (d.type === 'sandpit') {
          quad();
          this.ctx.fillStyle = 'rgba(190, 170, 120, 0.5)';
          this.ctx.fill();
        } else if (d.type === 'rockery') {
          // 假山石组
          this.ctx.fillStyle = '#5b6470';
          this.ctx.strokeStyle = '#2e3540';
          this.ctx.lineWidth = 1.5;
          for (let i = 0; i < 4; i++) {
            const hx = this.hash2(d.x * 9 + i, d.y * 9);
            const px = c4.x + (c2.x - c4.x) * (0.2 + hx * 0.6);
            const py = c4.y - 6 - i * 5;
            this.ctx.beginPath();
            this.ctx.moveTo(px - 10, py);
            this.ctx.lineTo(px - 3, py - 12);
            this.ctx.lineTo(px + 8, py - 4);
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.stroke();
          }
        }
      }
    }

    // 用少量 drawImage 平铺噪点，避免 CanvasPattern 填充在缓存更新时阻塞。
    const gtex = this.artImage('texture-ground.png');
    if (gtex && gtex.complete && gtex.naturalWidth > 0) {
      const origin = this.toScreen(0, 0);
      const startX = ((origin.x % gtex.naturalWidth) + gtex.naturalWidth) % gtex.naturalWidth - gtex.naturalWidth;
      const startY = ((origin.y % gtex.naturalHeight) + gtex.naturalHeight) % gtex.naturalHeight - gtex.naturalHeight;
      this.ctx.save();
      this.ctx.globalAlpha = 0.08;
      for (let x = startX; x < this.width; x += gtex.naturalWidth) {
        for (let y = startY; y < this.height; y += gtex.naturalHeight) {
          this.ctx.drawImage(gtex, x, y);
        }
      }
      this.ctx.restore();
    }

    this.ctx.restore();
  }

  // --- MAP SPECIFIC PROPS DRAWING ---
  private drawTruck(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 60, 28, -0.2, 0, Math.PI * 2);
    this.ctx.fill();

    // Heavy Delivery Truck Chassis
    this.ctx.fillStyle = '#1e3a8a';
    this.ctx.fillRect(s.x - 50, s.y - 45, 100, 38);
    this.ctx.strokeStyle = '#0f172a';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(s.x - 50, s.y - 45, 100, 38);

    // Truck Cab + windshield
    this.ctx.fillStyle = '#2563eb';
    this.ctx.fillRect(s.x + 35, s.y - 35, 30, 30);
    this.ctx.strokeRect(s.x + 35, s.y - 35, 30, 30);
    this.ctx.fillStyle = '#bae6fd';
    this.ctx.fillRect(s.x + 40, s.y - 31, 14, 10);
    this.ctx.strokeStyle = '#0f172a';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(s.x + 40, s.y - 31, 14, 10);
    // Headlight + bumper
    this.ctx.fillStyle = '#fef9c3';
    this.ctx.fillRect(s.x + 60, s.y - 16, 5, 6);
    this.ctx.fillStyle = '#52525b';
    this.ctx.fillRect(s.x + 34, s.y - 8, 32, 5);
    // Rust patches + cargo tarp rolls
    this.ctx.fillStyle = 'rgba(154, 52, 18, 0.75)';
    this.ctx.fillRect(s.x - 40, s.y - 40, 12, 7);
    this.ctx.fillRect(s.x - 5, s.y - 32, 9, 6);
    this.ctx.fillStyle = '#365314';
    this.ctx.fillRect(s.x - 20, s.y - 52, 22, 7);
    this.ctx.strokeStyle = '#1a2e05';
    this.ctx.lineWidth = 1.5;
    this.ctx.strokeRect(s.x - 20, s.y - 52, 22, 7);

    // Wheels
    this.ctx.fillStyle = '#18181b';
    this.ctx.beginPath();
    this.ctx.arc(s.x - 35, s.y + 4, 8, 0, Math.PI * 2);
    this.ctx.arc(s.x + 15, s.y + 4, 8, 0, Math.PI * 2);
    this.ctx.arc(s.x + 50, s.y + 4, 8, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawOilTanker(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    // Fuel Tanker Cylindrical Hull
    this.ctx.fillStyle = '#71717a';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y - 20, 55, 22, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#27272a';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();

    // Hazard Symbol
    this.ctx.fillStyle = '#dc2626';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x, s.y - 30);
    this.ctx.lineTo(s.x - 8, s.y - 18);
    this.ctx.lineTo(s.x + 8, s.y - 18);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawGasPump(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.fillStyle = '#dc2626';
    this.ctx.fillRect(s.x - 12, s.y - 36, 24, 36);
    this.ctx.strokeStyle = '#7f1d1d';
    this.ctx.strokeRect(s.x - 12, s.y - 36, 24, 36);

    // Fuel Meter Screen
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(s.x - 8, s.y - 30, 16, 10);
    this.ctx.fillStyle = '#22c55e';
    this.ctx.font = '8px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('92#', s.x, s.y - 22);
    this.ctx.restore();
  }

  private drawTireStack(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.fillStyle = '#18181b';
    for (let i = 0; i < 3; i++) {
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y - i * 8, 14, 7, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#27272a';
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawPierDock(wx: number, wy: number, length: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    // Wooden boardwalk extending across tiles
    this.ctx.fillStyle = '#854d0e';
    this.ctx.fillRect(s.x - 15, s.y - 12, length * 16, 22);
    this.ctx.strokeStyle = '#451a03';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(s.x - 15, s.y - 12, length * 16, 22);

    for (let i = 0; i < length * 2; i++) {
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - 15 + i * 8, s.y - 12);
      this.ctx.lineTo(s.x - 15 + i * 8, s.y + 10);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawSupplyChest(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    const W = 30, H = 18, D = 10; // 宽/高/进深
    // 箱体正面
    this.ctx.fillStyle = '#0b5c44';
    this.ctx.strokeStyle = '#022c22';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(s.x - W / 2, s.y - H, W, H, 3);
    this.ctx.fill();
    this.ctx.stroke();
    // 箱体顶面（等距进深）
    this.ctx.fillStyle = '#0e7a5a';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - W / 2, s.y - H);
    this.ctx.lineTo(s.x - W / 2 + 7, s.y - H - D);
    this.ctx.lineTo(s.x + W / 2 + 7, s.y - H - D);
    this.ctx.lineTo(s.x + W / 2, s.y - H);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    // 箱体右侧面
    this.ctx.fillStyle = '#084a36';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x + W / 2, s.y - H);
    this.ctx.lineTo(s.x + W / 2 + 7, s.y - H - D);
    this.ctx.lineTo(s.x + W / 2 + 7, s.y - D);
    this.ctx.lineTo(s.x + W / 2, s.y);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    // 金属包角 + 箍条
    this.ctx.fillStyle = '#78716c';
    this.ctx.fillRect(s.x - W / 2, s.y - H, 4, H);
    this.ctx.fillRect(s.x + W / 2 - 4, s.y - H, 4, H);
    this.ctx.fillStyle = withAlpha('#fde68a', 0.8);
    this.ctx.fillRect(s.x - W / 2 + 5, s.y - H + 2, 3, H - 4);
    // 锁扣
    this.ctx.fillStyle = withAlpha('#fde68a', 0.8);
    this.ctx.strokeStyle = '#713f12';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.roundRect(s.x - 4, s.y - 12, 8, 10, 2);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.fillStyle = '#713f12';
    this.ctx.fillRect(s.x - 1.5, s.y - 9, 3, 4);
    this.ctx.restore();
  }

  private drawQuarryBoulders(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    // 三块切面岩石：顶面受光 / 正面 / 侧面暗部
    const rock = (cx: number, cy: number, r: number, tone: number) => {
      const top = ['#9aa8bc', '#8b9bb0', '#7c8ba0'][tone % 3];
      const mid = ['#64748b', '#5a6a80', '#525f75'][tone % 3];
      const dark = ['#3b4759', '#334052', '#2c3849'][tone % 3];
      // 主体
      this.ctx.fillStyle = mid;
      this.ctx.strokeStyle = dark;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(cx - r, cy);
      this.ctx.lineTo(cx - r * 0.5, cy - r * 0.9);
      this.ctx.lineTo(cx + r * 0.4, cy - r * 1.0);
      this.ctx.lineTo(cx + r, cy - r * 0.2);
      this.ctx.lineTo(cx + r * 0.6, cy);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      // 顶部受光面
      this.ctx.fillStyle = top;
      this.ctx.beginPath();
      this.ctx.moveTo(cx - r * 0.5, cy - r * 0.9);
      this.ctx.lineTo(cx + r * 0.4, cy - r * 1.0);
      this.ctx.lineTo(cx + r * 0.1, cy - r * 0.55);
      this.ctx.lineTo(cx - r * 0.4, cy - r * 0.5);
      this.ctx.closePath();
      this.ctx.fill();
      // 凿痕裂缝
      this.ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.moveTo(cx - r * 0.2, cy - r * 0.85);
      this.ctx.lineTo(cx, cy - r * 0.3);
      this.ctx.lineTo(cx + r * 0.3, cy - r * 0.35);
      this.ctx.stroke();
    };
    rock(s.x - 14, s.y, 20, 0);
    rock(s.x + 14, s.y - 4, 16, 1);
    rock(s.x + 1, s.y - 14, 11, 2);
    // 苔藓点缀
    this.ctx.fillStyle = '#4ade80';
    this.ctx.fillRect(s.x - 20, s.y - 8, 3, 2);
    this.ctx.fillRect(s.x + 18, s.y - 12, 3, 2);
    this.ctx.restore();
  }

  private drawRiftMonolith(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    // Huge Floating Crystal
    const floatY = Math.sin(this.gameTime * 3) * 8;
    this.ctx.fillStyle = '#c026d3';
    this.ctx.shadowColor = '#d946ef';
    this.ctx.shadowBlur = 25;

    this.ctx.beginPath();
    this.ctx.moveTo(s.x, s.y - 70 + floatY);
    this.ctx.lineTo(s.x + 20, s.y - 35 + floatY);
    this.ctx.lineTo(s.x, s.y + floatY);
    this.ctx.lineTo(s.x - 20, s.y - 35 + floatY);
    this.ctx.closePath();
    this.ctx.fill();

    // Core ground crater with energy rings
    this.ctx.strokeStyle = '#a855f7';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 45, 20, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawRiftSpire(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.fillStyle = '#7e22ce';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 10, s.y);
    this.ctx.lineTo(s.x, s.y - 45);
    this.ctx.lineTo(s.x + 10, s.y);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  // --- STANDARD ASSETS ---
  private drawFence(wx: number, wy: number, count: number) {
    for (let i = 0; i < count; i++) {
      const s = this.toScreen(wx + i * 0.8, wy);
      this.ctx.fillStyle = '#573a24';
      this.ctx.fillRect(s.x - 3, s.y - 20, 6, 20);
      this.ctx.strokeStyle = '#2b170a';
      this.ctx.strokeRect(s.x - 3, s.y - 20, 6, 20);

      if (i < count - 1) {
        const next = this.toScreen(wx + (i + 1) * 0.8, wy);
        this.ctx.strokeStyle = '#64748b';
        this.ctx.lineWidth = 1.5;
        this.ctx.beginPath();
        this.ctx.moveTo(s.x, s.y - 14);
        this.ctx.lineTo(next.x, next.y - 14);
        this.ctx.moveTo(s.x, s.y - 6);
        this.ctx.lineTo(next.x, next.y - 6);
        this.ctx.stroke();
      }
    }
  }

  // 确定性 tile 哈希（地形噪点/饰品分布用，无随机闪烁）
  private hash2(x: number, y: number): number {
    return hash2Pure(x, y);
  }

  private drawRoadsideSign(stop: RoadsideStop) {
    const x = Math.sign(stop.x) * 5, s = this.toScreen(x, stop.y);
    const use = ROADSIDE_USES[stop.kind];
    this.ctx.save();
    if (Math.hypot(this.player.x - x, this.player.y - stop.y) < 2.5) this.ctx.globalAlpha = 0.35;
    drawSoftShadow(this.ctx, s.x, s.y, 18);
    this.ctx.fillStyle = '#735740'; this.ctx.fillRect(s.x - 3, s.y - 65, 6, 65);
    this.ctx.fillStyle = '#383e37'; this.ctx.strokeStyle = '#a18c66'; this.ctx.lineWidth = 1.5;
    this.ctx.fillRect(s.x - 78, s.y - 79, 156, 43); this.ctx.strokeRect(s.x - 78, s.y - 79, 156, 43);
    this.ctx.fillStyle = use.color; this.ctx.fillRect(s.x - 76, s.y - 77, 4, 39);
    this.ctx.textAlign = 'center'; this.ctx.font = 'bold 12px sans-serif'; this.ctx.fillStyle = '#f3e2bb';
    this.ctx.fillText(`${stop.name} ${stop.x < 0 ? '↖' : '↘'}`, s.x, s.y - 61);
    this.ctx.font = '11px sans-serif'; this.ctx.fillStyle = use.color;
    this.ctx.fillText(use.supplies, s.x, s.y - 44);
    this.ctx.restore();
  }

  private drawWorldScenery(prop: WorldScenery) {
    const s = this.toScreen(prop.x, prop.y);
    this.ctx.save();
    if (prop.kind === 'grass' || prop.kind === 'shrub') {
      this.ctx.translate(s.x, s.y); this.ctx.scale(prop.scale, prop.scale); this.ctx.translate(-s.x, -s.y);
      if (prop.kind === 'grass') this.drawWorldSprite('nature-trees.png', 'dry-grass', prop.x, prop.y, 58, 42, 2, 0.8);
      else this.drawWastelandShrub(prop.x, prop.y);
      this.ctx.restore(); return;
    }
    const size = ({ understory: 178, outcrop: 236, reeds: 174, tank: 208, rubble: 186, fence: 170 })[prop.kind] * prop.scale;
    // Test the projected silhouette as well as distance: tall foreground props
    // can hide the survivor even when their ground anchor is several tiles away.
    const player = this.toScreen(this.player.x, this.player.y);
    const overlapsPlayer = s.y >= player.y - 8 && Math.abs(s.x - player.x) < size * 0.4 && player.y - 38 >= s.y - size * 0.94 && player.y - 38 <= s.y;
    if (overlapsPlayer || Math.hypot(prop.x - this.player.x, prop.y - this.player.y) < 2.5) this.ctx.globalAlpha = 0.24;
    if (!this.drawArtFrame('world-environment-v1.png', prop.kind, s.x - size / 2, s.y - size * 0.94, size, size)) {
      if (prop.kind === 'understory' || prop.kind === 'fence') this.drawWastelandShrub(prop.x, prop.y);
      else if (prop.kind === 'reeds') this.drawReedsAndLilies(prop.x, prop.y);
      else this.drawQuarryBoulders(prop.x, prop.y);
    }
    this.ctx.restore();
  }

  // Static details are painted into the scrolling ground cache, never animated per tile.
  private drawWorldGroundDetail(wx: number, wy: number, sx: number, sy: number, theme: GroundTheme, road: boolean) {
    const noise = this.hash2(wx, wy);
    if (road) {
      this.ctx.strokeStyle = 'rgba(66,50,32,0.22)';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(sx - 9, sy - 5); this.ctx.lineTo(sx + 9, sy + 4);
      this.ctx.stroke();
    } else if (theme === 'lake' && noise > 0.6) {
      this.ctx.strokeStyle = 'rgba(171,210,204,0.38)';
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.moveTo(sx - 11, sy); this.ctx.quadraticCurveTo(sx, sy - 4, sx + 11, sy);
      this.ctx.stroke();
    } else if (theme === 'quarry' && noise > 0.55) {
      this.ctx.fillStyle = noise > 0.8 ? '#b9b8a8' : '#74786c';
      this.ctx.beginPath();
      this.ctx.moveTo(sx - 6, sy + 1); this.ctx.lineTo(sx - 1, sy - 5);
      this.ctx.lineTo(sx + 7, sy - 1); this.ctx.lineTo(sx + 3, sy + 4);
      this.ctx.closePath(); this.ctx.fill();
    } else if ((theme === 'forest' || theme === 'field') && noise > (theme === 'forest' ? 0.3 : 0.72)) {
      this.ctx.strokeStyle = theme === 'forest' ? 'rgba(141,160,96,0.5)' : 'rgba(158,156,101,0.5)';
      this.ctx.lineWidth = 1.3;
      this.ctx.beginPath();
      this.ctx.moveTo(sx - 3, sy + 3); this.ctx.lineTo(sx - 6, sy - 3);
      this.ctx.moveTo(sx, sy + 4); this.ctx.lineTo(sx + 1, sy - 5);
      this.ctx.moveTo(sx + 2, sy + 4); this.ctx.lineTo(sx + 6, sy);
      this.ctx.stroke();
    }
  }

  // --- 可交互物统一绘制：按类型调用对应模型 + 悬浮标记 + 名牌 ---
  private drawInteractable(it: InteractableEntity) {
    const s = this.toScreen(it.x, it.y);
    this.ctx.save();

    // 落地阴影
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y + 4, 30, 13, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // 可搜刮呼吸光环（靠近时更亮）
    const isNear = this.nearestInteractable?.id === it.id;
    if (isNear) {
      this.ctx.strokeStyle = 'rgba(74, 222, 128, 0.9)';
      this.ctx.lineWidth = 2.5;
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y + 4, 36, 16, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    this.ctx.restore();

    // 本体模型
    let markerIcon = '📦';
    let markerH = 58;
    switch (it.type) {
      case 'tree':
        if (this.hash2(it.x, it.y) > 0.5) this.drawPineTree(it.x, it.y);
        else this.drawOakTree(it.x, it.y);
        markerIcon = '🌲';
        markerH = 138;
        break;
      case 'boulder':
        if (!this.tryInteractableSprite('boulder', it.x, it.y)) this.drawQuarryBoulders(it.x, it.y);
        markerIcon = '🪨';
        markerH = 92;
        break;
      case 'car':
        if (!this.tryInteractableSprite('car', it.x, it.y)) this.drawCarAndWelder(it.x, it.y);
        markerIcon = '🚗';
        markerH = 84;
        break;
      case 'van': {
        const wreckKey = this.hash2(it.x, it.y) > 0.5 ? 'van2' : 'van';
        if (!this.tryInteractableSprite(wreckKey, it.x, it.y)) this.drawTruck(it.x, it.y);
      }
        markerIcon = '🚚';
        markerH = 92;
        break;
      case 'scrap':
        if (!this.tryInteractableSprite('scrap', it.x, it.y)) this.drawScrapPile(it.x, it.y);
        markerIcon = '⚙️';
        markerH = 66;
        break;
      case 'shelves':
        if (!this.tryInteractableSprite('shelves', it.x, it.y)) this.drawSupplyChest(it.x, it.y);
        markerIcon = '🗄️';
        markerH = 62;
        break;
      case 'med_cabinet':
        if (!this.tryInteractableSprite('med_cabinet', it.x, it.y)) this.drawSupplyChest(it.x, it.y);
        markerIcon = '💊';
        markerH = 62;
        break;
      case 'ammo_crate':
        if (!this.tryInteractableSprite('ammo_crate', it.x, it.y)) this.drawSupplyChest(it.x, it.y);
        markerIcon = '🎯';
        markerH = 62;
        break;
      case 'box':
        if (it.lootTable?.length === 1 && it.lootTable[0].itemId === 'wood') {
          this.ctx.save();
          this.ctx.strokeStyle = '#57412b'; this.ctx.lineWidth = 7; this.ctx.lineCap = 'round';
          for (let i = 0; i < 3; i++) {
            this.ctx.beginPath(); this.ctx.moveTo(s.x - 18 + i * 8, s.y - 4 + i * 3);
            this.ctx.lineTo(s.x + 9 + i * 6, s.y - 13 + i * 4); this.ctx.stroke();
          }
          this.ctx.restore();
          markerIcon = '🪵'; markerH = 28;
        } else if (it.lootTable?.length === 1 && it.lootTable[0].itemId === 'stone') {
          this.ctx.save();
          this.ctx.translate(s.x, s.y); this.ctx.scale(0.42, 0.42); this.ctx.translate(-s.x, -s.y);
          this.drawQuarryBoulders(it.x, it.y);
          this.ctx.restore();
          markerIcon = '🪨'; markerH = 38;
        } else {
          if (!this.tryInteractableSprite('box', it.x, it.y)) this.drawSupplyChest(it.x, it.y);
          markerIcon = '📦'; markerH = 62;
        }
        break;
      case 'workbench':
        if (!this.tryInteractableSprite('workbench', it.x, it.y)) this.drawWorkbench(it.x, it.y);
        markerIcon = '🛠️';
        markerH = 66;
        break;
      case 'campfire':
        if (!this.tryInteractableSprite('campfire', it.x, it.y)) this.drawCampfire(it.x, it.y);
        markerIcon = '🔥';
        markerH = 84;
        break;
      case 'pond':
        if (it.id.endsWith(':water:0')) {
          this.ctx.save();
          this.ctx.strokeStyle = '#a4bbb1'; this.ctx.lineWidth = 1.4;
          for (let i = 0; i < 3; i++) {
            this.ctx.beginPath(); this.ctx.ellipse(s.x, s.y, 12 + i * 7, 4 + i * 3, 0, 0, Math.PI * 2); this.ctx.stroke();
          }
          this.ctx.strokeStyle = '#94986a'; this.ctx.lineWidth = 3;
          for (let i = 0; i < 4; i++) {
            this.ctx.beginPath(); this.ctx.moveTo(s.x + 24 + i * 3, s.y + 5);
            this.ctx.lineTo(s.x + 21 + i * 5, s.y - 15 - i * 3); this.ctx.stroke();
          }
          this.ctx.restore();
        } else if (!this.tryInteractableSprite('pond', it.x, it.y)) this.drawPierDock(it.x, it.y, 2);
        markerIcon = '🎣';
        markerH = 66;
        break;
      case 'crystal':
        if (!this.tryInteractableSprite('crystal', it.x, it.y)) {
          if (this.hash2(it.y, it.x) > 0.5) this.drawRiftSpire(it.x, it.y);
          else this.drawRiftCrystallineFlora(it.x, it.y);
        }
        markerIcon = '💎';
        markerH = 104;
        break;
      default:
        this.drawSupplyChest(it.x, it.y);
        break;
    }

    // Nearby hints remain discoverable; distant scenery carries no floating UI.
    if (!isNear && (Math.hypot(it.x - this.player.x, it.y - this.player.y) > 7 || (it.stock ?? 1) <= 0)) return;
    this.ctx.save();
    const bob = Math.sin(this.gameTime * 3 + it.x * 1.7) * 4;
    const bx = s.x, by = s.y - markerH + bob;
    // 徽章底：深色圆角 + 发光描边
    this.ctx.fillStyle = 'rgba(2, 6, 23, 0.78)';
    this.ctx.strokeStyle = isNear ? '#4ade80' : 'rgba(148, 163, 184, 0.8)';
    this.ctx.lineWidth = 1.5;
    if (isNear) {
      this.ctx.shadowColor = '#4ade80';
      this.ctx.shadowBlur = 10;
    }
    this.ctx.beginPath();
    this.ctx.roundRect(bx - 13, by - 15, 26, 24, 7);
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
    this.ctx.font = '14px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(markerIcon, bx, by + 3);
    if (isNear) {
      const hasStock = isFinite(it.maxStock ?? Infinity);
      const label = hasStock ? `${it.name} [${it.stock}/${it.maxStock}]` : it.name;
      this.ctx.font = 'bold 10px sans-serif';
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
      this.ctx.strokeText(label, bx, by + 20);
      this.ctx.fillStyle = (it.stock ?? 1) > 0 ? '#4ade80' : '#f87171';
      this.ctx.fillText(label, bx, by + 20);
    }
    this.ctx.restore();
  }

  private drawHouse(members: BuildingEntity[], door: BuildingEntity | null, layer: 'back' | 'front' = 'front', roofFloors?: BuildingEntity[]) {
    drawHouseLayer(this.ctx, members, door, this.player, (x, y) => this.toScreen(x, y), layer, roofFloors);
    if (layer === 'front' && !door?.id.startsWith('world:')) {
      const bounds = houseCorners(members);
      const point = this.toScreen((bounds.x0 + bounds.x1) / 2, bounds.y1);
      const ref = door ?? members[0];
      this.drawBuildingHp(point.x, point.y - (roofFloors ? 84 : HOUSE_WALL_H) - 12, ref.hp, ref.maxHp);
    }
  }

  private drawBuilding(b: BuildingEntity) {
    if (!['wood_wall', 'stone_wall', 'iron_wall', 'glass_wall'].includes(b.type)) {
      this.drawBuildingUncached(b);
      return;
    }
    const hostile = isHostile(this.localPlayerId, b.ownerId, this.currentMapId);
    const point = this.toScreen(b.x, b.y);
    const x = Math.floor(point.x), y = Math.floor(point.y);
    // Bake the current subpixel phase, then blit on whole pixels to keep edges crisp.
    const phaseX = Math.round((point.x - x) * 1024) / 1024;
    const phaseY = Math.round((point.y - y) * 1024) / 1024;
    const key = `${b.type}:${b.facing ?? 'ew'}:${b.hp}:${b.maxHp}:${hostile}:${phaseX}:${phaseY}`;
    let image = this.wallImages.get(key);
    if (!image) {
      if (this.wallImages.size >= 32) {
        const oldest = this.wallImages.keys().next().value!;
        image = this.wallImages.get(oldest)!;
        this.wallImages.delete(oldest);
      } else {
        image = document.createElement('canvas'); image.width = 128; image.height = 96;
      }
      const context = image.getContext('2d');
      if (!context) {
        image.width = image.height = 0;
        this.drawBuildingUncached(b);
        return;
      }
      context.clearRect(0, 0, image.width, image.height);
      const previous = this.ctx;
      try {
        this.ctx = context;
        this.drawBuildingShape(b, { x: 64 + phaseX, y: 72 + phaseY });
      } catch (error) {
        image.width = image.height = 0;
        throw error;
      } finally {
        this.ctx = previous;
      }
    }
    this.wallImages.delete(key); this.wallImages.set(key, image);
    this.ctx.drawImage(image, x - 64, y - 72);
    this.drawBuildingDetails(b, point);
  }

  private drawBuildingUncached(b: BuildingEntity, s = this.toScreen(b.x, b.y)) {
    this.drawBuildingShape(b, s);
    this.drawBuildingDetails(b, s);
  }

  private drawBuildingShape(b: BuildingEntity, s: { x: number; y: number }) {
    if (isHostile(this.localPlayerId, b.ownerId, this.currentMapId) && (b.type === 'safe_door' || b.type.includes('wall') || b.type === 'turret')) {
      this.ctx.save();
      this.ctx.strokeStyle = 'rgba(239,68,68,0.9)';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(s.x - 18, s.y - 52, 36, 40);
      this.ctx.restore();
    }
    drawSoftShadow(this.ctx, s.x, s.y, b.type === 'anchor_core' ? 32 : 24);
    this.ctx.save();
    const facing = b.facing ?? 'ew';

  // 等距墙段：沿朝向轴展开的立体墙（顶面+迎光面+背光端面+端柱），ew 与 ns 在屏幕上呈不同对角线
  const drawWallSeg = (
    sx: number, baseY: number, facing: 'ew' | 'ns',
    halfLen: number, thick: number, h: number,
    cTop: string, cFront: string, cSide: string,
    trim?: 'logs' | 'mortar' | 'hazard' | 'glint',
  ) => {
    const norm = Math.hypot(2, 1);
    const u = facing === 'ew' ? { x: 2 / norm, y: 1 / norm } : { x: 2 / norm, y: -1 / norm };
    const v = facing === 'ew' ? { x: -1 / norm, y: 2 / norm } : { x: 1 / norm, y: 2 / norm };
    const P = (au: number, av: number, dy: number) => ({ x: sx + u.x * au + v.x * av, y: baseY + u.y * au + v.y * av + dy });
    const L = (a: { x: number; y: number }, c: { x: number; y: number }, t: number) => ({ x: a.x + (c.x - a.x) * t, y: a.y + (c.y - a.y) * t });
    const edge = (a: { x: number; y: number }, c: { x: number; y: number }) => {
      this.ctx.beginPath();
      this.ctx.moveTo(a.x, a.y);
      this.ctx.lineTo(c.x, c.y);
      this.ctx.stroke();
    };
    // 顶面
    const t1 = P(-halfLen, -thick / 2, -h), t2 = P(halfLen, -thick / 2, -h);
    const t3 = P(halfLen, thick / 2, -h), t4 = P(-halfLen, thick / 2, -h);
    this.ctx.fillStyle = cTop;
    this.ctx.beginPath();
    this.ctx.moveTo(t1.x, t1.y); this.ctx.lineTo(t2.x, t2.y); this.ctx.lineTo(t3.x, t3.y); this.ctx.lineTo(t4.x, t4.y);
    this.ctx.closePath(); this.ctx.fill();
    this.ctx.strokeStyle = 'rgba(0,0,0,0.45)'; this.ctx.lineWidth = 1.5; this.ctx.stroke();
    // 迎光面
    const f3 = P(halfLen, thick / 2, 0), f4 = P(-halfLen, thick / 2, 0);
    this.ctx.fillStyle = cFront;
    this.ctx.beginPath();
    this.ctx.moveTo(t4.x, t4.y); this.ctx.lineTo(t3.x, t3.y); this.ctx.lineTo(f3.x, f3.y); this.ctx.lineTo(f4.x, f4.y);
    this.ctx.closePath(); this.ctx.fill(); this.ctx.stroke();
    // 背光端面
    const eb = P(halfLen, -thick / 2, 0);
    this.ctx.fillStyle = cSide;
    this.ctx.beginPath();
    this.ctx.moveTo(t2.x, t2.y); this.ctx.lineTo(t3.x, t3.y); this.ctx.lineTo(f3.x, f3.y); this.ctx.lineTo(eb.x, eb.y);
    this.ctx.closePath(); this.ctx.fill(); this.ctx.stroke();
    // 端柱
    for (const sgn of [-1, 1]) {
      const px = sx + u.x * halfLen * sgn, py = baseY + u.y * halfLen * sgn;
      this.ctx.fillStyle = 'rgba(0,0,0,0.5)';
      this.ctx.fillRect(px - 4, py - h - 8, 8, h + 8);
      this.ctx.fillStyle = cSide;
      this.ctx.fillRect(px - 4, py - h - 8, 8, 4);
    }
    // 饰条
    this.ctx.lineWidth = 2;
    if (trim === 'hazard') {
      this.ctx.strokeStyle = '#f59e0b';
      edge(L(t4, f4, 0.55), L(t3, f3, 0.55));
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = 4;
      for (const t of [0.3, 0.5, 0.7]) {
        const a = L(L(t4, f4, 0.45), L(t3, f3, 0.45), t);
        const c = L(L(t4, f4, 0.75), L(t3, f3, 0.75), t);
        edge(a, c);
      }
    } else if (trim === 'mortar') {
      this.ctx.strokeStyle = 'rgba(30,41,59,0.7)';
      this.ctx.lineWidth = 1.5;
      edge(L(t4, f4, 0.33), L(t3, f3, 0.33));
      edge(L(t4, f4, 0.66), L(t3, f3, 0.66));
    } else if (trim === 'logs') {
      this.ctx.strokeStyle = 'rgba(69,26,3,0.7)';
      this.ctx.lineWidth = 1.5;
      for (const t of [0.25, 0.5, 0.75]) {
        edge(L(t4, t3, t), L(f4, f3, t));
      }
    } else if (trim === 'glint') {
      this.ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      this.ctx.lineWidth = 1.5;
      edge(L(t1, t2, 0.3), L(t4, t3, 0.3));
    }
  };

    // 落地阴影（所有建筑统一）
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y + 3, 26, 12, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const isRuin = b.hp < b.maxHp;
    const ruinH = b.type === 'iron_wall' ? (isRuin ? 22 : 40) : (isRuin ? 20 : 36);
    if (b.type === 'wood_wall') {
      // 加固原木围墙：低矮原木段（朝向决定对角线方向）
      drawWallSeg(s.x, s.y, facing, 34, 13, 30, '#b07a3f', '#7c4a1e', '#5a3413', 'logs');
      this.drawBuildingHp(s.x, s.y - 44, b.hp, b.maxHp);
    } else if (b.type === 'stone_wall') {
      // 厚重条石墙
      drawWallSeg(s.x, s.y, facing, 36, 15, ruinH, '#8b99ad', '#64748b', '#475569', 'mortar');
      this.drawBuildingHp(s.x, s.y - 50, b.hp, b.maxHp);
    } else if (b.type === 'iron_wall') {
      // 战术重合金墙
      drawWallSeg(s.x, s.y, facing, 36, 14, ruinH, '#5b6b80', '#475569', '#2f3b4d', 'hazard');
      this.drawBuildingHp(s.x, s.y - 54, b.hp, b.maxHp);
    } else if (b.type === 'glass_wall') {
      // 钢化玻璃观察墙
      drawWallSeg(s.x, s.y, facing, 34, 10, 34, 'rgba(186,230,253,0.85)', 'rgba(56,189,248,0.35)', 'rgba(2,132,199,0.4)', 'glint');
      this.drawBuildingHp(s.x, s.y - 48, b.hp, b.maxHp);
    } else if (b.type === 'door') {
      // 自动防卫电控门：门框 + 开合扇叶（开=转90°收到侧面，可穿行）
      drawWallSeg(s.x, s.y, facing, 36, 12, 44, '#3b4a5e', '#2b3648', '#1d2634');
      if (!b.isOpen) {
        drawWallSeg(s.x, s.y, facing, 20, 8, 36, '#5b7a99', '#3d5a76', '#2a3f55', 'glint');
      } else {
        const flipped = facing === 'ew' ? 'ns' : 'ew';
        const norm = Math.hypot(2, 1);
        const ox = (2 / norm) * 26;
        const oy = ((facing === 'ew' ? 1 : -1) / norm) * 26;
        drawWallSeg(s.x + ox, s.y + oy, flipped, 20, 8, 36, '#5b7a99', '#3d5a76', '#2a3f55', 'glint');
      }
      // 状态灯
      this.ctx.fillStyle = b.isOpen ? '#34d399' : '#ef4444';
      this.ctx.shadowColor = b.isOpen ? '#34d399' : '#ef4444';
      this.ctx.shadowBlur = 8;
      this.ctx.fillRect(s.x + 30, s.y - 56, 5, 5);
      this.ctx.shadowBlur = 0;
      this.ctx.fillStyle = b.isOpen ? '#34d399' : '#38bdf8';
      this.ctx.font = 'bold 9px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(b.isOpen ? 'OPEN · 可进入' : 'LOCKED', s.x, s.y - 20);
      this.drawBuildingHp(s.x, s.y - 62, b.hp, b.maxHp);
    } else if (b.type === 'safe_door') {
      // 高耐久防爆安全门：顺墙体朝向的门框 + 开合扇叶
      const isBreached = b.hp <= 0;
      drawWallSeg(s.x, s.y, facing, 46, 16, 12, '#2b3648', '#1e293b', '#141c28');
      // 门楣
      this.ctx.fillStyle = '#334155';
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = 1.5;
      this.ctx.fillRect(s.x - 40, s.y - 64, 80, 9);
      this.ctx.strokeRect(s.x - 40, s.y - 64, 80, 9);

      if (!b.isOpen && !isBreached) {
        // 关闭的扇叶（顺墙向）
        drawWallSeg(s.x, s.y, facing, 24, 9, 52, '#5b6b80', '#475569', '#2f3b4d', 'hazard');
        // 红色闭锁灯
        this.ctx.fillStyle = '#ef4444';
        this.ctx.shadowColor = '#ef4444';
        this.ctx.shadowBlur = 8;
        this.ctx.fillRect(s.x + 28, s.y - 58, 5, 5);
        this.ctx.shadowBlur = 0;
        // 受损裂纹
        if (b.hp < b.maxHp) {
          this.ctx.strokeStyle = '#f97316';
          this.ctx.lineWidth = 1.4;
          this.ctx.beginPath();
          this.ctx.moveTo(s.x - 8, s.y - 40);
          this.ctx.lineTo(s.x - 2, s.y - 30);
          this.ctx.lineTo(s.x + 3, s.y - 32);
          this.ctx.stroke();
        }
      } else {
        // 开启：扇叶转90°收到侧面，可穿行进入
        const flipped = facing === 'ew' ? 'ns' : 'ew';
        const norm = Math.hypot(2, 1);
        const ox = (2 / norm) * 30;
        const oy = ((facing === 'ew' ? 1 : -1) / norm) * 30;
        drawWallSeg(s.x + ox, s.y + oy, flipped, 24, 9, 52, '#3f5c50', '#2f4a3e', '#223529');
        this.ctx.fillStyle = '#22c55e';
        this.ctx.shadowColor = '#22c55e';
        this.ctx.shadowBlur = 8;
        this.ctx.fillRect(s.x + 28, s.y - 58, 5, 5);
        this.ctx.shadowBlur = 0;

        if (isBreached) {
          this.ctx.fillStyle = '#ef4444';
          this.ctx.font = 'bold 8.5px sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.fillText('💥 已破拆攻陷', s.x, s.y - 20);
        } else {
          this.ctx.fillStyle = '#34d399';
          this.ctx.font = 'bold 8.5px sans-serif';
          this.ctx.textAlign = 'center';
          this.ctx.fillText('OPEN · 可进入', s.x, s.y - 20);
        }
      }

      // Owner tag
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.font = 'bold 9px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(b.ownerName ? `[${b.ownerName}]` : '安全防爆闸门', s.x, s.y - 58);
      this.drawBuildingHp(s.x, s.y - 54, b.hp, b.maxHp);
    } else if (b.type === 'storage_box') {
      if (!this.tryBuildingSprite('storage_box', b.x, b.y)) {
      // Territory Storage Chest
      this.ctx.fillStyle = '#1e3a5f';
      this.ctx.strokeStyle = '#0284c7';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.roundRect(s.x - 15, s.y - 20, 30, 20, 3);
      this.ctx.fill();
      this.ctx.stroke();

      // Gold lock latch
      this.ctx.fillStyle = '#facc15';
      this.ctx.fillRect(s.x - 4, s.y - 13, 8, 9);
      }
      this.drawBuildingHp(s.x, s.y - 26, b.hp, b.maxHp);
    } else if (b.type === 'workbench') {
      if (!this.tryBuildingSprite('workbench', b.x, b.y)) {
      // Engineering Workbench
      this.ctx.fillStyle = '#451a03';
      this.ctx.strokeStyle = '#27170b';
      this.ctx.lineWidth = 2;
      this.ctx.fillRect(s.x - 18, s.y - 16, 36, 16);
      this.ctx.strokeRect(s.x - 18, s.y - 16, 36, 16);

      // Tabletop vice & blueprint roll
      this.ctx.fillStyle = '#64748b';
      this.ctx.fillRect(s.x - 12, s.y - 22, 8, 6);
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.fillRect(s.x + 2, s.y - 20, 10, 4);
      }
      this.drawBuildingHp(s.x, s.y - 26, b.hp, b.maxHp);
    } else if (b.type === 'electric_core') {
      // Electromagnetic Shock Core
      this.ctx.fillStyle = '#0f172a';
      this.ctx.fillRect(s.x - 12, s.y - 10, 24, 10);

      const pulse = Math.sin(this.gameTime * 6) * 3;
      this.ctx.fillStyle = '#06b6d4';
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 18;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y - 24, 10 + pulse * 0.5, 0, Math.PI * 2);
      this.ctx.fill();

      // Electric spark arcs
      this.ctx.strokeStyle = '#a5f3fc';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y - 24, 16, this.gameTime * 4, this.gameTime * 4 + 1.2);
      this.ctx.stroke();
      this.drawBuildingHp(s.x, s.y - 38, b.hp, b.maxHp);
    } else if (b.type === 'flame_core') {
      // High-Temperature Thermal Core
      this.ctx.fillStyle = '#431407';
      this.ctx.fillRect(s.x - 12, s.y - 10, 24, 10);

      const flamePulse = Math.sin(this.gameTime * 8) * 3;
      this.ctx.fillStyle = '#f97316';
      this.ctx.shadowColor = '#ea580c';
      this.ctx.shadowBlur = 18;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y - 24, 9 + flamePulse * 0.5, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#fef08a';
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y - 24, 4, 0, Math.PI * 2);
      this.ctx.fill();
      this.drawBuildingHp(s.x, s.y - 38, b.hp, b.maxHp);
    } else if (b.type === 'turret') {
      if (!this.tryBuildingSprite('turret', b.x, b.y)) {
      // Automated Turret
      this.ctx.fillStyle = '#1e293b';
      this.ctx.fillRect(s.x - 14, s.y - 10, 28, 10);

      this.ctx.fillStyle = '#0284c7';
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y - 22, 10, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.stroke();

      this.ctx.fillStyle = '#0f172a';
      this.ctx.fillRect(s.x - 12, s.y - 25, 24, 6);

      this.ctx.fillStyle = '#38bdf8';
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 10;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y - 22, 4, 0, Math.PI * 2);
      this.ctx.fill();
      }
      this.drawBuildingHp(s.x, s.y - 36, b.hp, b.maxHp);
    } else if (b.type === 'spikes') {
      // Ground Spikes
      this.ctx.fillStyle = '#475569';
      for (let i = -12; i <= 12; i += 8) {
        this.ctx.beginPath();
        this.ctx.moveTo(s.x + i, s.y);
        this.ctx.lineTo(s.x + i + 4, s.y - 16);
        this.ctx.lineTo(s.x + i + 8, s.y);
        this.ctx.closePath();
        this.ctx.fill();
      }
      this.drawBuildingHp(s.x, s.y - 22, b.hp, b.maxHp);
    } else if (b.type === 'campfire') {
      this.drawCampfire(b.x, b.y);
    } else if (['bed', 'farm_plot', 'furnace', 'research_table'].includes(b.type)) {
      this.ctx.fillStyle = b.type === 'farm_plot' ? '#5c4330' : b.type === 'furnace' ? '#69717a' : '#755b43';
      this.ctx.fillRect(s.x - 23, s.y - 21, 46, 25);
      this.ctx.strokeStyle = '#1f2937'; this.ctx.lineWidth = 2;
      this.ctx.strokeRect(s.x - 23, s.y - 21, 46, 25);
      if (b.type === 'bed') {
        this.ctx.fillStyle = '#adbdab'; this.ctx.fillRect(s.x - 19, s.y - 18, 38, 15);
        this.ctx.fillStyle = '#e0ddcf'; this.ctx.fillRect(s.x - 18, s.y - 17, 11, 13);
      } else if (b.type === 'farm_plot') {
        this.ctx.strokeStyle = '#2c2019'; this.ctx.lineWidth = 2;
        for (let row = -14; row < 0; row += 7) { this.ctx.beginPath(); this.ctx.moveTo(s.x - 20, s.y + row); this.ctx.lineTo(s.x + 20, s.y + row); this.ctx.stroke(); }
        if (b.production) { this.ctx.fillStyle = '#89b65d'; for (let x = -15; x <= 15; x += 10) this.ctx.fillRect(s.x + x, s.y - 13, 4, 10); }
      } else if (b.type === 'furnace') {
        this.ctx.fillStyle = '#252b30'; this.ctx.fillRect(s.x - 17, s.y - 45, 34, 31);
        this.ctx.fillStyle = b.production ? '#e89a43' : '#51443a'; this.ctx.fillRect(s.x - 10, s.y - 30, 20, 13);
      } else {
        this.ctx.fillStyle = '#b6c4ba'; this.ctx.fillRect(s.x - 12, s.y - 24, 23, 12);
        this.ctx.fillStyle = '#7aa7b8'; this.ctx.fillRect(s.x - 7, s.y - 23, 13, 10);
      }
      this.ctx.font = 'bold 10px sans-serif'; this.ctx.textAlign = 'center'; this.ctx.fillStyle = '#ece5cf'; this.ctx.fillText(b.name, s.x, s.y - 52);
      if (b.hp < b.maxHp) this.drawBuildingHp(s.x, s.y - 62, b.hp, b.maxHp);
    } else if (b.type === 'anchor_core') {
      if (!this.tryBuildingSprite('anchor_core', b.x, b.y)) {
      this.ctx.fillStyle = '#0369a1';
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - 12, s.y);
      this.ctx.lineTo(s.x, s.y - 48);
      this.ctx.lineTo(s.x + 12, s.y);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      const floatH = Math.sin(this.gameTime * 3) * 6;
      this.ctx.fillStyle = '#38bdf8';
      this.ctx.shadowColor = '#06b6d4';
      this.ctx.shadowBlur = 15;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y - 58 + floatH, 6, 0, Math.PI * 2);
      this.ctx.fill();
      }
    }

    this.ctx.restore();
  }

  private drawBuildingDetails(b: BuildingEntity, s: { x: number; y: number }) {
    if (b.type === 'safe_door' || this.nearestBuilding?.id !== b.id) return;
    this.ctx.save();
    // 通用名牌：名称 + 归属 + 等级（安全门已有专属大战报式名牌，此处补通用版）
    if (this.nearestBuilding?.id === b.id) {
      const label = b.ownerName ? `${b.name} · ${b.ownerName}` : b.name;
      const lvl = b.level > 1 ? ` Lv.${b.level}` : '';
      this.ctx.font = 'bold 9px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.lineWidth = 3;
      this.ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)';
      this.ctx.strokeText(label + lvl, s.x, s.y - 62);
      this.ctx.fillStyle = b.ownerId === this.localPlayerId ? '#4ade80' : '#e2e8f0';
      this.ctx.fillText(label + lvl, s.x, s.y - 62);
      // 受损冒烟
      if (b.maxHp > 0 && b.hp / b.maxHp < 0.4) {
        const sway = Math.sin(this.gameTime * 5 + b.x) * 3;
        this.ctx.fillStyle = 'rgba(100, 116, 139, 0.55)';
        this.ctx.beginPath();
        this.ctx.arc(s.x + sway, s.y - 48, 7, 0, Math.PI * 2);
        this.ctx.arc(s.x - sway, s.y - 58, 5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }
    this.ctx.restore();
  }

  private drawBuildingHp(x: number, y: number, hp: number, maxHp: number) {
    const barW = 46;
    const barH = 5;
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
    this.ctx.fillRect(x - barW / 2, y, barW, barH);
    const ratio = Math.max(0, Math.min(1, hp / maxHp));
    this.ctx.fillStyle = healthBarColor(ratio);
    this.ctx.fillRect(x - barW / 2, y, barW * ratio, 5);
    this.ctx.strokeStyle = '#0f172a';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(x - barW / 2, y, barW, barH);
  }

  private drawBuildGhost() {
    const snapX = Math.round(this.mouse.worldX);
    const snapY = Math.round(this.mouse.worldY);
    const s = this.toScreen(snapX, snapY);
    const range = this.callbacks.onGameAction ? 3 : 4.5;
    const tooFar = Math.hypot(this.player.x - snapX, this.player.y - snapY) > range;
    const obstructed = !tooFar && !!this.callbacks.onGameAction && !hasLineOfSight(this.player, { x: snapX, y: snapY }, this.buildings);
    const warning = tooFar ? `距离过远，请靠近至 ${range} 格内` : obstructed ? '目标被建筑遮挡，请绕到旁边' : null;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.moveTo(s.x, s.y - this.TILE_H / 2);
    this.ctx.lineTo(s.x + this.TILE_W / 2, s.y);
    this.ctx.lineTo(s.x, s.y + this.TILE_H / 2);
    this.ctx.lineTo(s.x - this.TILE_W / 2, s.y);
    this.ctx.closePath();

    this.ctx.fillStyle = warning ? 'rgba(239, 68, 68, 0.45)' : 'rgba(6, 182, 212, 0.45)';
    this.ctx.fill();
    this.ctx.strokeStyle = warning ? '#f87171' : '#38bdf8';
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([4, 4]);
    this.ctx.stroke();

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.textAlign = 'center';
    const facingLabel = this.buildFacing === 'ew' ? '东西⟷' : '南北';
    const name = BUILD_RECIPES[this.selectedBuildType as keyof typeof BUILD_RECIPES]?.name ?? '建筑';
    this.ctx.fillText(`放置: ${name} [${facingLabel}·R旋转]`, s.x, s.y - 28);
    if (warning) {
      this.ctx.fillStyle = '#fca5a5';
      this.ctx.fillText(warning, s.x, s.y - 44);
    }
    this.ctx.restore();
  }

  // --- HIGH-FIDELITY ISOMETRIC FLORA & PROPS RENDERING ---
  public drawPineTree(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    // 美术贴图优先（nature-trees.png pine 帧；inset 1 吃掉切图红边），失败回退 procedural
    if (this.drawArtFrame('nature-trees.png', 'pine', s.x - 32, s.y - 96, 64, 96, 0)) {
      drawSoftShadow(this.ctx, s.x + 4, s.y + 4, 28);
      return;
    }
    this.ctx.save();

    // Natural ambient soft ground shadow
    drawSoftShadow(this.ctx, s.x + 4, s.y + 4, 28);

    // Realistic gnarled pine trunk with bark crevices and root flare
    this.ctx.fillStyle = '#3a2013';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 7, s.y);
    this.ctx.lineTo(s.x - 4, s.y - 38);
    this.ctx.lineTo(s.x + 4, s.y - 38);
    this.ctx.lineTo(s.x + 8, s.y);
    this.ctx.closePath();
    this.ctx.fill();

    // Trunk bark highlights
    this.ctx.strokeStyle = withAlpha('#d6a97c', 0.6);
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 2, s.y - 4);
    this.ctx.lineTo(s.x - 1, s.y - 34);
    this.ctx.stroke();

    // Multi-tiered dense coniferous needle foliage with branch volume
    const wind = Math.sin(this.gameTime * 2.0 + wx * 0.7) * 2.5;
    const boughs = [
      { y: s.y - 32, w: 46, h: 36, colBase: '#0d381e', colLight: '#166534', ridge: '#22c55e' },
      { y: s.y - 58, w: 38, h: 34, colBase: '#14532d', colLight: '#15803d', ridge: '#4ade80' },
      { y: s.y - 84, w: 28, h: 30, colBase: '#166534', colLight: '#16a34a', ridge: '#86efac' },
      { y: s.y - 108, w: 16, h: 26, colBase: '#15803d', colLight: '#22c55e', ridge: '#bbf7d0' },
    ];

    boughs.forEach((b) => {
      // Shaded bottom underside
      this.ctx.fillStyle = b.colBase;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x + wind * 0.5, b.y - b.h);
      this.ctx.lineTo(s.x - b.w + wind * 0.2, b.y);
      this.ctx.lineTo(s.x + b.w + wind * 0.8, b.y);
      this.ctx.closePath();
      this.ctx.fill();

      // Sunlit front leaf clusters
      this.ctx.fillStyle = b.colLight;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x + wind * 0.5, b.y - b.h);
      this.ctx.lineTo(s.x - b.w * 0.6, b.y - 4);
      this.ctx.lineTo(s.x + b.w * 0.8, b.y);
      this.ctx.closePath();
      this.ctx.fill();

      // Needle cluster tips
      this.ctx.strokeStyle = b.ridge;
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - b.w + 6, b.y - 2);
      this.ctx.lineTo(s.x, b.y - b.h + 6);
      this.ctx.lineTo(s.x + b.w - 6, b.y - 2);
      this.ctx.stroke();

      // Sun flecks on needles
      this.ctx.fillStyle = 'rgba(187, 247, 208, 0.5)';
      this.ctx.fillRect(s.x + wind * 0.6 + 4, b.y - b.h + 8, 3, 2);
      this.ctx.fillRect(s.x + wind * 0.6 - 10, b.y - 10, 2.5, 2);
    });

    this.ctx.restore();
  }

  public drawOakTree(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    // 美术贴图优先（nature-trees.png oak 帧；inset 1 吃掉切图红边），失败回退 procedural
    if (this.drawArtFrame('nature-trees.png', 'oak', s.x - 38, s.y - 88, 76, 88, 0)) {
      this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y, 38, 18, 0, 0, Math.PI * 2);
      this.ctx.fill();
      return;
    }
    this.ctx.save();

    // Ground shadow
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 38, 18, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Sturdy twisted trunk
    this.ctx.fillStyle = '#422817';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 8, s.y);
    this.ctx.lineTo(s.x - 5, s.y - 42);
    this.ctx.lineTo(s.x + 5, s.y - 42);
    this.ctx.lineTo(s.x + 8, s.y);
    this.ctx.closePath();
    this.ctx.fill();

    // Dense organic broadleaf canopy domes
    const clusters = [
      { ox: -16, oy: -55, r: 24, col: '#166534' },
      { ox: 16, oy: -58, r: 22, col: '#15803d' },
      { ox: 0, oy: -75, r: 26, col: '#16a34a' },
      { ox: -8, oy: -70, r: 20, col: '#22c55e' },
    ];
    clusters.forEach((c) => {
      this.ctx.fillStyle = c.col;
      this.ctx.beginPath();
      this.ctx.arc(s.x + c.ox, s.y + c.oy, c.r, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(5, 46, 22, 0.4)';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();
      // 受光面高光
      this.ctx.fillStyle = withAlpha('#86efac', 0.45);
      this.ctx.beginPath();
      this.ctx.arc(s.x + c.ox - c.r * 0.25, s.y + c.oy - c.r * 0.3, c.r * 0.45, 0, Math.PI * 2);
      this.ctx.fill();
    });

    this.ctx.restore();
  }

  public drawReedsAndLilies(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();

    // Floating water lily pads
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * 12;
      const oy = (i % 2) * 6;
      this.ctx.fillStyle = '#15803d';
      this.ctx.beginPath();
      this.ctx.ellipse(s.x + ox, s.y + oy, 9, 5, 0.2, 0, Math.PI * 2);
      this.ctx.fill();

      // Tiny white/pink lotus flower
      if (i === 1) {
        this.ctx.fillStyle = '#fbcfe8';
        this.ctx.beginPath();
        this.ctx.arc(s.x + ox, s.y + oy - 3, 3.5, 0, Math.PI * 2);
        this.ctx.fill();
      }
    }

    // Slender wetland cattails swaying in the wind
    const sway = Math.sin(this.gameTime * 3 + wx) * 3;
    const stalks = [-8, -2, 5, 11];
    stalks.forEach((sx, idx) => {
      const h = 26 + (idx % 3) * 6;
      // Stalk
      this.ctx.strokeStyle = '#22c55e';
      this.ctx.lineWidth = 1.5;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x + sx, s.y);
      this.ctx.quadraticCurveTo(s.x + sx + sway * 0.5, s.y - h * 0.5, s.x + sx + sway, s.y - h);
      this.ctx.stroke();

      // Brown cattail sausage head
      this.ctx.fillStyle = '#78350f';
      this.ctx.beginPath();
      this.ctx.roundRect(s.x + sx + sway - 2, s.y - h, 4, 10, 2);
      this.ctx.fill();
    });

    this.ctx.restore();
  }

  public drawRiftCrystallineFlora(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();

    // Bioluminescent void crystal cluster
    const pulse = (Math.sin(this.gameTime * 4 + wx * 2) + 1) * 0.5;
    this.ctx.fillStyle = 'rgba(192, 38, 211, 0.35)';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 22, 10, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Spiky crystal prisms
    const crystals = [
      { h: 32, ox: 0, w: 7, col: '#c026d3' },
      { h: 24, ox: -10, w: 5, col: '#a855f7' },
      { h: 22, ox: 9, w: 6, col: '#e879f9' },
    ];
    crystals.forEach((c) => {
      this.ctx.fillStyle = c.col;
      this.ctx.shadowColor = '#d946ef';
      this.ctx.shadowBlur = 12 * pulse;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x + c.ox, s.y - c.h);
      this.ctx.lineTo(s.x + c.ox + c.w, s.y);
      this.ctx.lineTo(s.x + c.ox - c.w, s.y);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.strokeStyle = '#f5d0fe';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    });

    this.ctx.restore();
  }

  public drawWastelandShrub(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    if (this.drawWorldSprite('nature-trees.png', 'dry-grass', wx, wy, 36, 34, 2)) {
      drawSoftShadow(this.ctx, s.x, s.y, 14);
      return;
    }
    this.ctx.save();
    drawSoftShadow(this.ctx, s.x, s.y, 14);
    // 主丛：冷灰绿，左上受光
    this.ctx.fillStyle = '#4b5548';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y - 6, 14, 8, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.fillStyle = withAlpha('#a7c4a0', 0.7);
    this.ctx.beginPath();
    this.ctx.ellipse(s.x - 4, s.y - 9, 7, 4, -0.3, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#1c1917';
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y - 6, 14, 8, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawTree(wx: number, wy: number) {
    this.drawPineTree(wx, wy);
  }

  private drawWatchtower(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.strokeStyle = '#78350f';
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 25, s.y);
    this.ctx.lineTo(s.x - 18, s.y - 95);
    this.ctx.moveTo(s.x + 25, s.y);
    this.ctx.lineTo(s.x + 18, s.y - 95);
    this.ctx.moveTo(s.x, s.y + 8);
    this.ctx.lineTo(s.x, s.y - 90);
    this.ctx.stroke();

    this.ctx.fillStyle = '#5c3a21';
    this.ctx.fillRect(s.x - 26, s.y - 120, 52, 28);
    this.ctx.strokeStyle = '#27170b';
    this.ctx.strokeRect(s.x - 26, s.y - 120, 52, 28);

    this.ctx.fillStyle = '#64748b';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 32, s.y - 120);
    this.ctx.lineTo(s.x, s.y - 145);
    this.ctx.lineTo(s.x + 32, s.y - 120);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawCampfire(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.fillStyle = '#64748b';
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      this.ctx.beginPath();
      this.ctx.ellipse(s.x + Math.cos(angle) * 18, s.y + Math.sin(angle) * 10, 6, 4, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();
    }

    this.ctx.fillStyle = '#451a03';
    this.ctx.fillRect(s.x - 12, s.y - 5, 24, 6);

    const flicker = Math.sin(this.gameTime * 12) * 4;
    const flameH = 22 + flicker;

    const grad = this.ctx.createRadialGradient(s.x, s.y - 8, 2, s.x, s.y - 14, 18);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(0.4, '#f97316');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');

    this.ctx.fillStyle = grad;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 12, s.y);
    this.ctx.quadraticCurveTo(s.x - 8, s.y - flameH * 0.7, s.x, s.y - flameH);
    this.ctx.quadraticCurveTo(s.x + 8, s.y - flameH * 0.7, s.x + 12, s.y);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawCarAndWelder(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 50, 24, -0.3, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#6b4f3b';
    this.ctx.strokeStyle = '#332317';
    this.ctx.lineWidth = 2;

    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 45, s.y - 12);
    this.ctx.lineTo(s.x - 10, s.y - 32);
    this.ctx.lineTo(s.x + 35, s.y - 18);
    this.ctx.lineTo(s.x + 28, s.y + 10);
    this.ctx.lineTo(s.x - 30, s.y + 15);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#4c3526';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 22, s.y - 25);
    this.ctx.lineTo(s.x - 5, s.y - 48);
    this.ctx.lineTo(s.x + 20, s.y - 40);
    this.ctx.lineTo(s.x + 22, s.y - 20);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawScrapPile(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.fillStyle = '#475569';
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 2;

    for (let i = 0; i < 5; i++) {
      const ox = (i - 2) * 12;
      const oy = (i % 2) * 6;
      this.ctx.fillStyle = i % 2 === 0 ? '#64748b' : '#475569';
      this.ctx.fillRect(s.x + ox - 14, s.y + oy - 14, 28, 14);
      this.ctx.strokeRect(s.x + ox - 14, s.y + oy - 14, 28, 14);
    }

    this.ctx.fillStyle = '#9a3412';
    this.ctx.beginPath();
    this.ctx.arc(s.x - 8, s.y - 12, 8, 0, Math.PI * 2);
    this.ctx.fill();

    const dist = Math.hypot(this.player.x - wx, this.player.y - wy);
    if (dist < 2.4) {
      this.ctx.strokeStyle = '#38bdf8';
      this.ctx.lineWidth = 2;
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 12;
      this.ctx.strokeRect(s.x - 30, s.y - 20, 60, 28);
    }
    this.ctx.restore();
  }

  private drawWorkbench(wx: number, wy: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y + 14, 36, 12, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // 桌腿
    this.ctx.fillStyle = '#3a2410';
    this.ctx.fillRect(s.x - 28, s.y - 4, 7, 20);
    this.ctx.fillRect(s.x + 21, s.y - 4, 7, 20);
    // 桌面正面
    this.ctx.fillStyle = '#7a4a1f';
    this.ctx.strokeStyle = '#361e0b';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.roundRect(s.x - 30, s.y - 20, 60, 16, 2);
    this.ctx.fill();
    this.ctx.stroke();
    // 桌面顶面
    this.ctx.fillStyle = '#96612c';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 30, s.y - 20);
    this.ctx.lineTo(s.x - 22, s.y - 28);
    this.ctx.lineTo(s.x + 38, s.y - 28);
    this.ctx.lineTo(s.x + 30, s.y - 20);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    // 木纹
    this.ctx.strokeStyle = 'rgba(54, 30, 11, 0.6)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 24, s.y - 24);
    this.ctx.lineTo(s.x + 32, s.y - 24);
    this.ctx.stroke();
    // 台钳
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(s.x - 22, s.y - 36, 12, 8);
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.strokeRect(s.x - 22, s.y - 36, 12, 8);
    this.ctx.fillStyle = '#94a3b8';
    this.ctx.fillRect(s.x - 19, s.y - 34, 3, 4);
    this.ctx.fillRect(s.x - 13, s.y - 34, 3, 4);
    // 图纸卷
    this.ctx.fillStyle = '#e0f2fe';
    this.ctx.fillRect(s.x + 4, s.y - 33, 16, 5);
    this.ctx.fillStyle = '#0284c7';
    this.ctx.fillRect(s.x + 4, s.y - 31, 16, 1.5);
    // 台灯暖光
    this.ctx.fillStyle = '#fbbf24';
    this.ctx.shadowColor = '#fbbf24';
    this.ctx.shadowBlur = 10;
    this.ctx.beginPath();
    this.ctx.arc(s.x + 28, s.y - 34, 3.5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = '#451a03';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x + 28, s.y - 30);
    this.ctx.lineTo(s.x + 28, s.y - 24);
    this.ctx.stroke();
    this.ctx.restore();
  }

  // --- HIGH-FIDELITY ISOMETRIC MONSTER ENGINE ---
  private drawMonster(m: MonsterEntity) {
    const s = this.toScreen(m.x, m.y);
    this.ctx.save();

    // 1. Unified soft shadow (visualTheme)
    const isBoss = m.name.includes('首领') || m.name.includes('巨怪') || m.maxHp > 600;
    const isBrute = m.name.includes('暴民') || m.name.includes('破拆');
    const shadowR = isBoss ? 32 : isBrute ? 24 : 18;
    drawSoftShadow(this.ctx, s.x, s.y, shadowR);

    const anim = m.animTime;

    if (isBoss) {
      // --- A. COLOSSAL VOID BEHEMOTH (深渊巨兽) ---
      const breath = Math.sin(anim * 3.5) * 4;
      const bossSprite = this.drawWorldSprite('monster-pack.png', 'huge-boss', m.x, m.y, 106, 100, breath);
      if (!bossSprite) {

      // Colossal Obsidian Armor Carapace
      this.ctx.fillStyle = '#180728';
      this.ctx.strokeStyle = '#9333ea';
      this.ctx.lineWidth = 2.5;

      // Massive Ribbed Shoulders & Torso
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - 32, s.y - 30 + breath);
      this.ctx.quadraticCurveTo(s.x - 38, s.y - 65 + breath, s.x - 18, s.y - 82 + breath);
      this.ctx.lineTo(s.x + 18, s.y - 82 + breath);
      this.ctx.quadraticCurveTo(s.x + 38, s.y - 65 + breath, s.x + 32, s.y - 30 + breath);
      this.ctx.quadraticCurveTo(s.x, s.y - 12 + breath, s.x - 32, s.y - 30 + breath);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Sweeping Recurved Horn Crests
      this.ctx.fillStyle = '#3b0764';
      this.ctx.strokeStyle = '#c026d3';
      this.ctx.lineWidth = 2;
      // Left Horn
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - 16, s.y - 78 + breath);
      this.ctx.quadraticCurveTo(s.x - 38, s.y - 100 + breath, s.x - 48, s.y - 122 + breath);
      this.ctx.quadraticCurveTo(s.x - 28, s.y - 105 + breath, s.x - 10, s.y - 84 + breath);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();
      // Right Horn
      this.ctx.beginPath();
      this.ctx.moveTo(s.x + 16, s.y - 78 + breath);
      this.ctx.quadraticCurveTo(s.x + 38, s.y - 100 + breath, s.x + 48, s.y - 122 + breath);
      this.ctx.quadraticCurveTo(s.x + 28, s.y - 105 + breath, s.x + 10, s.y - 84 + breath);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Pulsing Vortex Void Core in Center Chest
      const corePulse = (Math.sin(anim * 6) + 1) * 0.5;
      const coreGrad = this.ctx.createRadialGradient(s.x, s.y - 50 + breath, 2, s.x, s.y - 50 + breath, 18);
      coreGrad.addColorStop(0, '#fdf4ff');
      coreGrad.addColorStop(0.35, '#e879f9');
      coreGrad.addColorStop(0.8, '#a855f7');
      coreGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');
      this.ctx.fillStyle = coreGrad;
      this.ctx.beginPath();
      this.ctx.arc(s.x, s.y - 50 + breath, 16 + corePulse * 4, 0, Math.PI * 2);
      this.ctx.fill();

      // Core Energy Rib Cage Arcs
      this.ctx.strokeStyle = '#e9d5ff';
      this.ctx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        const ry = s.y - 50 + breath + i * 7;
        this.ctx.beginPath();
        this.ctx.moveTo(s.x - 14 + Math.abs(i) * 3, ry);
        this.ctx.lineTo(s.x - 6, ry + 2);
        this.ctx.moveTo(s.x + 14 - Math.abs(i) * 3, ry);
        this.ctx.lineTo(s.x + 6, ry + 2);
        this.ctx.stroke();
      }

      // Seismic Shockwave ground rings
      this.ctx.strokeStyle = `rgba(192, 38, 211, ${0.4 * (1 - (anim % 1))})`;
      this.ctx.lineWidth = 1.8;
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y, 34 + (anim % 1) * 20, 16 + (anim % 1) * 10, 0, 0, Math.PI * 2);
      this.ctx.stroke();
      }

    } else if (isBrute) {
      // --- B. MUTANT SCAVENGER BRUTE (辐射畸变狂暴者) ---
      const walkCycle = Math.sin(anim * 8);
      const bob = Math.abs(walkCycle) * 3;
      const bruteSprite = this.drawWorldSprite('monster-pack.png', 'medium-armored', m.x, m.y, 88, 72, bob);
      if (!bruteSprite) {

      // Heavy Hunched Asymmetric Torso
      this.ctx.fillStyle = '#44403c';
      this.ctx.strokeStyle = '#1c1917';
      this.ctx.lineWidth = 2;

      this.ctx.beginPath();
      this.ctx.moveTo(s.x - 18, s.y - 18 - bob);
      this.ctx.lineTo(s.x - 22, s.y - 48 - bob);
      this.ctx.quadraticCurveTo(s.x, s.y - 58 - bob, s.x + 20, s.y - 46 - bob);
      this.ctx.lineTo(s.x + 16, s.y - 18 - bob);
      this.ctx.closePath();
      this.ctx.fill();
      this.ctx.stroke();

      // Mutated Bioluminescent Shoulder Spikes
      this.ctx.fillStyle = '#84cc16';
      this.ctx.strokeStyle = '#4d7c0f';
      this.ctx.lineWidth = 1.5;
      const spikes = [
        { ox: -20, oy: -48, h: 18, w: 6 },
        { ox: -12, oy: -54, h: 22, w: 7 },
        { ox: -4, oy: -56, h: 16, w: 5 },
      ];
      spikes.forEach((sp) => {
        this.ctx.beginPath();
        this.ctx.moveTo(s.x + sp.ox, s.y + sp.oy - bob);
        this.ctx.lineTo(s.x + sp.ox + sp.w, s.y + sp.oy - bob);
        this.ctx.lineTo(s.x + sp.ox + sp.w * 0.5, s.y + sp.oy - sp.h - bob);
        this.ctx.closePath();
        this.ctx.fill();
        this.ctx.stroke();
      });

      // Distorted Welded Iron Gas Mask
      this.ctx.fillStyle = '#292524';
      this.ctx.beginPath();
      this.ctx.arc(s.x + 4, s.y - 50 - bob, 9, 0, Math.PI * 2);
      this.ctx.fill();
      // Glowing Toxic Optic Ports
      this.ctx.fillStyle = '#ef4444';
      this.ctx.shadowColor = '#ef4444';
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.arc(s.x + 2, s.y - 51 - bob, 2.5, 0, Math.PI * 2);
      this.ctx.arc(s.x + 8, s.y - 49 - bob, 2.5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      // Heavy Concrete & Rebar Smashing Club in Right Hand
      this.ctx.save();
      this.ctx.translate(s.x + 18, s.y - 30 - bob);
      this.ctx.rotate(0.3 + walkCycle * 0.3);
      // Rebar handle
      this.ctx.strokeStyle = '#78716c';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.moveTo(0, 10);
      this.ctx.lineTo(0, -38);
      this.ctx.stroke();
      // Concrete breaker head
      this.ctx.fillStyle = '#57534e';
      this.ctx.fillRect(-8, -42, 16, 18);
      this.ctx.strokeStyle = '#292524';
      this.ctx.strokeRect(-8, -42, 16, 18);
      // Barbed wire wrap
      this.ctx.strokeStyle = '#b91c1c';
      this.ctx.lineWidth = 1.5;
      this.ctx.strokeRect(-9, -38, 18, 10);
      this.ctx.restore();

      // Thick Stomping Boots
      this.ctx.fillStyle = '#1c1917';
      this.ctx.fillRect(s.x - 14, s.y - 14 + walkCycle * 4, 10, 14);
      this.ctx.fillRect(s.x + 4, s.y - 14 - walkCycle * 4, 10, 14);
      }

    } else {
      // --- C. MULTI-LEGGED VOID STALKER (裂隙潜行兽) ---
      const legWalk = Math.sin(anim * 11) * 7;
      const stalkerSprite = this.drawWorldSprite('monster-pack.png', 'small-fast', m.x, m.y, 84, 60);
      if (!stalkerSprite) {

      // Segmented Chitinous Carapace Body
      this.ctx.fillStyle = '#170624';
      this.ctx.strokeStyle = '#a855f7';
      this.ctx.lineWidth = 1.8;

      // Dorsal Armor Shell with segment ribs
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y - 20, 18, 11, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.stroke();

      // Carapace glow seam lines
      this.ctx.strokeStyle = '#e879f9';
      this.ctx.lineWidth = 1.2;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - 12, s.y - 22);
      this.ctx.quadraticCurveTo(s.x, s.y - 26, s.x + 12, s.y - 22);
      this.ctx.moveTo(s.x - 10, s.y - 17);
      this.ctx.quadraticCurveTo(s.x, s.y - 20, s.x + 10, s.y - 17);
      this.ctx.stroke();

      // 6 Articulated Scythe Claw Legs (3 Left, 3 Right)
      this.ctx.strokeStyle = '#c026d3';
      this.ctx.lineWidth = 2.4;
      const legOffsets = [-8, 0, 8];
      legOffsets.forEach((lo, idx) => {
        const phase = idx % 2 === 0 ? legWalk : -legWalk;
        // Left Claw
        this.ctx.beginPath();
        this.ctx.moveTo(s.x - 14, s.y - 20 + lo * 0.4);
        this.ctx.lineTo(s.x - 24 + phase * 0.5, s.y - 28 + lo);
        this.ctx.lineTo(s.x - 28 + phase, s.y + lo * 0.4);
        this.ctx.stroke();
        // Right Claw
        this.ctx.beginPath();
        this.ctx.moveTo(s.x + 14, s.y - 20 + lo * 0.4);
        this.ctx.lineTo(s.x + 24 - phase * 0.5, s.y - 28 + lo);
        this.ctx.lineTo(s.x + 28 - phase, s.y + lo * 0.4);
        this.ctx.stroke();
      });

      // Predatory Mandible Fangs & Cluster Eyes
      this.ctx.fillStyle = '#f43f5e';
      this.ctx.shadowColor = '#f43f5e';
      this.ctx.shadowBlur = 10;
      // Multi-facet ocular cluster
      this.ctx.beginPath();
      this.ctx.arc(s.x - 5, s.y - 24, 2.5, 0, Math.PI * 2);
      this.ctx.arc(s.x - 1, s.y - 26, 2, 0, Math.PI * 2);
      this.ctx.arc(s.x + 3, s.y - 25, 2.5, 0, Math.PI * 2);
      this.ctx.arc(s.x + 7, s.y - 23, 1.8, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;

      // Dripping Acid Mandibles
      this.ctx.strokeStyle = '#a3e635';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x - 6, s.y - 18);
      this.ctx.lineTo(s.x - 3, s.y - 12);
      this.ctx.moveTo(s.x + 6, s.y - 18);
      this.ctx.lineTo(s.x + 3, s.y - 12);
      this.ctx.stroke();
      }
    }

    // --- TACTICAL HEALTH BAR & IDENTIFIER HUD ---
    const barW = isBoss ? 64 : 46;
    const barH = isBoss ? 6 : 5;
    const by = isBoss ? s.y - 100 : isBrute ? s.y - 74 : s.y - 50;
    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    this.ctx.fillRect(s.x - barW / 2 - 2, by - 2, barW + 4, barH + 4);
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(s.x - barW / 2 - 2, by - 2, barW + 4, barH + 4);
    const currentHpRatio = Math.max(0, Math.min(1, m.hp / m.maxHp));
    this.ctx.fillStyle = healthBarColor(currentHpRatio);
    this.ctx.fillRect(s.x - barW / 2, by, barW * currentHpRatio, barH);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 10px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(m.name, s.x, by - 5);

    this.ctx.restore();
  }

  // --- HIGH-FIDELITY ISOMETRIC OPERATIVE (PLAYER) ---
  private drawPlayer() {
    const s = this.toScreen(this.player.x, this.player.y);
    this.ctx.save();
    // 全局光：左上轮廓光预设（描边色，不影响碰撞/伤害）
    const PLAYER_OUTLINE = '#e0f2fe';

    const isMoving = Math.hypot(this.player.vx, this.player.vy) > 0.15;
    const walkCycle = isMoving ? Math.sin(this.gameTime * 12) : 0;
    const legPhase = walkCycle * 8;
    const bodyBob = isMoving ? Math.abs(Math.sin(this.gameTime * 12)) * 2.5 : 0;

    // 1. Soft Realistic Contact Shadow with Ambient Occlusion
    const shadowGrad = this.ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 18);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    shadowGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.28)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = shadowGrad;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 18, 9, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // 玩家身体美术优先（char-survivor 四向；枪械/名牌仍 procedural，保证瞄准可读）
    const survivorSpriteDrawn = this.drawSurvivorSprite(s.x, s.y - bodyBob, this.player.angle);
    if (!survivorSpriteDrawn) {
    // 2. Sculpted Heavy Combat Boots (Lug Soles, Ankle Support, Laces)
    const drawTacticalBoot = (bx: number, by: number) => {
      // Vibram rubber sole
      this.ctx.fillStyle = '#090d16';
      this.ctx.fillRect(bx - 4, by - 2, 9, 3);
      // Hardened leather foot & rubber toe cap
      this.ctx.fillStyle = '#1e293b';
      this.ctx.beginPath();
      this.ctx.moveTo(bx - 4, by - 2);
      this.ctx.lineTo(bx - 4, by - 9);
      this.ctx.lineTo(bx + 3, by - 9);
      this.ctx.lineTo(bx + 5, by - 4);
      this.ctx.lineTo(bx + 5, by - 2);
      this.ctx.closePath();
      this.ctx.fill();
      // Ankle laces & eyelets
      this.ctx.strokeStyle = '#475569';
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo(bx - 2, by - 8);
      this.ctx.lineTo(bx + 2, by - 8);
      this.ctx.moveTo(bx - 2, by - 5);
      this.ctx.lineTo(bx + 2, by - 5);
      this.ctx.stroke();
    };

    // Draw Left & Right Feet with articulated stride
    drawTacticalBoot(s.x - 8, s.y + legPhase * 0.6);
    drawTacticalBoot(s.x + 3, s.y - legPhase * 0.6);

    // 3. Anatomical Tactical Combat Pants (G3 Tactical Pants)
    // Dark Charcoal Cordura Camouflage
    this.ctx.fillStyle = '#263143';
    this.ctx.strokeStyle = '#151d28';
    this.ctx.lineWidth = 1.2;

    // Left Thigh & Shin
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 9, s.y - 20 - bodyBob);
    this.ctx.quadraticCurveTo(s.x - 12, s.y - 12, s.x - 9, s.y - 7 + legPhase * 0.6);
    this.ctx.lineTo(s.x - 4, s.y - 7 + legPhase * 0.6);
    this.ctx.quadraticCurveTo(s.x - 5, s.y - 14, s.x - 2, s.y - 20 - bodyBob);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Right Thigh & Shin
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 1, s.y - 20 - bodyBob);
    this.ctx.quadraticCurveTo(s.x + 3, s.y - 14, s.x + 2, s.y - 7 - legPhase * 0.6);
    this.ctx.lineTo(s.x + 7, s.y - 7 - legPhase * 0.6);
    this.ctx.quadraticCurveTo(s.x + 10, s.y - 12, s.x + 8, s.y - 20 - bodyBob);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Integrated AirFlex Hard-Shell Kneepads with Rivet Dots
    const drawKneepad = (kx: number, ky: number) => {
      this.ctx.fillStyle = '#0891b2';
      this.ctx.fillRect(kx - 3, ky - 4, 6, 7);
      this.ctx.strokeStyle = '#164e63';
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(kx - 3, ky - 4, 6, 7);
      // Silver rivet studs
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.fillRect(kx - 2, ky - 3, 1.2, 1.2);
      this.ctx.fillRect(kx + 1, ky - 3, 1.2, 1.2);
      this.ctx.fillRect(kx - 2, ky + 1, 1.2, 1.2);
      this.ctx.fillRect(kx + 1, ky + 1, 1.2, 1.2);
    };
    drawKneepad(s.x - 6.5, s.y - 13 + legPhase * 0.3);
    drawKneepad(s.x + 4.5, s.y - 13 - legPhase * 0.3);

    // Thigh Cargo Utility Pouches
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(s.x - 11, s.y - 19 - bodyBob, 3.5, 6);
    this.ctx.fillRect(s.x + 7.5, s.y - 19 - bodyBob, 3.5, 6);

    // 4. Heavy Modular Tactical Battle Belt (Ronin Cobra Buckle)
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(s.x - 9, s.y - 23 - bodyBob, 18, 4);
    // Gold/Brass Cobra Buckle
    this.ctx.fillStyle = '#d97706';
    this.ctx.fillRect(s.x - 2, s.y - 23.5 - bodyBob, 4, 5);

    // Right Hip Drop-Leg Polymer Holster & Pistol Grip
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(s.x + 8, s.y - 23 - bodyBob, 4, 7);
    this.ctx.fillStyle = '#090d16'; // Pistol handle
    this.ctx.fillRect(s.x + 9, s.y - 25 - bodyBob, 2.5, 3);

    // 5. Heavy Armored Plate Carrier (JPC Tactical Vest)
    // Tapered anatomical torso with ballistic plates
    this.ctx.fillStyle = '#1e293b';
    this.ctx.strokeStyle = '#090d16';
    this.ctx.lineWidth = 1.4;

    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 11, s.y - 36 - bodyBob); // Left shoulder
    this.ctx.lineTo(s.x + 11, s.y - 36 - bodyBob); // Right shoulder
    this.ctx.lineTo(s.x + 8.5, s.y - 23 - bodyBob); // Right waist
    this.ctx.lineTo(s.x - 8.5, s.y - 23 - bodyBob); // Left waist
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Chest Ceramic SAPI Plate Contour bevels
    this.ctx.fillStyle = '#334155';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 7, s.y - 34 - bodyBob);
    this.ctx.lineTo(s.x + 7, s.y - 34 - bodyBob);
    this.ctx.lineTo(s.x + 5.5, s.y - 26 - bodyBob);
    this.ctx.lineTo(s.x - 5.5, s.y - 26 - bodyBob);
    this.ctx.closePath();
    this.ctx.fill();

    // 3x M4/AR Magazine Pouches with retention cords
    this.ctx.fillStyle = '#1e293b';
    for (let i = -1; i <= 1; i++) {
      this.ctx.fillRect(s.x + i * 4.5 - 1.8, s.y - 27 - bodyBob, 3.6, 6);
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = 0.8;
      this.ctx.strokeRect(s.x + i * 4.5 - 1.8, s.y - 27 - bodyBob, 3.6, 6);
    }

    // Glowing Tactical Chem-Light (Cyan glow tube)
    this.ctx.fillStyle = '#22d3ee';
    this.ctx.shadowColor = '#06b6d4';
    this.ctx.shadowBlur = 6;
    this.ctx.fillRect(s.x - 8, s.y - 33 - bodyBob, 2, 7);
    this.ctx.shadowBlur = 0;

    // Unit Morale Patch on Chest
    this.ctx.fillStyle = '#0284c7';
    this.ctx.fillRect(s.x - 3, s.y - 33 - bodyBob, 6, 3.5);

    // 6. Tactical Ballistic Helmet & Head Gear (Ops-Core FAST Helmet)
    // Ballistic High-Cut Shell
    this.ctx.fillStyle = '#0f172a';
    this.ctx.beginPath();
    this.ctx.arc(s.x, s.y - 44 - bodyBob, 8.5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1.2;
    this.ctx.stroke();

    // NVG Wilcox Shroud Mount on Forehead
    this.ctx.fillStyle = '#64748b';
    this.ctx.fillRect(s.x - 2.5, s.y - 48 - bodyBob, 5, 4);

    // Side Comms Headset (Peltor ComTac) with Earcups & Mic
    this.ctx.fillStyle = '#334155';
    this.ctx.fillRect(s.x - 10, s.y - 44 - bodyBob, 3, 5);
    this.ctx.fillRect(s.x + 7, s.y - 44 - bodyBob, 3, 5);
    // Flexible Mic boom curving to mouth
    this.ctx.strokeStyle = '#64748b';
    this.ctx.lineWidth = 1.2;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 9, s.y - 41 - bodyBob);
    this.ctx.quadraticCurveTo(s.x - 6, s.y - 38 - bodyBob, s.x - 2, s.y - 39 - bodyBob);
    this.ctx.stroke();

    // Multi-Facet Tactical HUD Visor (Sapphire tint with glass glare)
    const visorGrad = this.ctx.createLinearGradient(s.x - 6, s.y - 44 - bodyBob, s.x + 6, s.y - 40 - bodyBob);
    visorGrad.addColorStop(0, '#0284c7');
    visorGrad.addColorStop(0.5, '#38bdf8');
    visorGrad.addColorStop(1, '#06b6d4');
    this.ctx.fillStyle = visorGrad;
    this.ctx.shadowColor = '#38bdf8';
    this.ctx.shadowBlur = 8;
    this.ctx.beginPath();
    this.ctx.roundRect(s.x - 5.5, s.y - 44.5 - bodyBob, 11, 4.5, 1.5);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    // Specular diagonal white glare slit
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 3, s.y - 44.5 - bodyBob);
    this.ctx.lineTo(s.x - 1, s.y - 44.5 - bodyBob);
    this.ctx.lineTo(s.x - 3, s.y - 41 - bodyBob);
    this.ctx.lineTo(s.x - 5, s.y - 41 - bodyBob);
    this.ctx.closePath();
    this.ctx.fill();
    }

    // 7. Tactical Assault Rifle & Hands (Realistic 2.5D C-Clamp Grip)
    this.ctx.save();
    this.ctx.translate(s.x, s.y - 29 - bodyBob);
    this.ctx.rotate(this.player.angle);

    const recoil = -this.player.recoil * 0.45;

    // Adjustable Crane Stock & Buffer Tube
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(-12 + recoil, -3.5, 10, 4);
    this.ctx.fillRect(-14 + recoil, -5, 3, 7); // Rubber buttpad

    // Lower & Upper Receiver
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(-2 + recoil, -4, 14, 6);
    this.ctx.strokeStyle = '#090d16';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(-2 + recoil, -4, 14, 6);

    // Curved Magpul PMAG 30-round magazine
    this.ctx.fillStyle = '#0f172a';
    this.ctx.beginPath();
    this.ctx.moveTo(2 + recoil, 2);
    this.ctx.lineTo(5 + recoil, 11);
    this.ctx.lineTo(1 + recoil, 12);
    this.ctx.lineTo(-1 + recoil, 2);
    this.ctx.closePath();
    this.ctx.fill();

    // Free-Float M-LOK Handguard & Barrel
    this.ctx.fillStyle = '#334155';
    this.ctx.fillRect(12 + recoil, -3, 18, 4.5);
    this.ctx.fillStyle = '#090d16'; // Barrel & Flash Hider
    this.ctx.fillRect(30 + recoil, -2, 6, 2.5);

    // EOTech Holographic Sight & Red-Dot Reticle
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(2 + recoil, -8, 8, 4);
    this.ctx.fillStyle = '#ef4444'; // Red reticle emitter
    this.ctx.fillRect(8 + recoil, -7, 2, 2);

    // Forward Hands in Tactical C-Clamp Grip
    // Firing Hand on Pistol Grip
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(-3 + recoil, -2, 4, 4);
    // Support Hand wrapped over handguard
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(16 + recoil, -5, 5, 5);

    // Volumetric Weapon Light Cone (Surefire Scout Light)
    const flashGrad = this.ctx.createRadialGradient(34 + recoil, -1, 3, 210, -1, 160);
    flashGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
    flashGrad.addColorStop(0.3, 'rgba(254, 240, 138, 0.15)');
    flashGrad.addColorStop(1, 'rgba(254, 240, 138, 0)');
    this.ctx.fillStyle = flashGrad;
    this.ctx.beginPath();
    this.ctx.moveTo(34 + recoil, -1);
    this.ctx.lineTo(210, -58);
    this.ctx.lineTo(210, 58);
    this.ctx.closePath();
    this.ctx.fill();

    // Precision Cyan Laser Target Line (PEQ-15)
    this.ctx.strokeStyle = 'rgba(6, 182, 212, 0.75)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(34 + recoil, -1);
    this.ctx.lineTo(180, -1);
    this.ctx.stroke();

    this.ctx.restore();

    // 8. Overhead Tactical Status HUD Tag
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.font = 'bold 9px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('先锋干员 (你)', s.x, s.y - 56 - bodyBob);

    this.ctx.strokeStyle = withAlpha(PLAYER_OUTLINE, 0.85);
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y - 30, 16, 26, 0, 0, Math.PI * 2);
    this.ctx.stroke();

    this.ctx.restore();
  }

  // --- MULTIPLAYER ONLINE REMOTE PLAYER RENDERING ---
  public setOnlinePlayers(players: OnlinePlayer[]) {
    this.onlinePlayers.clear();
    players.forEach((p) => {
      if (p.id !== this.localPlayerId) {
        this.onlinePlayers.set(p.id, p);
      }
    });
  }

  public updateRemotePlayer(p: OnlinePlayer) {
    if (p.id === this.localPlayerId) return;
    this.onlinePlayers.set(p.id, p);
  }

  public removeRemotePlayer(playerId: string) {
    this.onlinePlayers.delete(playerId);
  }

  public drawRemotePlayer(op: OnlinePlayer) {
    const s = this.toScreen(op.x, op.y);
    this.ctx.save();

    // 1. Soft Dynamic Contact Shadow
    const shadowGrad = this.ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 16);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    shadowGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.22)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = shadowGrad;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 16, 8, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const isMoving = op.currentAction === 'moving' || op.isDashing;
    const walkAnim = isMoving ? Math.sin(this.gameTime * 14) : 0;
    const bodyBob = Math.abs(walkAnim) * 2;
    const accentColor = op.color || '#38bdf8';

    const remoteSprite = this.drawSurvivorSprite(s.x, s.y - bodyBob, op.angle || 0);
    if (remoteSprite) {
      // 联机身份色脚环（替代护甲 accent，供认人）
      this.ctx.strokeStyle = accentColor;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.ellipse(s.x, s.y, 20, 10, 0, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    if (!remoteSprite) {
    // 2. Tactical Boots
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(s.x - 7, s.y - 5 + walkAnim * 2, 5.5, 6);
    this.ctx.fillRect(s.x + 2, s.y - 5 - walkAnim * 2, 5.5, 6);

    // 3. Tactical Trousers
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(s.x - 7, s.y - 18 - bodyBob, 5.5, 14);
    this.ctx.fillRect(s.x + 2, s.y - 18 - bodyBob, 5.5, 14);

    // Knee Pads
    this.ctx.fillStyle = accentColor;
    this.ctx.fillRect(s.x - 6, s.y - 12 - bodyBob, 4, 5);
    this.ctx.fillRect(s.x + 3, s.y - 12 - bodyBob, 4, 5);

    // 4. Armored Plate Carrier Vest (custom team accent)
    this.ctx.fillStyle = '#1e293b';
    this.ctx.strokeStyle = '#090d16';
    this.ctx.lineWidth = 1.3;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 10, s.y - 35 - bodyBob);
    this.ctx.lineTo(s.x + 10, s.y - 35 - bodyBob);
    this.ctx.lineTo(s.x + 8, s.y - 22 - bodyBob);
    this.ctx.lineTo(s.x - 8, s.y - 22 - bodyBob);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Vest Accent Stripe
    this.ctx.fillStyle = accentColor;
    this.ctx.fillRect(s.x - 6, s.y - 33 - bodyBob, 12, 3);

    // 5. Tactical Helmet & Glowing Visor
    this.ctx.fillStyle = '#0f172a';
    this.ctx.beginPath();
    this.ctx.arc(s.x, s.y - 43 - bodyBob, 8, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    // Glowing Visor
    this.ctx.fillStyle = accentColor;
    this.ctx.shadowColor = accentColor;
    this.ctx.shadowBlur = 8;
    this.ctx.beginPath();
    this.ctx.roundRect(s.x - 5, s.y - 44 - bodyBob, 10, 4, 1);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    }

    // 6. Tactical Rifle & Aim Angle
    this.ctx.save();
    this.ctx.translate(s.x, s.y - 28 - bodyBob);
    this.ctx.rotate(op.angle || 0);

    // Gun body
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(-2, -3, 14, 5);
    this.ctx.fillStyle = '#334155';
    this.ctx.fillRect(12, -2, 14, 3.5);
    this.ctx.fillStyle = '#090d16';
    this.ctx.fillRect(26, -1.5, 4, 2);

    // Laser sight
    this.ctx.strokeStyle = accentColor;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(28, 0);
    this.ctx.lineTo(130, 0);
    this.ctx.stroke();

    // Firing flash
    if (op.isFiring) {
      this.ctx.fillStyle = '#fef08a';
      this.ctx.shadowColor = '#f59e0b';
      this.ctx.shadowBlur = 12;
      this.ctx.beginPath();
      this.ctx.arc(32, 0, 5, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.shadowBlur = 0;
    }
    this.ctx.restore();

    // 7. Overhead Online Nameplate & Health/Shield Bars
    const nameY = s.y - 56 - bodyBob;
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 9.5px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`Lv.${op.level} ${op.name}`, s.x, nameY);

    // Health Bar
    const barW = 38;
    const barH = 3;
    const barX = s.x - barW / 2;
    const barY = nameY + 4;

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    this.ctx.fillRect(barX - 1, barY - 1, barW + 2, barH * 2 + 3);

    const hpPct = Math.max(0, Math.min(1, op.hp / op.maxHp));
    this.ctx.fillStyle = hpPct > 0.4 ? '#22c55e' : '#ef4444';
    this.ctx.fillRect(barX, barY, barW * hpPct, barH);

    // Shield Bar
    const shieldPct = Math.max(0, Math.min(1, op.shield / op.maxShield));
    this.ctx.fillStyle = '#06b6d4';
    this.ctx.fillRect(barX, barY + barH + 1, barW * shieldPct, barH);

    this.ctx.restore();
  }

  // --- SQUAD TEAMMATE A: SAPPER ALLEN (工兵 · 艾伦) ---
  public drawSapperAllen(tm: any) {
    const s = this.toScreen(tm.x, tm.y);
    this.ctx.save();

    // 1. Heavy Contact Shadow
    const shadowGrad = this.ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 20);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    shadowGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.25)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = shadowGrad;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 20, 10, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const allenSprite = this.drawWorldSprite('npc-allen.png', 'full', tm.x, tm.y, 35, 84);
    if (!allenSprite) {
    // 2. Heavy Pneumatic Exoskeleton Boots
    this.ctx.fillStyle = '#1c1917';
    this.ctx.fillRect(s.x - 9, s.y - 5, 8, 6);
    this.ctx.fillRect(s.x + 2, s.y - 5, 8, 6);
    // Steel toe cap reinforcement
    this.ctx.fillStyle = '#ca8a04';
    this.ctx.fillRect(s.x - 8, s.y - 4, 6, 2.5);
    this.ctx.fillRect(s.x + 3, s.y - 4, 6, 2.5);

    // 3. Heavy Armored Reinforced Legs with Hydraulic Struts
    this.ctx.fillStyle = '#292524';
    this.ctx.fillRect(s.x - 10, s.y - 20, 8, 16);
    this.ctx.fillRect(s.x + 2, s.y - 20, 8, 16);
    // Silver Hydraulic Piston Shafts on calf sides
    this.ctx.strokeStyle = '#e2e8f0';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 11, s.y - 18);
    this.ctx.lineTo(s.x - 11, s.y - 7);
    this.ctx.moveTo(s.x + 11, s.y - 18);
    this.ctx.lineTo(s.x + 11, s.y - 7);
    this.ctx.stroke();

    // 4. Heavy Industrial Blast Cuirass (EOD Hazard Exoskeleton)
    this.ctx.fillStyle = '#ca8a04';
    this.ctx.strokeStyle = '#713f12';
    this.ctx.lineWidth = 1.6;

    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 14, s.y - 36);
    this.ctx.lineTo(s.x + 14, s.y - 36);
    this.ctx.lineTo(s.x + 11, s.y - 20);
    this.ctx.lineTo(s.x - 11, s.y - 20);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Diagonal Hazard Warning Caution Stripes on Chest
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(s.x - 9, s.y - 32, 18, 8);
    this.ctx.clip();
    this.ctx.fillStyle = '#1c1917';
    for (let i = -14; i < 20; i += 5) {
      this.ctx.beginPath();
      this.ctx.moveTo(s.x + i, s.y - 32);
      this.ctx.lineTo(s.x + i + 4, s.y - 32);
      this.ctx.lineTo(s.x + i, s.y - 24);
      this.ctx.lineTo(s.x + i - 4, s.y - 24);
      this.ctx.closePath();
      this.ctx.fill();
    }
    this.ctx.restore();

    // Heavy Curved Pauldrons (Shoulder Guards)
    this.ctx.fillStyle = '#854d0e';
    this.ctx.beginPath();
    this.ctx.ellipse(s.x - 13, s.y - 34, 5, 7, -0.2, 0, Math.PI * 2);
    this.ctx.ellipse(s.x + 13, s.y - 34, 5, 7, 0.2, 0, Math.PI * 2);
    this.ctx.fill();

    // 5. Blast Welding Helmet with Panoramic Gold Visor
    this.ctx.fillStyle = '#1c1917';
    this.ctx.beginPath();
    this.ctx.arc(s.x, s.y - 44, 9, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.strokeStyle = '#44403c';
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    // Gold Reflective Blast Visor Glass
    this.ctx.fillStyle = '#f59e0b';
    this.ctx.shadowColor = '#fbbf24';
    this.ctx.shadowBlur = 10;
    this.ctx.beginPath();
    this.ctx.roundRect(s.x - 5.5, s.y - 45, 11, 4.5, 1.5);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    }

    // 6. Two-Handed Heavy Kinetic Breaching Maul (气动重锤)
    // Heavy Alloy Shaft
    this.ctx.strokeStyle = '#64748b';
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x + 10, s.y - 12);
    this.ctx.lineTo(s.x + 16, s.y - 42);
    this.ctx.stroke();

    // Forged Tungsten Hammerhead with Pneumatic Booster
    this.ctx.fillStyle = '#475569';
    this.ctx.fillRect(s.x + 10, s.y - 50, 14, 12);
    this.ctx.strokeStyle = '#1e293b';
    this.ctx.lineWidth = 1.4;
    this.ctx.strokeRect(s.x + 10, s.y - 50, 14, 12);

    // Hazard Stripes on Hammer Face
    this.ctx.fillStyle = '#eab308';
    this.ctx.fillRect(s.x + 20, s.y - 49, 3, 10);

    // Pneumatic Exhaust Vent Steam
    this.ctx.fillStyle = 'rgba(254, 215, 170, 0.6)';
    this.ctx.beginPath();
    this.ctx.arc(s.x + 11, s.y - 44, 2, 0, Math.PI * 2);
    this.ctx.fill();

    // 7. Tactical Identifier Badge
    this.ctx.fillStyle = '#fef08a';
    this.ctx.font = 'bold 9.5px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('[工兵] 艾伦 · 重装防御', s.x, s.y - 57);

    this.ctx.restore();
  }

  // --- SQUAD TEAMMATE B: TECH VIVIAN (技师 · 薇薇安) ---
  public drawTechVivian(tm: any) {
    const s = this.toScreen(tm.x, tm.y);
    this.ctx.save();

    // 1. Soft Ground Contact Shadow
    const shadowGrad = this.ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 16);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.55)');
    shadowGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.22)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = shadowGrad;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 16, 8, 0, 0, Math.PI * 2);
    this.ctx.fill();

    const vivianSprite = this.drawWorldSprite('npc-vivian.png', 'full', tm.x, tm.y, 28, 84);
    if (!vivianSprite) {
    // 2. Sleek Tactical Speed Boots
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(s.x - 7, s.y - 5, 5.5, 6);
    this.ctx.fillRect(s.x + 2, s.y - 5, 5.5, 6);

    // 3. Dark Tactical Trousers
    this.ctx.fillStyle = '#1e293b';
    this.ctx.fillRect(s.x - 7, s.y - 18, 5.5, 14);
    this.ctx.fillRect(s.x + 2, s.y - 18, 5.5, 14);

    // 4. Asymmetrical Field Trench Coat with High Collar (Dark Teal & Charcoal)
    this.ctx.fillStyle = '#0f766e';
    this.ctx.strokeStyle = '#134e4a';
    this.ctx.lineWidth = 1.4;

    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 10, s.y - 34);
    this.ctx.lineTo(s.x + 9, s.y - 34);
    this.ctx.lineTo(s.x + 11, s.y - 17); // Flowing coat tail
    this.ctx.lineTo(s.x - 8, s.y - 19);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();

    // Coat Folded High Mandarin Collar
    this.ctx.fillStyle = '#115e59';
    this.ctx.fillRect(s.x - 5, s.y - 37, 10, 4);

    // 5. Left Arm Cybernetic Bionic Prosthesis (Chrome & Cyan Circuits)
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.fillRect(s.x + 8, s.y - 32, 4, 12);
    this.ctx.strokeStyle = '#475569';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(s.x + 8, s.y - 32, 4, 12);

    // Cyan Circuit Traces glowing on cybernetic arm
    this.ctx.strokeStyle = '#22d3ee';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x + 10, s.y - 31);
    this.ctx.lineTo(s.x + 10, s.y - 22);
    this.ctx.stroke();

    // 6. Operative Head & Cyber-Optic Eyepiece
    // Brunette Ponytail tied behind
    this.ctx.fillStyle = '#451a03';
    this.ctx.beginPath();
    this.ctx.arc(s.x, s.y - 42, 8, 0, Math.PI * 2);
    this.ctx.fill();
    // Ponytail sweep
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 6, s.y - 44);
    this.ctx.quadraticCurveTo(s.x - 14, s.y - 42, s.x - 12, s.y - 32);
    this.ctx.lineTo(s.x - 9, s.y - 34);
    this.ctx.closePath();
    this.ctx.fill();

    // High-Tech Cyber-Optic Scanning Monocle over Eye
    this.ctx.fillStyle = '#2dd4bf';
    this.ctx.shadowColor = '#2dd4bf';
    this.ctx.shadowBlur = 8;
    this.ctx.beginPath();
    this.ctx.arc(s.x + 2, s.y - 42, 3, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    // 7. Deployable Holographic Field Terminal (Floating Isometric Hologram!)
    // Portable console pad held in right hand
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(s.x - 14, s.y - 28, 10, 6);

    // Glowing 3D Hologram Projection in the air!
    const holoPulse = (Math.sin(this.gameTime * 5) + 1) * 0.5;
    this.ctx.strokeStyle = 'rgba(45, 212, 191, 0.85)';
    this.ctx.lineWidth = 1.2;
    this.ctx.shadowColor = '#2dd4bf';
    this.ctx.shadowBlur = 10;

    // Projected hologram wireframe plane
    this.ctx.beginPath();
    this.ctx.moveTo(s.x - 20, s.y - 38);
    this.ctx.lineTo(s.x - 6, s.y - 42);
    this.ctx.lineTo(s.x - 2, s.y - 32);
    this.ctx.lineTo(s.x - 16, s.y - 28);
    this.ctx.closePath();
    this.ctx.stroke();

    // Holographic radar concentric circles & status waves
    this.ctx.beginPath();
    this.ctx.arc(s.x - 11, s.y - 35, 4 + holoPulse * 2, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
    }

    // 8. Tactical Identifier Badge
    this.ctx.fillStyle = '#99f6e4';
    this.ctx.font = 'bold 9.5px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('[技师] 薇薇安 · 全息骇客', s.x, s.y - 54);

    this.ctx.restore();
  }

  // --- SQUAD DRONE: HUMMINGBIRD SCOUT (蜂鸟 · 侦察机) ---
  private drawDrone(wx: number, wy: number, hoverOffset: number) {
    const s = this.toScreen(wx, wy);
    this.ctx.save();
    const dy = s.y - 38 + hoverOffset * 22;

    // 1. Drone Ground Shadow & Active Scanning Fan
    const shadowGrad = this.ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 16);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = shadowGrad;
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, 16, 8, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Animated Conical Laser Sensor Field on the Ground
    this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(s.x, dy + 6);
    this.ctx.lineTo(s.x - 18, s.y);
    this.ctx.moveTo(s.x, dy + 6);
    this.ctx.lineTo(s.x + 18, s.y);
    this.ctx.stroke();

    if (!this.drawWorldSprite('drone.png', 'full', wx, wy, 56, 40, -18 + hoverOffset * 22)) {
    // 2. Carbon-Fiber Stealth Aerofoil Chassis
    this.ctx.fillStyle = '#0f172a';
    this.ctx.strokeStyle = '#0284c7';
    this.ctx.lineWidth = 1.5;

    // Central Fuselage Pod
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, dy, 11, 7, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();

    // 4 Articulated Rotor Nacelle Arms (X-Configuration)
    const rotorArms = [
      { rx: -15, ry: -8 },
      { rx: 15, ry: -8 },
      { rx: -13, ry: 9 },
      { rx: 13, ry: 9 },
    ];

    this.ctx.strokeStyle = '#334155';
    this.ctx.lineWidth = 2.2;
    rotorArms.forEach((arm) => {
      this.ctx.beginPath();
      this.ctx.moveTo(s.x, dy);
      this.ctx.lineTo(s.x + arm.rx, dy + arm.ry);
      this.ctx.stroke();

      // Spinning Rotor Blur Discs (Aerodynamic high-speed translucent discs)
      this.ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      this.ctx.beginPath();
      this.ctx.ellipse(s.x + arm.rx, dy + arm.ry, 7, 3.5, 0, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.strokeStyle = 'rgba(125, 211, 252, 0.7)';
      this.ctx.lineWidth = 1;
      this.ctx.stroke();
    });

    // 3. Ventral 3-Axis Gyro Camera Sphere with Blue Anti-Reflective Optical Coating
    this.ctx.fillStyle = '#0284c7';
    this.ctx.shadowColor = '#38bdf8';
    this.ctx.shadowBlur = 8;
    this.ctx.beginPath();
    this.ctx.arc(s.x, dy + 2, 4.5, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.shadowBlur = 0;

    // Lens reflection glint
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillRect(s.x - 1, dy + 1, 1.5, 1.5);

    }
    // 4. Aviation Strobe Navigation Lights (Port Red, Starboard Green)
    const strobe = (Math.sin(this.gameTime * 8) + 1) * 0.5 > 0.5;
    if (strobe) {
      this.ctx.fillStyle = '#ef4444'; // Red Port light
      this.ctx.fillRect(s.x - 16, dy - 9, 2, 2);
      this.ctx.fillStyle = '#22c55e'; // Green Starboard light
      this.ctx.fillRect(s.x + 14, dy - 9, 2, 2);
    }

    // 5. Active Target Laser Tracking Beam
    const drone = this.teammates.find((t) => t.id === 'drone');
    if (drone?.targetLaser) {
      const targetScreen = this.toScreen(drone.targetLaser.x, drone.targetLaser.y);
      this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
      this.ctx.lineWidth = 2;
      this.ctx.shadowColor = '#38bdf8';
      this.ctx.shadowBlur = 8;
      this.ctx.beginPath();
      this.ctx.moveTo(s.x, dy + 2);
      this.ctx.lineTo(targetScreen.x, targetScreen.y - 18);
      this.ctx.stroke();
      this.ctx.shadowBlur = 0;
    }

    // Drone Tag
    this.ctx.fillStyle = '#7dd3fc';
    this.ctx.font = 'bold 9px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('蜂鸟 · 战术侦察机', s.x, dy - 14);

    this.ctx.restore();
  }

  private renderParticles() {
    this.particles.forEach((p) => {
      const s = this.toScreen(p.x, p.y);
      this.ctx.save();
      const alpha = p.life / p.maxLife;

      if (p.type === 'text') {
        this.ctx.font = 'bold 16px sans-serif';
        this.ctx.fillStyle = p.color;
        this.ctx.strokeStyle = '#000000';
        this.ctx.lineWidth = 3;
        this.ctx.textAlign = 'center';
        this.ctx.strokeText(p.text || '', s.x, s.y);
        this.ctx.fillText(p.text || '', s.x, s.y);
      } else if (p.type === 'laser') {
        this.ctx.strokeStyle = p.color;
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(s.x, s.y);
        const end = this.toScreen(p.x + p.vx * 0.05, p.y + p.vy * 0.05);
        this.ctx.lineTo(end.x, end.y);
        this.ctx.stroke();
      } else {
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    });
  }

  // --- HIGH-VISIBILITY ATMOSPHERIC DYNAMIC LIGHTING ---
  private renderDynamicLighting() {
    // If in Bright Mode (default), map is completely bright, crisp, and high-visibility!
    if (this.isBrightMode) {
      if (this.currentWeather === 'clear') {
        // Broad daylight: Subtle warm sun glow, no dimming!
        this.ctx.save();
        const sunGrad = this.ctx.createRadialGradient(
          this.width * 0.5,
          this.height * 0.3,
          100,
          this.width * 0.5,
          this.height * 0.5,
          this.width * 0.8
        );
        sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.06)');
        sunGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = sunGrad;
        this.ctx.fillRect(0, 0, this.width, this.height);
        // 受击红屏（combat Task 5）：明亮模式晴天路径
        if (this.hurtFlash > 0) {
          this.ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.28, this.hurtFlash * 0.6)})`;
          this.ctx.fillRect(0, 0, this.width, this.height);
        }
        this.ctx.restore();
        return;
      }

      // In rain/thunder/fog during bright mode: only minimal atmospheric tint (0.04)
      this.ctx.save();
      this.ctx.fillStyle = weatherTint((this.currentWeather as string) === 'clear' ? 'clear' : 'rain');
      this.ctx.fillRect(0, 0, this.width, this.height);
      // 受击红屏（combat Task 5）：明亮模式天气路径
      if (this.hurtFlash > 0) {
        this.ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.28, this.hurtFlash * 0.6)})`;
        this.ctx.fillRect(0, 0, this.width, this.height);
      }
      this.ctx.restore();
      return;
    }

    // Atmospheric Night Vision Mode:
    const baseDarkness = this.currentWeather === 'clear' ? 0.08 : 0.22;

    this.ctx.save();
    this.ctx.fillStyle = `rgba(15, 23, 42, ${baseDarkness})`;
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.ctx.globalCompositeOperation = 'destination-out';

    // Campfire light halo
    if (this.getGroundTheme() === 'camp') {
      const firePos = this.toScreen(this.campfire.x, this.campfire.y);
      const fireGrad = this.ctx.createRadialGradient(firePos.x, firePos.y, 10, firePos.x, firePos.y, 280);
      fireGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
      fireGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.7)');
      fireGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      this.ctx.fillStyle = fireGrad;
      this.ctx.beginPath();
      this.ctx.arc(firePos.x, firePos.y, 280, 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Active Defense Cores & Buildings Light Halos
    this.buildings.forEach((b) => {
      if (b.type === 'electric_core' || b.type === 'flame_core' || b.type === 'turret' || b.type === 'anchor_core') {
        const bp = this.toScreen(b.x, b.y);
        const bGrad = this.ctx.createRadialGradient(bp.x, bp.y - 20, 10, bp.x, bp.y - 20, 180);
        bGrad.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
        bGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        this.ctx.fillStyle = bGrad;
        this.ctx.beginPath();
        this.ctx.arc(bp.x, bp.y - 20, 180, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    // Player wide-angle tactical flashlight & radiant halo
    const playerPos = this.toScreen(this.player.x, this.player.y);
    const playerGrad = this.ctx.createRadialGradient(
      playerPos.x,
      playerPos.y - 18,
      10,
      playerPos.x,
      playerPos.y - 18,
      240
    );
    playerGrad.addColorStop(0, 'rgba(0, 0, 0, 0.95)');
    playerGrad.addColorStop(0.7, 'rgba(0, 0, 0, 0.6)');
    playerGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = playerGrad;
    this.ctx.beginPath();
    this.ctx.arc(playerPos.x, playerPos.y - 18, 240, 0, Math.PI * 2);
    this.ctx.fill();

    // 受击红屏（combat Task 5）：暗夜路径需先切回 source-over 再罩红
    // 注：震屏平移已移至 render() 帧级，此处不再 translate（此前为 no-op）
    this.ctx.globalCompositeOperation = 'source-over';
    if (this.hurtFlash > 0) {
      this.ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.28, this.hurtFlash * 0.6)})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    this.ctx.restore();
  }

  // --- WEATHER EFFECTS ---
  // --- THEME ATMOSPHERE（预览图式尘雾罩染：每主题固定色，与地图预览情绪一致） ---
  private renderThemeAtmosphere() {
    this.ctx.save();
    this.ctx.fillStyle = themeHaze(this.getGroundTheme() as GroundTheme);
    this.ctx.fillRect(0, 0, this.width, this.height);
    this.ctx.restore();
  }

  private renderWeather() {
    this.ctx.save();

    // Personal camps and legacy supply maps shelter from weather; the continuous world is outdoors.
    if (this.currentMapId.startsWith('home_') || (this.currentMapId !== 'world' && regionOf(this.currentMapId) === 'camp')) {
      const sunBeam = this.ctx.createLinearGradient(0, 0, this.width, this.height);
      sunBeam.addColorStop(0, 'rgba(254, 240, 138, 0.08)');
      sunBeam.addColorStop(0.5, 'rgba(253, 224, 71, 0.03)');
      sunBeam.addColorStop(1, 'rgba(0, 0, 0, 0)');
      this.ctx.fillStyle = sunBeam;
      this.ctx.fillRect(0, 0, this.width, this.height);
      this.ctx.restore();
      return;
    }

    // 1. Clear Weather: Radiant sunlight rays
    if (this.currentWeather === 'clear') {
      const sunBeam = this.ctx.createLinearGradient(0, 0, this.width, this.height);
      sunBeam.addColorStop(0, 'rgba(254, 240, 138, 0.08)');
      sunBeam.addColorStop(0.5, 'rgba(253, 224, 71, 0.03)');
      sunBeam.addColorStop(1, 'rgba(0, 0, 0, 0)');
      this.ctx.fillStyle = sunBeam;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // 2. Lightning Flash (Thunder)
    if (this.lightningFlash > 0) {
      this.ctx.fillStyle = `rgba(224, 242, 254, ${this.lightningFlash * 0.75})`;
      this.ctx.fillRect(0, 0, this.width, this.height);

      // Jagged electric lightning bolts in sky
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(this.width * 0.3, 0);
      this.ctx.lineTo(this.width * 0.35, 120);
      this.ctx.lineTo(this.width * 0.32, 180);
      this.ctx.lineTo(this.width * 0.42, 320);
      this.ctx.stroke();
    }

    // 3. Dense Rift Fog
    if (this.currentWeather === 'fog') {
      this.fogOffsets.forEach((fog) => {
        const fogGrad = this.ctx.createRadialGradient(fog.x, fog.y, 20, fog.x, fog.y, fog.radius);
        fogGrad.addColorStop(0, 'rgba(232, 232, 255, 0.28)');
        fogGrad.addColorStop(0.6, 'rgba(216, 216, 250, 0.14)');
        fogGrad.addColorStop(1, 'rgba(200, 200, 240, 0)');
        this.ctx.fillStyle = fogGrad;
        this.ctx.beginPath();
        this.ctx.arc(fog.x, fog.y, fog.radius, 0, Math.PI * 2);
        this.ctx.fill();
      });
    }

    // 4. Rain & Thunder & Acid Rain
    if (this.currentWeather === 'rain' || this.currentWeather === 'thunder' || this.currentWeather === 'acid_rain') {
      const isAcid = this.currentWeather === 'acid_rain';
      this.ctx.strokeStyle = isAcid ? 'rgba(74, 222, 128, 0.65)' : 'rgba(186, 230, 253, 0.45)';
      this.ctx.lineWidth = 1.4;
      this.ctx.beginPath();
      for (let i = 0; i < this.rainDrops.length; i++) {
        const r = this.rainDrops[i];
        this.ctx.moveTo(r.x, r.y);
        this.ctx.lineTo(r.x - r.len * 0.32, r.y + r.len);
      }
      this.ctx.stroke();

      this.groundSplashes.forEach((sp) => {
        this.ctx.strokeStyle = isAcid
          ? `rgba(74, 222, 128, ${sp.alpha})`
          : `rgba(186, 230, 253, ${sp.alpha})`;
        this.ctx.lineWidth = 1.2;
        this.ctx.beginPath();
        this.ctx.ellipse(sp.x, sp.y, sp.radius, sp.radius * 0.5, 0, 0, Math.PI * 2);
        this.ctx.stroke();
      });
    }

    this.ctx.restore();
  }

  private renderInteractionHUD() {
    if (this.callbacks.onGameAction && this.callbacks.onCampInteract && this.campInteractionIsNearest()) return;
    if (this.nearestBuilding) {
      const s = this.toScreen(this.nearestBuilding.x, this.nearestBuilding.y);
      this.ctx.save();
      const badgeW = 96;
      const badgeH = 44;
      const badgeX = s.x - badgeW / 2;
      const badgeY = s.y - 68;

      const isRaidTarget = this.isRaidTarget(this.nearestBuilding);

      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      this.ctx.strokeStyle = isRaidTarget ? '#ef4444' : '#10b981';
      this.ctx.lineWidth = 1.8;
      this.ctx.beginPath();
      this.ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      this.ctx.fill();
      this.ctx.stroke();

      this.ctx.fillStyle = '#f8fafc';
      this.ctx.font = 'bold 11px sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(this.nearestBuilding.name, s.x, badgeY + 16);

      this.ctx.fillStyle = isRaidTarget ? '#f87171' : '#34d399';
      this.ctx.font = '10px sans-serif';
      let promptText = '[E/F 交互]';
      if (isRaidTarget) {
        promptText = '[E/F 破拆建筑]';
      } else if (this.nearestBuilding.hp <= 0) {
        promptText = '[E/F 查看残骸]';
      } else if (this.nearestBuilding.type === 'door') {
        promptText = this.nearestBuilding.isOpen ? '[E/F 关门]' : '[E/F 开门]';
      } else if (this.nearestBuilding.type === 'safe_door') {
        promptText = this.nearestBuilding.isOpen ? '[E/F 闭锁安全门]' : '[E/F 开启安全门]';
      } else if (this.nearestBuilding.type === 'storage_box') {
        promptText = '[E/F 打开储物]';
      } else if (this.nearestBuilding.type === 'workbench') {
        promptText = '[E/F 打开制造]';
      } else if (this.nearestBuilding.type === 'electric_core') {
        promptText = '⚡ 城防电浆放电';
      } else if (this.nearestBuilding.type === 'flame_core') {
        promptText = '🔥 烈焰聚能防御';
      }
      this.ctx.fillText(promptText, s.x, badgeY + 32);
      this.ctx.restore();
      return;
    }

    if (!this.nearestInteractable) return;
    const s = this.toScreen(this.nearestInteractable.x, this.nearestInteractable.y);

    this.ctx.save();
    const badgeW = 90;
    const badgeH = 46;
    const badgeX = s.x - badgeW / 2;
    const badgeY = s.y - 68;

    this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    this.ctx.strokeStyle = '#38bdf8';
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    this.ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
    this.ctx.fill();
    this.ctx.stroke();

    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(this.nearestInteractable.name, s.x, badgeY + 18);

    this.ctx.fillStyle = '#38bdf8';
    this.ctx.font = '11px sans-serif';
    this.ctx.fillText(this.nearestInteractable.prompt, s.x, badgeY + 34);

    if (this.isLooting) {
      this.ctx.strokeStyle = '#f59e0b';
      this.ctx.lineWidth = 4;
      this.ctx.beginPath();
      this.ctx.arc(s.x, badgeY - 14, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.lootProgress);
      this.ctx.stroke();
    }

    this.ctx.restore();
  }

  // --- WAYPOINT PORTAL & BORDER POST RENDERING ---
  private drawWaypointPortal(wp: MapWaypoint) {
    const s = this.toScreen(wp.x, wp.y);
    const distToPlayer = Math.hypot(this.player.x - wp.x, this.player.y - wp.y);
    const isNearby = distToPlayer < 2.5;

    this.ctx.save();

    // 1. Ground holographic teleport pad
    const padRadius = 26;
    const pulse = (Math.sin(this.gameTime * 3 + wp.x) + 1) * 0.5;
    this.ctx.strokeStyle = withAlpha(themeAccent('rift'), 0.55 + pulse * 0.35);
    this.ctx.lineWidth = 2;
    this.ctx.fillStyle = withAlpha('#f5d0fe', 0.35 + pulse * 0.3);
    this.ctx.shadowColor = themeAccent('rift');
    this.ctx.shadowBlur = 16;

    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, padRadius + pulse * 0.5, (padRadius + pulse * 0.5) * 0.5, 0, 0, Math.PI * 2);
    this.ctx.stroke();

    // Inner rotating ring
    this.ctx.setLineDash([6, 6]);
    this.ctx.beginPath();
    this.ctx.ellipse(s.x, s.y, padRadius * 0.65, padRadius * 0.32, this.gameTime * 2, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.setLineDash([]);

    // 2. Vertical energy pillar beam
    const beamGrad = this.ctx.createLinearGradient(s.x, s.y, s.x, s.y - 70);
    beamGrad.addColorStop(0, isNearby ? 'rgba(16, 185, 129, 0.45)' : 'rgba(6, 182, 212, 0.4)');
    beamGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    this.ctx.fillStyle = beamGrad;
    this.ctx.fillRect(s.x - 12, s.y - 70, 24, 70);

    // 3. Floating Holographic Signpost
    const floatY = s.y - 82 + Math.sin(this.gameTime * 3) * 4;
    const badgeW = 140;
    const badgeH = 44;

    this.ctx.fillStyle = 'rgba(8, 22, 34, 0.9)';
    this.ctx.strokeStyle = isNearby ? '#10b981' : '#06b6d4';
    this.ctx.lineWidth = 1.8;
    this.ctx.beginPath();
    this.ctx.roundRect(s.x - badgeW / 2, floatY - badgeH / 2, badgeW, badgeH, 6);
    this.ctx.fill();
    this.ctx.stroke();

    // Text: Icon & Waypoint Name
    this.ctx.fillStyle = '#f8fafc';
    this.ctx.font = 'bold 11px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`${wp.icon} ${wp.name}`, s.x, floatY - 4);

    // Prompt
    this.ctx.fillStyle = isNearby ? '#34d399' : '#38bdf8';
    this.ctx.font = '10px sans-serif';
    this.ctx.fillText(isNearby ? '▼ [按 F 跨区穿越]' : `靠近跨区 (${Math.round(distToPlayer * 10)}m)`, s.x, floatY + 13);

    this.ctx.restore();
  }

  // --- SCREEN CENTER ZONE TRANSITION BANNER ---
  private renderZoneTransitionBanner() {
    if (!this.zoneTransitionBanner) return;

    const banner = this.zoneTransitionBanner;
    const alpha = Math.min(1, banner.timer / 0.5);

    this.ctx.save();
    this.ctx.globalAlpha = alpha;

    const bannerW = Math.min(this.width * 0.75, 480);
    const bannerH = 64;
    const bx = this.width / 2 - bannerW / 2;
    const by = 80;

    // Glowing cyberpunk background
    this.ctx.fillStyle = 'rgba(10, 25, 40, 0.94)';
    this.ctx.strokeStyle = '#06b6d4';
    this.ctx.lineWidth = 2;
    this.ctx.shadowColor = '#06b6d4';
    this.ctx.shadowBlur = 24;

    this.ctx.beginPath();
    this.ctx.roundRect(bx, by, bannerW, bannerH, 8);
    this.ctx.fill();
    this.ctx.stroke();

    // Top title
    this.ctx.fillStyle = '#38bdf8';
    this.ctx.font = 'bold 16px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`📍 ${banner.text}`, this.width / 2, by + 28);

    // Subtitle
    this.ctx.fillStyle = '#cbd5e1';
    this.ctx.font = '12px sans-serif';
    this.ctx.fillText(banner.subText, this.width / 2, by + 48);

    this.ctx.restore();
  }
}

