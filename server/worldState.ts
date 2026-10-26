import { randomUUID } from 'node:crypto';
import type { BuildingEntity, BuildableType, Equipment, InteractableEntity, Item, MapZoneId, MonsterEntity, OnlinePlayer, WeatherType } from '../src/types/game';
import { ARMOR_BONUS_TABLE, ITEM_DEFS, makeItem, WEAPON_DAMAGE } from '../src/game/items';
import { CRAFT_RECIPES, craftingRecipe, findCraftingWorkbench, recipeFacility, recipeRequiresWorkbench } from '../src/game/crafting';
import { ARMOR_REDUCTION, killReward, MELEE, WEAPONS } from '../src/game/combat';
import { BUILD_RECIPES } from '../src/game/buildingRecipes';
import { ACID_SHIELD_DRAIN } from '../src/game/weather';
import { marketOffer } from '../src/game/market';
import { campExitPosition } from '../src/game/home';
import { hasLineOfSight, isPositionBlocked, MAX_BUILDING_HALF_EXTENT, PLAYER_COLLISION_RADIUS } from '../src/game/navigation';
import { BASE_INVENTORY_SLOTS, inventoryCapacity, resizeInventory, gatheringEffects } from '../src/game/equipmentRules';
import type { DbHandle } from './db';
import { TickUndo } from './tickUndo';
import { WORLD_NODE_RADIUS } from '../src/game/world';

export type ResourceKey = 'wood' | 'stone' | 'scrap' | 'parts' | 'food' | 'ammo' | 'c4' | 'medical' | 'credits' | 'shard';
export type Resources = Record<ResourceKey, number>;
export interface OnboardingProgress { wood: number; stone: number; explored: boolean; toolEquipped: boolean; ateFood: boolean; workbenchBuilt: boolean; turretBuilt: boolean; storageUsed: boolean; turretLoaded: boolean }
const emptyOnboarding = (): OnboardingProgress => ({ wood: 0, stone: 0, explored: false, toolEquipped: false, ateFood: false, workbenchBuilt: false, turretBuilt: false, storageUsed: false, turretLoaded: false });
export interface CampSummary { id: string; ownerId: string; ownerName: string; x: number; y: number; mapId: MapZoneId; members?: string[]; level?: number; size?: number; state?: 'active' | 'breached' }
interface Player extends OnlinePlayer {
  inventory: (Item | null)[]; equipment: Equipment; resources: Resources; campId: string | null;
  onboarding: OnboardingProgress;
  moveAt: number; moveBudget: number; actionAt: Record<string, number>; combatUntil: number;
  satiety: number; survivalAt: number;
  dashUntil: number; dashReadyAt: number;
  blueprints: string[];
  disconnectUntil: number;
  lastDamageAt: number;
  lastCombatDamageAt: number;
  xp: number; maxXp: number; kills: number;
}
export interface PlayerState extends OnlinePlayer { inventory: (Item | null)[]; equipment: Equipment; resources: Resources; campId: string | null; satiety: number; blueprints: string[]; xp: number; maxXp: number; kills: number; onboarding: OnboardingProgress; lastDamageAt: number; lastCombatDamageAt?: number }
export type WorldMonsterDefinition = Pick<MonsterEntity, 'id' | 'x' | 'y'> & Partial<MonsterEntity>;
export type AuthoritativeMonster = MonsterEntity & { respawnAt?: number; targetId?: string };
export type ProductionJob = NonNullable<BuildingEntity['production']>;
interface LootItem { itemId: string; name: string; count: number }
interface NodeState { stock: number; respawnAt: number; items?: LootItem[] }
interface Drop { id: string; name: string; mapId: MapZoneId; x: number; y: number; items: LootItem[]; expiresAt: number }
export interface PersistedWorld {
  version: 2 | 3;
  players: Record<string, Player>; camps: Record<string, CampSummary>; buildings: Record<string, BuildingEntity>;
  nodes: Record<string, NodeState>; storage: Record<string, Record<string, number>>; ammo: Record<string, number>;
  drops: Record<string, Drop>; reports: { ownerId: string; text: string; timestamp: number }[];
  handled: Record<string, string[]>;
  production: Record<string, ProductionJob>;
  monsters: Record<string, AuthoritativeMonster>;
  defenseAt: Record<string, number>;
}
export interface WorldRules {
  nodeAt(id: string): InteractableEntity | undefined;
  nodesNear(x: number, y: number): InteractableEntity[];
  buildingsNear(x: number, y: number): BuildingEntity[];
  campSiteAllowed(x: number, y: number): boolean;
  migrate(mapId: string, x: number, y: number): { mapId: MapZoneId; x: number; y: number };
  monstersNear?(x: number, y: number): WorldMonsterDefinition[];
  weather?(): WeatherType;
}
export interface GameAction { requestId: string; action: string; [key: string]: unknown }
export const isUntargetedFire = (packet: Record<string, unknown>) => packet.action === 'fire' && packet.monsterId === undefined && packet.targetId === undefined;
export const isPlayerTargetedFire = (packet: Record<string, unknown>) => packet.action === 'fire' && packet.monsterId === undefined && typeof packet.targetId === 'string';
const fireInterval = (weaponId: string) => (WEAPONS[weaponId]?.fireRate ?? 0.12) * 1000;

const SAVE_KEY = 'authoritative-world-v2';
const resourceKeys: ResourceKey[] = ['wood', 'stone', 'scrap', 'parts', 'food', 'ammo', 'c4', 'medical', 'credits', 'shard'];
const emptyResources = (): Resources => Object.fromEntries(resourceKeys.map(key => [key, 0])) as Resources;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const describedItem = (item: Item | null): Item | null => {
  if (!item || !Object.hasOwn(ITEM_DEFS, item.id)) return item;
  const definition = ITEM_DEFS[item.id];
  return { ...item, name: definition.name, desc: definition.desc };
};
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const positiveCount = (n: unknown): n is number => Number.isInteger(n) && Number(n) > 0 && Number(n) <= 999999;
function requireRule(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }

/** Counter materials have one authoritative representation; medical/food remain real usable inventory items. */
function resourceFor(id: string): ResourceKey | undefined {
  if (['wood', 'stone', 'scrap', 'credits', 'shard'].includes(id)) return id as ResourceKey;
  if (id === 'part' || id === 'parts') return 'parts';
  if (id === 'ammo' || id.startsWith('ammo_')) return 'ammo';
  if (id === 'c4_explosive') return 'c4';
  return undefined;
}
const resourceItemId = (key: ResourceKey) => key === 'parts' ? 'part' : key === 'c4' ? 'c4_explosive' : key;

// Same costs and durability as the existing placement palette; clients never choose their own costs or HP.
const BUILD = BUILD_RECIPES;

export class GameWorld {
  state: PersistedWorld;
  private active = new Map<string, number>();
  private respawns = new Map<string, number>();
  private npcTickAt: number;
  private resourceTickAt: number;
  private periodicSharedDirty = false;
  private pendingDisconnects = new Set<string>();
  private tickSharedChange = false;
  get sharedTickChanged() { return this.tickSharedChange; }
  constructor(private db: DbHandle, private rules: WorldRules, private now: () => number = Date.now) {
    this.npcTickAt = now();
    this.resourceTickAt = now();
    const saved = db.getMeta(SAVE_KEY);
    const commits = db.listWorldPlayerCommits();
    requireRule(saved || !commits.length, '缺少角色提交记录对应的世界存档');
    if (saved) {
      this.state = JSON.parse(saved);
      requireRule(this.state.version === 2 || this.state.version === 3, '不支持的世界存档版本');
      for (const { id, data } of commits) {
        const commit = JSON.parse(data) as { player: Player; handled: string[] };
        requireRule(this.state.version === 3 && Object.hasOwn(this.state.players, id) && commit?.player?.id === id && Array.isArray(commit.handled) && commit.handled.length <= 128, '无效的角色提交记录');
        this.state.players[id] = commit.player;
        this.state.handled[id] = commit.handled;
      }
      // Older servers must refuse this format instead of ignoring private commits.
      this.state.version = 3;
      this.state.production ||= {};
      this.state.monsters ||= {};
      this.state.defenseAt ||= {};
      for (const p of Object.values(this.state.players)) { p.satiety ??= 100; p.survivalAt = this.now(); p.blueprints ||= []; p.disconnectUntil ??= 0; p.lastDamageAt ??= this.now(); p.lastCombatDamageAt ??= p.lastDamageAt; p.xp ??= 0; p.maxXp ||= p.level * 100; p.kills ??= 0; this.deriveArmor(p); }
      for (const p of Object.values(this.state.players)) while (p.inventory.length < inventoryCapacity(p.equipment.pack?.id)) p.inventory.push(null);
      for (const camp of Object.values(this.state.camps)) { camp.members ||= []; camp.level ||= 1; camp.size ||= 64; camp.state = this.core(camp)?.hp === 0 ? 'breached' : 'active'; }
      for (const p of Object.values(this.state.players)) {
        // A recorded disconnect deadline takes precedence even after it expires; later damage must not extend the body lifetime on restart.
        const until = p.disconnectUntil || p.combatUntil;
        if (until > this.now()) this.active.set(p.id, until);
      }
    } else {
      this.state = { version: 3, players: {}, camps: {}, buildings: {}, nodes: {}, storage: {}, ammo: {}, drops: {}, reports: [], handled: {}, production: {}, monsters: {}, defenseAt: {} };
      // Preserve legacy rows separately. Migrate coordinates and ownership, without generating old template loot.
      for (const legacy of db.listPlayers()) {
        const p = this.newPlayer(legacy.id, legacy.name || '废土流浪者');
        const pos = rules.migrate(String(legacy.mapId || 'camp_plaza'), Number(legacy.x) || 0, Number(legacy.y) || 0);
        Object.assign(p, pos, { hp: Math.min(100, Math.max(1, Number(legacy.hp) || 100)) });
        this.state.players[p.id] = p;
      }
      for (const row of db.listBuildings()) {
        const b = clone(row) as BuildingEntity;
        if (String(b.mapId).startsWith('home_') && b.mapId !== 'home_base' && b.ownerId && b.ownerId !== 'system') {
          const id = 'home_' + b.ownerId;
          const spawn = this.legacyEntrance();
          this.state.camps[id] ||= { id, ownerId: b.ownerId, ownerName: b.ownerName || '旧营地', x: spawn.x, y: spawn.y, mapId: 'world', members: [], level: 1, size: 64, state: 'active' };
          b.mapId = id as MapZoneId;
          if (this.state.players[b.ownerId]) this.state.players[b.ownerId].campId = id;
        } else {
          Object.assign(b, rules.migrate(String(b.mapId || 'camp_plaza'), b.x, b.y));
        }
        // Legacy storedLoot was generated demo rewards, never a player's actual deposited inventory.
        delete b.storedLoot;
        this.state.buildings[b.id] = b;
      }
      for (const p of Object.values(this.state.players)) if (p.mapId.startsWith('home_') && !this.state.camps[p.mapId]) Object.assign(p, { mapId: 'world', x: 0, y: 0 });
    }
    // Public geometry follows the current definitions. Keep only dynamic state
    // (damage, locks, open state); never move a private camp or reset inventory.
    for (const [id, savedBuilding] of Object.entries(this.state.buildings)) {
      if (savedBuilding.mapId !== 'world' || !/^world:-?\d+:-?\d+:(poi:|b:)/.test(id)) continue;
      const definition = this.rules.buildingsNear(savedBuilding.x, savedBuilding.y).find(b => b.id === id);
      if (!definition) { delete this.state.buildings[id]; continue; }
      savedBuilding.x = definition.x; savedBuilding.y = definition.y;
      savedBuilding.name = definition.name;
      savedBuilding.facing = definition.facing; savedBuilding.doorWidth = definition.doorWidth;
    }
    // Old instances sometimes contained walls but no core; retain a paid-repair ruin instead of trapping their owner forever.
    for (const camp of Object.values(this.state.camps)) {
      let core = this.core(camp);
      if (!core) {
        core = { id: camp.id + '_core', type: 'anchor_core', name: '待修复营地核心', x: 0, y: 0, hp: 0, maxHp: 1200, level: 1, mapId: camp.id as MapZoneId, ownerId: camp.ownerId, ownerName: camp.ownerName };
        this.state.buildings[core.id] = core;
      }
      camp.state = core.hp > 0 ? 'active' : 'breached';
    }
    // Migrate only facts that existing saves can prove; past meals cannot be reconstructed.
    for (const p of Object.values(this.state.players)) {
      p.onboarding = { ...emptyOnboarding(), ...p.onboarding };
      p.onboarding.wood = Math.max(p.onboarding.wood, Math.min(20, p.resources.wood + (p.campId ? 20 : 0)));
      p.onboarding.stone = Math.max(p.onboarding.stone, Math.min(10, p.resources.stone + (p.campId ? 10 : 0)));
      p.onboarding.explored ||= p.mapId !== 'world' || Math.hypot(p.x, p.y) > 2.5;
      p.onboarding.toolEquipped ||= gatheringEffects(p.equipment.tool?.id).canMine;
    }
    for (const b of Object.values(this.state.buildings)) {
      const owner = b.ownerId && this.state.players[b.ownerId];
      if (owner && b.mapId === owner.campId) {
        owner.onboarding.workbenchBuilt ||= b.type === 'workbench';
        owner.onboarding.turretBuilt ||= b.type === 'turret';
        owner.onboarding.storageUsed ||= b.type === 'storage_box' && Object.values(this.state.storage[b.id] || {}).some(count => count > 0);
        owner.onboarding.turretLoaded ||= b.type === 'turret' && (this.state.ammo[b.id] || 0) >= 10;
      }
    }
    for (const [id, at] of Object.entries(this.state.defenseAt)) {
      const b = this.state.buildings[id];
      if (!finite(at) || !b || b.type !== 'turret' && b.type !== 'spikes') delete this.state.defenseAt[id];
    }
    this.persist();
  }

  private newPlayer(id: string, name: string): Player {
    return { id, name, level: 1, title: '废土流浪者', avatarSeed: id, x: 0, y: 0, angle: 0, mapId: 'world', hp: 100, maxHp: 100, shield: 0, maxShield: 50,
      isFiring: false, isDashing: false, color: '#06b6d4', ping: 0, lastSeen: this.now(), currentAction: '徒手求生',
      inventory: Array(BASE_INVENTORY_SLOTS).fill(null), equipment: { weapon: null, armor: null, tool: null, pack: null }, resources: emptyResources(), campId: null, onboarding: emptyOnboarding(),
      moveAt: this.now(), moveBudget: 0.25, actionAt: {}, combatUntil: 0, satiety: 100, survivalAt: this.now(), dashUntil: 0, dashReadyAt: 0, blueprints: [], disconnectUntil: 0, lastDamageAt: this.now(), lastCombatDamageAt: this.now(), xp: 0, maxXp: 100, kills: 0 };
  }

  private legacyEntrance(): { x: number; y: number } {
    for (let i = 0; i < 4096; i++) {
      const pos = { x: (i % 64 - 32) * 24 + 12, y: (Math.floor(i / 64) - 32) * 24 + 12 };
      if (this.rules.campSiteAllowed(pos.x, pos.y) && Object.values(this.state.camps).every(c => distance(c, pos) >= 12)) return pos;
    }
    throw new Error('无法为旧营地分配合法入口；保留原存档，请检查世界容量');
  }

  connect(id: string, name: string) {
    const undo = new TickUndo();
    let p: Player;
    try {
      undo.entry(this.state.players, id);
      p = this.state.players[id] ||= this.newPlayer(id, name);
      undo.object(p);
      this.clearSpawn(p);
      p.moveBudget ??= 0.25; p.moveAt ??= this.now(); p.lastSeen = this.now(); p.survivalAt = this.now(); p.disconnectUntil = 0;
      this.deriveArmor(p);
      this.ensureMonsters(p, undo);
      undo.map(this.active, id);
      this.active.set(id, Infinity);
      this.persist();
    } catch (error) { undo.rollback(); throw error; }
    return this.publicPlayer(p);
  }

  disconnect(id: string) {
    const p = this.state.players[id];
    if (!p) return;
    // A disconnected intruder remains attackable for 30 seconds, in the same persistent instance.
    // Keep this physical disconnect fact on save failure; later checkpoints retry without extending it.
    p.disconnectUntil = p.mapId.startsWith('home_') || p.combatUntil > this.now() ? this.now() + 30_000 : this.now();
    this.active.set(id, p.disconnectUntil);
    this.pendingDisconnects.add(id);
    this.persist();
  }

  persist() {
    this.db.checkpointWorld(JSON.stringify(this.state));
    this.periodicSharedDirty = false;
    this.pendingDisconnects.clear();
  }

  persistPeriodic() {
    if (this.periodicSharedDirty) { this.persist(); return; }
    const time = this.now();
    const ids = new Set([...this.active].filter(([, until]) => until > time).map(([id]) => id));
    for (const id of this.pendingDisconnects) ids.add(id);
    const rows = [...ids].map(id => ({ id, data: JSON.stringify({ player: this.state.players[id], handled: this.state.handled[id] || [] }) }));
    if (!rows.length) return;
    this.db.saveWorldPlayerCommits(rows);
    this.pendingDisconnects.clear();
  }

  private buildingsFor(p: { mapId: MapZoneId; x: number; y: number }, to?: { x: number; y: number }): BuildingEntity[] {
    const persistent: BuildingEntity[] = [];
    const known = p.mapId === 'world' ? new Set<string>() : undefined;
    const padding = MAX_BUILDING_HALF_EXTENT + PLAYER_COLLISION_RADIUS + 1e-9; // Conservative rounding margin; exact checks below stay unchanged.
    const minX = Math.min(p.x, to?.x ?? p.x) - padding, maxX = Math.max(p.x, to?.x ?? p.x) + padding;
    const minY = Math.min(p.y, to?.y ?? p.y) - padding, maxY = Math.max(p.y, to?.y ?? p.y) + padding;
    const inWindow = (b: BuildingEntity) => !(b.x < minX || b.x > maxX || b.y < minY || b.y > maxY)
      || (b.type === 'door' || b.type === 'safe_door') && !Number.isFinite(b.doorWidth ?? 1);
    for (const id of Object.keys(this.state.buildings)) {
      const b = this.state.buildings[id];
      if (b.mapId === p.mapId && (p.mapId !== 'world' || distance(p, b) < 80)) {
        known?.add(b.id); // A culled override must still hide its generated definition.
        if (!to || inWindow(b)) persistent.push(b);
      }
    }
    if (p.mapId !== 'world') return persistent;
    return persistent.concat(this.rules.buildingsNear(p.x, p.y).filter(b => !known!.has(b.id) && (!to || inWindow(b))));
  }

  private clearSpawn(p: Player) {
    const buildings = this.buildingsFor(p);
    if (!isPositionBlocked(p.x, p.y, buildings)) return;
    for (let r = 1; r <= 12; r++) for (const [dx, dy] of [[0, r], [r, 0], [0, -r], [-r, 0], [r, r], [-r, r], [r, -r], [-r, -r]]) {
      const x = p.x + dx, y = p.y + dy;
      if (!isPositionBlocked(x, y, buildings)) { p.x = x; p.y = y; return; }
    }
    throw new Error('出生点周围没有可通行位置');
  }

  private publicPlayer(p: Player): OnlinePlayer {
    const { id, name, level, title, avatarSeed, x, y, angle, mapId, hp, maxHp, shield, maxShield, isFiring, isDashing, color, ping, lastSeen, currentAction } = p;
    return { id, name, level, title, avatarSeed, x, y, angle, mapId, hp, maxHp, shield, maxShield, isFiring, isDashing, color, ping, lastSeen, currentAction };
  }

  visiblePlayers(id: string) {
    const self = this.state.players[id];
    if (!self) return [];
    return [...this.active].filter(([, until]) => until > this.now()).map(([key]) => this.state.players[key])
      .filter(p => p && p.mapId === self.mapId && (self.mapId !== 'world' || distance(p, self) <= 80)).map(p => this.publicPlayer(p));
  }

  private playerView(p: Player): PlayerState {
    const resources = { ...p.resources };
    resources.food = p.inventory.reduce((sum, item) => sum + (item?.category === 'food' ? item.count : 0), 0);
    resources.medical = p.inventory.reduce((sum, item) => sum + (item?.category === 'medical' ? item.count : 0), 0);
    const equipment = { ...p.equipment };
    for (const slot of ['weapon', 'armor', 'tool', 'pack'] as const) equipment[slot] = describedItem(equipment[slot]);
    return { ...this.publicPlayer(p), inventory: p.inventory.map(describedItem), equipment, resources, campId: p.campId, satiety: p.satiety, blueprints: p.blueprints, xp: p.xp, maxXp: p.maxXp, kills: p.kills, onboarding: p.onboarding, lastDamageAt: p.lastDamageAt, lastCombatDamageAt: p.lastCombatDamageAt };
  }

  snapshotPlayer(id: string, requestId?: string, error?: string, loot?: { id: string; name: string; items: LootItem[] }, correction = false) {
    return clone({ requestId, error, correction, player: this.playerView(this.state.players[id]), loot });
  }

  snapshot(id: string, requestId?: string, error?: string, loot?: { id: string; name: string; items: LootItem[] }, correction = false) {
    const p = this.state.players[id];
    this.ensureMonsters(p);
    const player = this.playerView(p);
    // Building fields are scalar except the private loot (omitted) and job
    // (copied below). Do not JSON-roundtrip thousands of already-detached rows.
    const buildings = this.buildingsFor(p).map(b => {
      const { storedLoot: _, production: _production, ...visible } = b;
      const job = this.canUse(p.id, b) ? this.state.production[b.id] : undefined;
      return Object.assign(visible, { ammo: this.state.ammo[b.id] || 0, production: job ? { ...job } : undefined });
    });
    return { ...clone({ requestId, error, correction, player,
      camps: Object.values(this.state.camps).filter(c => c.ownerId === id || c.members?.includes(id) || c.id === p.mapId || p.mapId === 'world' && distance(c, p) <= 80),
      nodes: p.mapId === 'world' ? this.rules.nodesNear(p.x, p.y).map(def => { const node = this.state.nodes[def.id]; return { id: def.id, stock: node?.stock ?? def.stock ?? 1, respawnAt: node?.respawnAt || 0 }; }) : [],
      drops: Object.values(this.state.drops).filter(drop => drop.mapId === p.mapId && distance(p, drop) <= 40).map(({ items: _, ...drop }) => drop),
      monsters: p.mapId === 'world' ? Object.values(this.state.monsters).filter(monster => distance(p, monster) <= 45) : [],
      reports: this.state.reports.filter(report => report.ownerId === id).slice(-30), loot }), buildings };
  }

  move(id: string, packet: Record<string, unknown>): boolean {
    const p = this.state.players[id];
    if (!p) return false;
    p.lastSeen = this.now();
    if (!finite(packet.x) || !finite(packet.y) || (packet.mapId !== undefined && packet.mapId !== p.mapId)) return false;
    const limit = p.mapId === 'world' ? 1024 : (this.state.camps[p.mapId]?.size || 64) / 2;
    if (packet.x < -limit || packet.y < -limit || packet.x >= limit || packet.y >= limit) return false;
    const elapsed = Math.max(0, Math.min(0.5, (this.now() - p.moveAt) / 1000));
    // The accumulated budget is spent on accepted moves, preventing repeated packet slack from creating speed.
    if (packet.isDashing === true && this.now() >= (p.dashReadyAt || 0)) { p.dashUntil = this.now() + 220; p.dashReadyAt = this.now() + 1500; }
    const dashing = packet.isDashing === true && this.now() < (p.dashUntil || 0);
    const speed = dashing ? 15 : 3.8;
    p.moveBudget = Math.min(speed * 0.5, (p.moveBudget ?? 0.25) + elapsed * speed); p.moveAt = this.now();
    const travelled = distance(p, { x: packet.x, y: packet.y });
    if (travelled > p.moveBudget + 1e-6) return false;
    const to = { x: packet.x, y: packet.y };
    // Unchanged coordinates carry aim/action updates, without traversing geometry.
    if (to.x !== p.x || to.y !== p.y) {
      const buildings = this.buildingsFor(p, to);
      if (isPositionBlocked(to.x, to.y, buildings) || !hasLineOfSight(p, to, buildings)) return false;
    }
    p.x = to.x; p.y = to.y; p.moveBudget = Math.max(0, p.moveBudget - travelled);
    p.onboarding.explored ||= p.mapId === 'world' && Math.hypot(p.x, p.y) > 2.5;
    if (finite(packet.angle)) p.angle = packet.angle;
    p.isFiring = packet.isFiring === true; p.isDashing = dashing;
    return true;
  }

  private node(def: InteractableEntity): NodeState {
    let node = this.state.nodes[def.id];
    if (!node) node = this.state.nodes[def.id] = { stock: Number.isFinite(def.stock) ? def.stock! : 1, respawnAt: 0 };
    return node;
  }

  private renewResources(time: number, players: Player[], undo: TickUndo) {
    if (time - this.resourceTickAt < 5000) return false;
    this.resourceTickAt = time;
    const observers = players.filter(p => p.mapId === 'world');
    let changed = false;
    for (const [id, node] of Object.entries(this.state.nodes)) {
      if (node.stock > 0 || !(node.respawnAt > 0 && node.respawnAt <= time) || node.items?.some(item => item.count > 0)) continue;
      const def = this.rules.nodeAt(id);
      if (!def || observers.some(p => distance(p, def) <= WORLD_NODE_RADIUS)) continue;
      undo.object(node);
      node.stock = Number.isFinite(def.maxStock) ? def.maxStock! : 1; node.respawnAt = 0; delete node.items;
      changed = true;
    }
    return changed;
  }

  private near(p: Player, target: { x: number; y: number; id?: string; mapId?: MapZoneId }, range = 3) {
    requireRule(!target.mapId || p.mapId === target.mapId, '目标不在当前空间');
    requireRule(distance(p, target) <= range, '距离过远');
    requireRule(hasLineOfSight(p, target, this.buildingsFor(p), target.id), '目标被建筑遮挡，请绕到旁边');
  }

  private cooldown(p: Player, key: string, ms: number, at = this.now(), jitter = 0) {
    const scheduledAt = Math.max(at, (p.actionAt[key] ?? -Infinity) + ms);
    requireRule(scheduledAt <= at + jitter, '操作过快');
    return scheduledAt;
  }
  private checkCost(p: Player, cost: Partial<Resources>) {
    for (const key of resourceKeys) requireRule(p.resources[key] >= (cost[key] || 0), '材料不足');
  }
  private canUse(playerId: string, building: BuildingEntity): boolean {
    const camp = building.mapId ? this.state.camps[building.mapId] : undefined;
    return building.ownerId === playerId || !!camp && camp.ownerId === building.ownerId && !!camp.members?.includes(playerId);
  }
  private deriveArmor(p: Player) {
    const id = p.equipment.armor?.id;
    p.maxShield = 50 + (p.level - 1) * 5 + (id ? ITEM_DEFS[id]?.shield ?? ARMOR_BONUS_TABLE[id] ?? 0 : 0);
    p.shield = Math.max(0, Math.min(p.shield, p.maxShield));
  }
  private ensureMonsters(p: Player, undo?: TickUndo) {
    if (p.mapId !== 'world') return;
    for (const def of this.rules.monstersNear?.(p.x, p.y) || []) {
      if (distance(p, def) > 40 || Object.hasOwn(this.state.monsters, def.id)) continue;
      undo?.entry(this.state.monsters, def.id);
      this.state.monsters[def.id] = { id: def.id, name: def.name || '荒野异变兽', x: def.x, y: def.y, hp: def.hp ?? def.maxHp ?? 90, maxHp: def.maxHp ?? def.hp ?? 90,
        speed: def.speed ?? 1.8, damage: def.damage ?? 10, state: 'roam', animTime: 0, attackCooldown: 0, spawnX: def.spawnX ?? def.x, spawnY: def.spawnY ?? def.y, windup: 0 };
      this.periodicSharedDirty = true;
    }
  }
  private attackMonster(p: Player, id: unknown, ranged: boolean) {
    requireRule(p.mapId === 'world' && typeof id === 'string', '怪物不在当前空间');
    this.ensureMonsters(p);
    const monster = this.state.monsters[id]; requireRule(monster && monster.hp > 0 && monster.state !== 'dead', '怪物已死亡或不存在');
    const weapon = p.equipment.weapon;
    const range = ranged && weapon ? WEAPONS[weapon.id]?.range ?? 12 : MELEE.range;
    this.near(p, monster, range);
    const amount = ranged && weapon ? WEAPON_DAMAGE[weapon.id] || WEAPONS[weapon.id]?.damage || 55 : p.equipment.tool ? MELEE.tool : MELEE.bare;
    monster.hp = Math.max(0, monster.hp - amount); monster.state = monster.hp > 0 ? 'hurt' : 'dead';
    if (monster.hp <= 0) {
      monster.respawnAt = this.now() + 120000; monster.windup = 0; monster.attackCooldown = 0; delete monster.targetId;
      const reward = killReward(monster.maxHp); p.resources.credits += reward.credits; p.resources.shard += reward.shards; p.xp += reward.xp; p.kills++;
      while (p.xp >= p.maxXp) { p.xp -= p.maxXp; p.level++; p.maxXp = p.level * 100; p.maxHp = 100 + (p.level - 1) * 10; }
      this.deriveArmor(p);
    } else {
      monster.targetId = p.id;
    }
    p.combatUntil = this.now() + 30000;
  }
  private core(camp: CampSummary) {
    return Object.values(this.state.buildings).find(b => b.mapId === camp.id && b.ownerId === camp.ownerId && b.type === 'anchor_core');
  }
  private ownerAtCore(p: Player): CampSummary {
    const camp = this.state.camps[p.mapId]; requireRule(camp && camp.ownerId === p.id, '只有营地主人可管理');
    const core = this.core(camp); requireRule(core && core.hp > 0, '请先修复营地核心'); this.near(p, core); return camp;
  }
  private recipeExtras(recipe: typeof CRAFT_RECIPES[number]) {
    const extras = [...(recipe.cost.extra || [])];
    if (recipe.id === 'dried_fish' && !extras.some(extra => extra.itemId === 'fish')) extras.push({ itemId: 'fish', count: 2 });
    return extras;
  }
  private payRecipe(p: Player, recipe: typeof CRAFT_RECIPES[number]) {
    this.checkCost(p, recipe.cost); const extras = this.recipeExtras(recipe);
    for (const extra of extras) requireRule(this.count(p, extra.itemId) >= extra.count, '额外材料不足');
    this.spend(p, recipe.cost); for (const extra of extras) this.remove(p, extra.itemId, extra.count);
  }
  private spend(p: Player, cost: Partial<Resources>) { for (const key of resourceKeys) p.resources[key] -= cost[key] || 0; }
  private count(p: Player, itemId: string) { const resource = resourceFor(itemId); return resource ? p.resources[resource] : p.inventory.reduce((n, item) => n + (item?.id === itemId ? item.count : 0), 0); }
  private remove(p: Player, itemId: string, count: number) {
    const resource = resourceFor(itemId);
    if (resource) { p.resources[resource] -= count; return; }
    for (let i = 0; i < p.inventory.length && count > 0; i++) {
      const item = p.inventory[i]; if (item?.id !== itemId) continue;
      const n = Math.min(item.count, count); item.count -= n; count -= n;
      if (!item.count) p.inventory[i] = null;
    }
  }
  private add(p: Player, itemId: string, count: number) {
    const resource = resourceFor(itemId);
    if (resource) {
      p.resources[resource] += count;
      if (resource === 'wood' || resource === 'stone') p.onboarding[resource] = Math.min(resource === 'wood' ? 20 : 10, p.onboarding[resource] + count);
      return;
    }
    requireRule(ITEM_DEFS[itemId], '未知物品');
    const capacity = p.inventory.reduce((sum, item) => sum + (item ? item.id === itemId ? item.maxCount - item.count : 0 : ITEM_DEFS[itemId].maxCount), 0);
    requireRule(capacity >= count, '背包已满');
    for (const item of p.inventory) if (item?.id === itemId && item.count < item.maxCount) { const n = Math.min(count, item.maxCount - item.count); item.count += n; count -= n; }
    for (let i = 0; i < p.inventory.length && count > 0; i++) if (!p.inventory[i]) { const n = Math.min(count, ITEM_DEFS[itemId].maxCount); p.inventory[i] = makeItem(itemId, n); count -= n; }
  }

  respawnVersion(id: string) { return this.respawns.get(id) || 0; }

  fireContext(id: string) {
    const p = this.state.players[id];
    return JSON.stringify([p?.mapId, p?.equipment.weapon, this.respawnVersion(id)]);
  }

  fireWindow(id: string, packet: GameAction) {
    const p = this.state.players[id];
    if (packet?.action !== 'fire' || typeof packet.requestId !== 'string' || !packet.requestId || packet.requestId.length > 120 || this.state.handled[id]?.includes(packet.requestId) || !p?.equipment.weapon || p.resources.ammo <= 0) return;
    const interval = fireInterval(p.equipment.weapon.id);
    const delayMs = (p.actionAt.attack ?? -Infinity) + interval - this.now();
    // Keep existing small-jitter debt handling. Larger gaps wait rather than
    // applying damage early, and cannot reserve more than one weapon interval.
    if (delayMs > Math.min(20, interval / 4) && delayMs <= interval) return { delayMs, maxDelayMs: interval, context: this.fireContext(id) };
  }

  action(id: string, packet: GameAction) {
    return this.runAction(id, packet, (...args) => this.snapshot(...args));
  }

  actionPlayer(id: string, packet: GameAction) {
    requireRule(isUntargetedFire(packet), '仅无目标射击可使用角色状态回复');
    return this.runAction(id, packet, (...args) => this.snapshotPlayer(...args));
  }

  actionCombat(id: string, packet: GameAction) {
    requireRule(isPlayerTargetedFire(packet), '仅玩家目标射击可使用战斗回复');
    const targetId = String(packet.targetId), life = this.respawnVersion(targetId);
    const replayed = this.state.handled[id]?.includes(packet.requestId) || false;
    const state = this.runAction(id, packet, (...args) => this.snapshotPlayer(...args));
    // Replays resynchronize shared state too, including a death whose first reply failed.
    return { state, targetId, requiresFullSync: !state.error && (replayed || life !== this.respawnVersion(targetId)) };
  }

  private runAction<T>(id: string, packet: GameAction, reply: (...args: Parameters<GameWorld['snapshot']>) => T): T {
    const receivedAt = this.now();
    const p = this.state.players[id];
    if (!p) throw new Error('角色未接入');
    const requestId = typeof packet?.requestId === 'string' ? packet.requestId : '';
    if (!requestId || requestId.length > 120 || typeof packet?.action !== 'string') return reply(id, requestId, '无效操作请求');
    if (this.state.handled[id]?.includes(requestId)) return reply(id, requestId);
    // Untargeted fire mutates only this player and their replay ledger. Shared
    // combat (including every targeted shot) still needs the full rollback copy.
    const beforeRespawns = isUntargetedFire(packet) ? undefined : new Map(this.respawns);
    const before = isUntargetedFire(packet) ? {
      ...this.state,
      players: { ...this.state.players, [id]: clone(p) },
      handled: { ...this.state.handled, ...(this.state.handled[id] ? { [id]: [...this.state.handled[id]] } : {}) },
    } : clone(this.state);
    let loot: { id: string; name: string; items: LootItem[] } | undefined;
    try {
      loot = this.perform(p, packet, receivedAt);
      (this.state.handled[id] ||= []).push(requestId);
      this.state.handled[id] = this.state.handled[id].slice(-128);
      if (isUntargetedFire(packet)) {
        // This branch changes no shared entities. Player and replay guard commit
        // together before acknowledgement; full checkpoints absorb these rows.
        this.db.saveWorldPlayerCommit(id, JSON.stringify({ player: p, handled: this.state.handled[id] }));
      } else this.persist(); // Both sides of transfers and their replay guards stay in one durable checkpoint.
    } catch (error) {
      if (beforeRespawns) this.respawns = beforeRespawns;
      // Failed validation is side effect free; disk failures also roll back the complete transaction.
      for (const [key, oldPlayer] of Object.entries(before.players)) {
        if (this.state.players[key]) Object.assign(this.state.players[key], oldPlayer);
      }
      const players = this.state.players;
      this.state = before; this.state.players = players;
      return reply(id, requestId, error instanceof Error ? error.message : '操作失败');
    }
    // A response failure cannot undo a durable transaction. Retrying its request
    // must see the committed replay guard, including after a later checkpoint.
    return reply(id, requestId, undefined, loot, p.mapId !== before.players[id].mapId);
  }

  private perform(p: Player, a: GameAction, receivedAt: number): { id: string; name: string; items: LootItem[] } | undefined {
    const targetId = typeof a.targetId === 'string' ? a.targetId : '';
    if (a.action === 'search') {
      const drop = this.state.drops[targetId];
      if (drop) { this.near(p, drop); requireRule(drop.expiresAt > this.now(), '掉落包已过期'); return { id: drop.id, name: drop.name, items: drop.items }; }
      const building = this.state.buildings[targetId];
      if (building?.type === 'storage_box') {
        this.near(p, building); requireRule(this.canUse(p.id, building) || building.hp <= 0, '仓库尚未攻破');
        return this.storageLoot(building);
      }
    }
    if (a.action === 'take_loot' && this.state.buildings[targetId]?.type === 'storage_box') return this.perform(p, { ...a, action: 'withdraw' }, receivedAt);
    if (a.action === 'gather' || a.action === 'search') {
      requireRule(p.mapId === 'world', '只能在公共世界采集');
      const def = this.rules.nodeAt(targetId); requireRule(def, '资源不存在'); this.near(p, def);
      const node = this.node(def); requireRule(node.stock > 0, '资源已耗尽');
      if (a.action === 'search') {
        requireRule(!['tree', 'boulder', 'pond', 'crystal', 'workbench', 'campfire'].includes(def.type), '该目标不能搜刮');
        node.items ||= clone(def.lootTable || [{ itemId: def.type === 'med_cabinet' ? 'bandage' : def.type === 'ammo_crate' ? 'ammo' : 'scrap', name: '搜刮物资', count: 2 }]);
        return { id: def.id, name: def.name, items: node.items };
      }
      requireRule(['tree', 'boulder', 'pond', 'crystal', 'scrap'].includes(def.type), '该目标需要搜刮');
      this.cooldown(p, 'gather', 800);
      const tool = p.equipment.tool?.id || '';
      const effects = gatheringEffects(tool), isPick = effects.canMine, isRod = effects.canFish;
      requireRule(def.type !== 'pond' || isRod, '钓鱼需要装备钓竿');
      requireRule(def.type !== 'crystal' || isPick, '晶矿需要装备镐');
      const itemId = def.type === 'tree' ? 'wood' : def.type === 'boulder' ? 'stone' : def.type === 'pond' ? 'fish' : def.type === 'crystal' ? 'shard' : 'scrap';
      const minerals = (def.lootTable || []).filter(item => item.count > 0 && ITEM_DEFS[item.itemId] && (item.itemId.startsWith('ore_') || ['iron_ore', 'shard', 'plasma', 'dark_core'].includes(item.itemId)));
      if (def.type === 'crystal' && minerals.length) {
        for (const mineral of minerals.slice(0, 2)) this.add(p, mineral.itemId, 1);
      } else if (def.type === 'pond') {
        const fish = (def.lootTable || []).filter(item => item.count > 0 && item.itemId.startsWith('fish') && ITEM_DEFS[item.itemId]?.category === 'food');
        const harvested = Math.max(0, (def.maxStock ?? def.stock ?? node.stock) - node.stock);
        const fishId = fish.length ? fish[harvested % fish.length].itemId : 'fish';
        this.add(p, fishId, fishId === 'fish' ? 2 : 1);
      } else {
        this.add(p, itemId, def.type === 'tree' ? effects.wood : def.type === 'boulder' ? effects.stone : 1);
        if (def.type === 'boulder' && isPick) for (const mineral of minerals.filter(item => item.itemId !== itemId).slice(0, 2)) this.add(p, mineral.itemId, 1);
      }
      node.stock--; if (!node.stock) node.respawnAt = this.now() + (def.respawnSec || 180) * 1000;
      p.actionAt.gather = this.now(); return;
    }
    if (a.action === 'take_loot') {
      requireRule(typeof a.itemId === 'string' && positiveCount(a.count), '领取数量无效');
      const drop = this.state.drops[targetId];
      const def = p.mapId === 'world' ? this.rules.nodeAt(targetId) : undefined;
      requireRule(drop || def, '容器不存在'); this.near(p, (drop || def)!);
      requireRule(!drop || drop.expiresAt > this.now(), '掉落包已过期');
      const node = def ? this.node(def) : undefined;
      const items = drop?.items || node?.items;
      const item = items?.find(i => i.itemId === a.itemId); requireRule(item && item.count >= a.count, '物品已被取走');
      this.add(p, item.itemId, a.count); item.count -= a.count;
      const remaining = items!.filter(i => i.count > 0);
      if (drop) { drop.items = remaining; if (!remaining.length) delete this.state.drops[targetId]; }
      if (node) { node.items = remaining; if (!remaining.length) { node.stock = 0; node.respawnAt = this.now() + (def!.respawnSec || 180) * 1000; } }
      return { id: targetId, name: drop?.name || def!.name, items: remaining };
    }
    if (a.action === 'create_camp') {
      requireRule(p.mapId === 'world' && !p.campId, '每人只能建立一个营地');
      requireRule(finite(a.x) && finite(a.y) && a.x >= -1020 && a.x < 1020 && a.y >= -1020 && a.y < 1020, '营地坐标无效');
      this.near(p, { x: a.x, y: a.y });
      requireRule(this.rules.campSiteAllowed(a.x, a.y), '避难点、道路、河流或地标保护范围内不能建营');
      requireRule(!isPositionBlocked(a.x, a.y, this.buildingsFor(p), 1.5) && this.rules.nodesNear(a.x, a.y).every(n => distance(n, { x: a.x as number, y: a.y as number }) >= 2), '营地入口不能占用建筑或资源');
      requireRule(Object.values(this.state.camps).every(camp => distance(camp, { x: a.x as number, y: a.y as number }) >= 12), '距离其他营地过近');
      this.checkCost(p, { wood: 20, stone: 10 }); this.spend(p, { wood: 20, stone: 10 });
      const id = `home_${p.id}` as const; p.campId = id;
      this.state.camps[id] = { id, ownerId: p.id, ownerName: p.name, x: a.x, y: a.y, mapId: 'world', members: [], level: 1, size: 64, state: 'active' };
      const core: BuildingEntity = { id: id + '_core', type: 'anchor_core', name: '营地核心', x: 0, y: 0, hp: 1200, maxHp: 1200, level: 1, mapId: id, ownerId: p.id, ownerName: p.name };
      this.state.buildings[core.id] = core; return;
    }
    if (a.action === 'enter_camp') {
      const camp = this.state.camps[String(a.campId)]; requireRule(camp && p.mapId === 'world', '营地不存在或不在公共世界');
      this.near(p, camp); p.mapId = camp.id as MapZoneId; Object.assign(p, campExitPosition(camp.size)); p.moveAt = this.now(); return;
    }
    if (a.action === 'leave_camp') {
      const camp = this.state.camps[p.mapId]; requireRule(camp, '当前不在营地');
      requireRule(distance(p, campExitPosition(camp.size)) <= 3, '请到南侧出口撤离');
      p.mapId = 'world'; p.x = camp.x; p.y = camp.y; p.moveAt = this.now(); return;
    }
    if (a.action === 'authorize_member' || a.action === 'revoke_member') {
      const camp = this.ownerAtCore(p);
      requireRule(typeof a.playerId === 'string' && a.playerId !== p.id && Object.hasOwn(this.state.players, a.playerId), '成员身份不存在');
      const members = camp.members ||= [];
      if (a.action === 'authorize_member') { requireRule(!members.includes(a.playerId) && members.length < 8, '已授权或成员已满'); members.push(a.playerId); }
      else { requireRule(members.includes(a.playerId), '该玩家未获授权'); camp.members = members.filter(id => id !== a.playerId); }
      this.report(p.id, `${a.action === 'authorize_member' ? '授权' : '撤销'}成员 ${this.state.players[a.playerId].name}`); return;
    }
    if (a.action === 'upgrade_camp') {
      const camp = this.ownerAtCore(p); const level = camp.level || 1; requireRule(level < 3, '营地已达到当前扩建上限');
      const cost = level === 1 ? { stone: 60, scrap: 40, parts: 5 } : { stone: 120, scrap: 80, parts: 10 };
      this.checkCost(p, cost); this.spend(p, cost); camp.level = level + 1; camp.size = level === 1 ? 96 : 128; return;
    }
    if (['start_production', 'collect_production', 'research', 'rest', 'remove_building'].includes(a.action)) {
      const b = this.state.buildings[targetId]; requireRule(b && b.hp > 0, '设施不存在或已损坏'); this.near(p, b);
      requireRule(this.canUse(p.id, b), '未获得设施使用授权');
      if (a.action === 'remove_building') {
        requireRule(b.ownerId === p.id && b.type !== 'anchor_core' && p.combatUntil <= this.now(), '交战中或无权拆除');
        delete this.state.buildings[b.id]; delete this.state.production[b.id]; delete this.state.storage[b.id]; delete this.state.ammo[b.id]; delete this.state.defenseAt[b.id]; return;
      }
      if (a.action === 'rest') {
        requireRule(b.type === 'bed' && p.combatUntil <= this.now() && !this.hasHostile(b.mapId!), '交战中无法休息');
        this.cooldown(p, 'rest', 10000); p.hp = Math.min(p.maxHp, p.hp + 20); p.actionAt.rest = this.now(); return;
      }
      if (a.action === 'research') {
        requireRule(b.type === 'research_table' && !p.blueprints.includes('wp_plasma'), '研究台不可用或已学会蓝图');
        this.checkCost(p, { parts: 3, scrap: 10 }); requireRule(this.count(p, 'blueprint') >= 1, '缺少真实蓝图');
        this.remove(p, 'blueprint', 1); this.spend(p, { parts: 3, scrap: 10 }); p.blueprints.push('wp_plasma'); return;
      }
      if (a.action === 'start_production') {
        requireRule(!this.state.production[b.id], '设施已有生产任务');
        const recipe = craftingRecipe(a.recipeId); requireRule(recipe && recipeFacility(recipe) === b.type, '配方与设施不匹配');
        this.payRecipe(p, recipe);
        this.state.production[b.id] = { recipeId: recipe.id, resultItemId: recipe.resultItemId, resultCount: recipe.resultCount, readyAt: this.now() + (b.type === 'farm_plot' ? 60000 : 20000) }; return;
      }
      const job = this.state.production[b.id]; requireRule(job && job.readyAt <= this.now(), '生产尚未完成');
      this.add(p, job.resultItemId, job.resultCount); delete this.state.production[b.id]; return;
    }
    if (a.action === 'build') {
      requireRule(p.campId && p.mapId === p.campId && this.state.camps[p.campId]?.ownerId === p.id, '只能在自己的营地建造');
      requireRule(Object.values(this.state.buildings).some(b => b.mapId === p.campId && b.type === 'anchor_core' && b.ownerId === p.id && b.hp > 0), '营地核心已失守，请先修复核心');
      const type = a.buildType as BuildableType; const cost = BUILD[type]; requireRule(cost, '建筑类型无效');
      const bound = (this.state.camps[p.campId].size || 64) / 2 - 1;
      requireRule(finite(a.x) && finite(a.y) && Number.isInteger(a.x) && Number.isInteger(a.y) && Math.abs(a.x) < bound && Math.abs(a.y) < bound, '超出营地建设范围');
      const pos = { x: a.x, y: a.y }; this.near(p, pos);
      requireRule(!(Math.abs(a.x) < 3 && a.y > campExitPosition(this.state.camps[p.campId].size).y - 4) && distance(pos, { x: 0, y: 0 }) > 2, '核心与南侧出口需要保持通畅');
      const buildings = this.buildingsFor(p);
      requireRule(!buildings.some(b => b.hp > 0 && distance(b, pos) < (type.endsWith('_floor') !== b.type.endsWith('_floor') ? 0 : 0.9)), '此处已有建筑');
      requireRule(!['door', 'safe_door'].includes(type) || !buildings.some(b => b.type.includes('wall') && distance(b, pos) < 1.2 && Math.abs(b.x - pos.x) < 0.5 && Math.abs(b.y - pos.y) < 0.5), '门洞空间不足');
      this.checkCost(p, cost); this.spend(p, cost);
      const b: BuildingEntity = { id: 'build_' + randomUUID(), type, name: cost.name, ...pos, hp: cost.hp, maxHp: cost.hp, level: 1, mapId: p.mapId, ownerId: p.id, ownerName: p.name, facing: a.facing === 'ns' ? 'ns' : 'ew', isOpen: false, isLocked: true };
      this.state.buildings[b.id] = b;
      if (type === 'storage_box') this.state.storage[b.id] = {};
      if (type === 'turret') this.state.ammo[b.id] = 0;
      p.onboarding.workbenchBuilt ||= type === 'workbench';
      p.onboarding.turretBuilt ||= type === 'turret';
      return;
    }
    if (['toggle_door', 'deposit', 'withdraw', 'load_turret', 'raid', 'repair'].includes(a.action)) {
      const definition = this.state.buildings[targetId] || this.buildingsFor(p).find(b => b.id === targetId);
      requireRule(definition, '建筑不存在');
      // Static terrain definitions can outlive a failed action. Only mutate an
      // owned state copy so rollback cannot leave a cached door open or damaged.
      const b = this.state.buildings[targetId] || clone(definition);
      this.near(p, b);
      if (a.action === 'toggle_door') {
        requireRule(['door', 'safe_door'].includes(b.type) && b.hp > 0, '目标不是可用的门');
        requireRule(this.canUse(p.id, b) || p.mapId === 'world' && b.type === 'door' && !b.isLocked, '门已上锁');
        b.isOpen = !b.isOpen; this.state.buildings[b.id] = b; return;
      }
      const publicRaid = a.action === 'raid' && p.mapId === 'world' && b.mapId === 'world' && !this.isNeutral(p) && !this.isNeutral(b) && b.ownerId !== 'system';
      requireRule(p.mapId.startsWith('home_') && this.state.camps[p.mapId] || publicRaid, '公共补给点建筑不可管理或突袭');
      if (a.action === 'deposit' || a.action === 'withdraw') {
        requireRule(b.type === 'storage_box' && (this.canUse(p.id, b) || a.action === 'withdraw' && b.hp <= 0), '无权访问该仓库');
        requireRule(typeof a.itemId === 'string' && ITEM_DEFS[a.itemId] && positiveCount(a.count), '物资或数量无效');
        const storage = this.state.storage[b.id] ||= {};
        if (a.action === 'deposit') {
          requireRule(b.hp > 0 && this.count(p, a.itemId) >= a.count, '物资不足或仓库已损坏');
          this.remove(p, a.itemId, a.count); storage[a.itemId] = (storage[a.itemId] || 0) + a.count;
          const owner = this.state.players[b.ownerId || ''];
          if (owner && b.mapId === owner.campId) owner.onboarding.storageUsed = true;
        } else {
          requireRule((storage[a.itemId] || 0) >= a.count, '仓库物资不足');
          this.add(p, a.itemId, a.count); storage[a.itemId] -= a.count;
          if (!this.canUse(p.id, b)) this.report(b.ownerId!, `${p.name} 从仓库取走 ${ITEM_DEFS[a.itemId].name} ×${a.count}`);
        }
        return this.storageLoot(b);
      }
      if (a.action === 'load_turret') {
        requireRule(this.canUse(p.id, b) && b.type === 'turret' && b.hp > 0 && positiveCount(a.count), '无权装填');
        requireRule(p.resources.ammo >= a.count && (this.state.ammo[b.id] || 0) + a.count <= 500, '弹药不足或超出容量');
        p.resources.ammo -= a.count; this.state.ammo[b.id] = (this.state.ammo[b.id] || 0) + a.count;
        const owner = this.state.players[b.ownerId || ''];
        if (owner && b.mapId === owner.campId && this.state.ammo[b.id] >= 10) owner.onboarding.turretLoaded = true;
        return;
      }
      if (a.action === 'repair') {
        requireRule(this.canUse(p.id, b) && b.hp < b.maxHp, '无法修复'); this.cooldown(p, 'repair', 800);
        this.checkCost(p, { wood: 2, stone: 2, scrap: 1 }); this.spend(p, { wood: 2, stone: 2, scrap: 1 });
        b.hp = Math.min(b.maxHp, b.hp + 200); if (b.type === 'anchor_core') this.state.camps[p.mapId].state = 'active'; p.actionAt.repair = this.now(); return;
      }
      requireRule(!this.canUse(p.id, b) && b.hp > 0, '不能攻击友方建筑或残骸'); this.cooldown(p, 'attack', 1000);
      requireRule(a.supplyId === 'c4_explosive' || a.supplyId === 'thermite_charge', '必须使用真实破拆物资');
      requireRule(this.count(p, String(a.supplyId)) >= 1, '破拆物资不足');
      this.remove(p, String(a.supplyId), 1);
      const target = clone(b);
      target.hp = Math.max(0, target.hp - (a.supplyId === 'c4_explosive' ? 900 : 750));
      if (target.hp <= 0) { target.isOpen = true; target.isLocked = false; }
      if (target.type === 'anchor_core' && target.hp <= 0 && this.state.camps[p.mapId]) this.state.camps[p.mapId].state = 'breached';
      this.state.buildings[target.id] = target; p.actionAt.attack = this.now(); p.combatUntil = this.now() + 30_000;
      if (this.state.camps[p.mapId]) this.report(target.ownerId!, `${p.name} 攻击 ${target.name}，剩余耐久 ${target.hp}/${target.maxHp}`); return;
    }
    if (a.action === 'equip' || a.action === 'unequip') {
      const slot = a.slot as keyof Equipment; requireRule(['weapon', 'armor', 'tool', 'pack'].includes(slot), '装备栏无效');
      if (a.action === 'unequip') {
        const item = p.equipment[slot]; requireRule(item, '装备栏为空'); this.add(p, item.id, item.count); p.equipment[slot] = null;
      } else {
        requireRule(Number.isInteger(a.index) && Number(a.index) >= 0 && Number(a.index) < p.inventory.length, '背包栏位无效');
        const item = p.inventory[Number(a.index)]; requireRule(item && item.category === slot && item.count === 1, '装备类型不匹配');
        p.inventory[Number(a.index)] = p.equipment[slot]; p.equipment[slot] = item;
      }
      if (slot === 'pack') {
        const resized = resizeInventory(p.inventory, inventoryCapacity(p.equipment.pack?.id));
        requireRule(resized, '背包空间不足，请先整理物品再更换或卸下背包');
        p.inventory = resized;
      }
      p.onboarding.toolEquipped ||= slot === 'tool' && gatheringEffects(p.equipment.tool?.id).canMine;
      this.deriveArmor(p); return;
    }
    if (a.action === 'craft') {
      const recipe = craftingRecipe(a.recipeId); requireRule(recipe, '配方不存在');
      requireRule(!recipeFacility(recipe), '该配方需要对应营地设施的生产任务');
      requireRule(recipe.resultItemId !== 'wp_plasma' || p.blueprints.includes('wp_plasma'), '尚未研究等离子步枪蓝图');
      // Basic hand tools and first aid bootstrap without a private workstation. Advanced crafts require a reachable one.
      if (recipeRequiresWorkbench(recipe)) {
        const station = findCraftingWorkbench(p, this.buildingsFor(p), () => this.rules.nodesNear(p.x, p.y), b => this.canUse(p.id, b));
        requireRule(station, '请靠近工作台'); this.near(p, station);
      }
      this.cooldown(p, 'craft', 800); this.payRecipe(p, recipe);
      this.add(p, recipe.resultItemId, recipe.resultCount);
      p.actionAt.craft = this.now(); return;
    }
    if (a.action === 'buy' || a.action === 'sell') {
      requireRule(p.mapId === 'world' && this.isNeutral(p), '交易需要返回公共补给点');
      requireRule(typeof a.itemId === 'string' && positiveCount(a.quantity) && a.quantity <= 999, '商品或数量无效');
      const offer = marketOffer(a.itemId);
      if (a.action === 'buy') requireRule(offer, '该商品未上架，请通过探索或制造获取');
      const [itemId, units] = offer ? [offer.itemId, offer.units] as const : [a.itemId, 1] as const;
      requireRule(Object.hasOwn(ITEM_DEFS, itemId) && itemId !== 'credits', '商品不存在');
      const def = ITEM_DEFS[itemId.startsWith('ammo_') ? 'ammo' : itemId];
      const count = a.quantity * units;
      if (a.action === 'buy') {
        const cost = def.buyPrice * count; requireRule(p.resources.credits >= cost, '信用点不足');
        this.add(p, itemId, count); p.resources.credits -= cost;
      } else {
        requireRule(this.count(p, itemId) >= count, '物资不足'); this.remove(p, itemId, count); p.resources.credits += def.sellPrice * count;
      }
      return;
    }
    if (a.action === 'drop') {
      requireRule(Number.isInteger(a.index) && Number(a.index) >= 0 && Number(a.index) < p.inventory.length, '背包栏位无效');
      const item = p.inventory[Number(a.index)]; requireRule(item, '背包栏位为空');
      const id = 'drop_' + randomUUID(); this.state.drops[id] = { id, name: p.name + '丢下的物资', x: p.x, y: p.y, mapId: p.mapId, items: [{ itemId: item.id, name: item.name, count: item.count }], expiresAt: this.now() + 30 * 60_000 };
      p.inventory[Number(a.index)] = null; return;
    }
    if (a.action === 'use_item') {
      requireRule(Number.isInteger(a.index) && Number(a.index) >= 0 && Number(a.index) < p.inventory.length, '背包栏位无效');
      const item = p.inventory[Number(a.index)]; requireRule(item && ['food', 'medical'].includes(item.category), '物品不能使用');
      this.cooldown(p, 'use_item', 800); const def = ITEM_DEFS[item.id];
      p.hp = Math.min(p.maxHp, p.hp + (def.heal || 0)); p.satiety = Math.min(100, p.satiety + (def.satiety || 0));
      p.onboarding.ateFood ||= item.category === 'food';
      item.count--; if (!item.count) p.inventory[Number(a.index)] = null; p.actionAt.use_item = this.now(); return;
    }
    if (a.action === 'damage') {
      throw new Error('怪物伤害由服务器模拟，不接受客户端伤害请求');
    }
    if (a.action === 'fire') {
      requireRule(p.equipment.weapon && p.resources.ammo > 0, '武器或弹药不足');
      const interval = fireInterval(p.equipment.weapon.id);
      // A frame's receive jitter becomes debt on the next shot, not a faster rate.
      const firedAt = this.cooldown(p, 'attack', interval, receivedAt, Math.min(20, interval / 4));
      requireRule(a.monsterId === undefined || a.targetId === undefined, '攻击只能指定一个目标');
      if (a.monsterId !== undefined) this.attackMonster(p, a.monsterId, true);
      if (a.targetId !== undefined) {
        const target = this.state.players[String(a.targetId)];
        requireRule(target && target.id !== p.id && target.mapId === p.mapId && this.active.get(target.id)! > this.now() && this.pvpAllowed(p, target), '攻击目标无效');
        this.near(p, target, WEAPONS[p.equipment.weapon.id]?.range ?? 12);
        this.damage(target, WEAPON_DAMAGE[p.equipment.weapon.id] || 55); p.combatUntil = this.now() + 30_000;
      }
      p.resources.ammo--; p.actionAt.attack = firedAt; return;
    }
    if (a.action === 'die') { requireRule(p.hp <= 0, '角色仍存活'); this.damage(p, 1); return; }
    if (a.action === 'attack' || a.action === 'pvp_hit') {
      requireRule(a.monsterId === undefined || a.targetId === undefined, '攻击只能指定一个目标');
      if (a.monsterId !== undefined) { this.cooldown(p, 'attack', MELEE.cooldown * 1000); this.attackMonster(p, a.monsterId, false); p.actionAt.attack = this.now(); return; }
      const target = this.state.players[targetId]; requireRule(target && target.id !== p.id && this.active.get(target.id)! > this.now(), '攻击目标无效');
      requireRule(target.mapId === p.mapId && this.pvpAllowed(p, target), '公共补给点内禁止攻击玩家');
      const weapon = p.equipment.weapon; const range = weapon ? 12 : 1.8; this.near(p, target, range); this.cooldown(p, 'attack', weapon ? 300 : 500);
      if (weapon) { requireRule(p.resources.ammo > 0, '弹药不足'); p.resources.ammo--; }
      this.damage(target, weapon ? WEAPON_DAMAGE[weapon.id] || 55 : 12); p.actionAt.attack = this.now(); p.combatUntil = this.now() + 30_000; return;
    }
    throw new Error('不支持的操作');
  }

  private report(ownerId: string, text: string) {
    this.state.reports.push({ ownerId, text, timestamp: this.now() });
    this.state.reports = this.state.reports.slice(-500);
  }
  private isNeutral(p: { x: number; y: number }): boolean { return [{ x: 0, y: 0 }, { x: 64, y: 0 }, { x: 0, y: 72 }].some(center => distance(p, center) <= 48); }
  private friendly(playerId: string, mapId: MapZoneId) { const camp = this.state.camps[mapId]; return !!camp && (camp.ownerId === playerId || camp.members?.includes(playerId)); }
  private hasHostile(mapId: MapZoneId) { return [...this.active].some(([id, until]) => until > this.now() && this.state.players[id]?.mapId === mapId && !this.friendly(id, mapId)); }
  private pvpAllowed(a: Player, b: Player): boolean { return a.mapId.startsWith('home_') ? !(this.friendly(a.id, a.mapId) && this.friendly(b.id, b.mapId)) : a.mapId === 'world' && !this.isNeutral(a) && !this.isNeutral(b); }
  private storageLoot(b: BuildingEntity) {
    return { id: b.id, name: b.name, items: Object.entries(this.state.storage[b.id] || {}).filter(([, count]) => count > 0).map(([itemId, count]) => ({ itemId, name: ITEM_DEFS[itemId]?.name || itemId, count })) };
  }
  private damage(p: Player, amount: number, undo?: TickUndo, interruptsSearch = true) {
    undo?.object(p);
    const reduction = p.equipment.armor ? ARMOR_REDUCTION[p.equipment.armor.id] || 0 : 0;
    if (reduction > 0) amount = Math.max(1, Math.floor(amount * (1 - reduction)));
    p.lastDamageAt = this.now();
    if (interruptsSearch) p.lastCombatDamageAt = p.lastDamageAt;
    const shield = Math.min(p.shield, amount); p.shield -= shield; p.hp -= amount - shield; p.combatUntil = this.now() + 30_000;
    if (p.hp > 0) return;
    undo?.map(this.respawns, p.id); this.respawns.set(p.id, (this.respawns.get(p.id) || 0) + 1);
    const items: LootItem[] = p.inventory.filter((item): item is Item => !!item).map(item => ({ itemId: item.id, name: item.name, count: item.count }));
    for (const key of resourceKeys) if (p.resources[key] > 0 && !['food', 'medical'].includes(key)) {
      const itemId = resourceItemId(key); items.push({ itemId, name: ITEM_DEFS[itemId]?.name || itemId, count: p.resources[key] }); p.resources[key] = 0;
    }
    if (items.length) {
      const id = 'drop_' + randomUUID(); undo?.entry(this.state.drops, id);
      this.state.drops[id] = { id, name: p.name + '的掉落背包', x: p.x, y: p.y, mapId: p.mapId, items, expiresAt: this.now() + 30 * 60_000 };
    }
    const home = p.campId ? this.state.camps[p.campId] : undefined;
    const bed = home && home.state !== 'breached' && !this.hasHostile(home.id as MapZoneId) ? Object.values(this.state.buildings).find(b => b.mapId === home.id && b.ownerId === p.id && b.type === 'bed' && b.hp > 0) : undefined;
    p.inventory = Array(inventoryCapacity(p.equipment.pack?.id)).fill(null); p.mapId = bed ? bed.mapId! : 'world'; p.x = bed?.x || 0; p.y = bed ? bed.y + 1 : 0; p.hp = p.maxHp; p.shield = 0; p.satiety = 40; p.moveAt = this.now();
    this.clearSpawn(p);
  }

  private simulateMonsters(players: Player[], dt: number, time: number, undo: TickUndo) {
    const publicPlayers = players.filter(p => p.mapId === 'world');
    for (const p of publicPlayers) this.ensureMonsters(p, undo);
    let changed = false, dirty = false, simulated = false;
    for (const monster of Object.values(this.state.monsters)) {
      if (!publicPlayers.some(p => distance(p, monster) <= 40)) continue;
      simulated = true;
      const dead = monster.hp <= 0 || monster.state === 'dead';
      if (dead && (!monster.respawnAt || monster.respawnAt > time)) continue;
      undo.object(monster);
      if (dead) {
        monster.x = monster.spawnX ?? monster.x; monster.y = monster.spawnY ?? monster.y; monster.hp = monster.maxHp; monster.state = 'roam';
        monster.windup = 0; monster.attackCooldown = 0; delete monster.respawnAt; delete monster.targetId; changed = dirty = true;
      }
      const spawn = { x: monster.spawnX ?? monster.x, y: monster.spawnY ?? monster.y };
      const buildings = this.buildingsFor({ mapId: 'world', x: monster.x, y: monster.y });
      const reachable = (p: Player) => p.mapId === 'world' && p.hp > 0 && distance(p, spawn) <= 14 && hasLineOfSight(monster, p, buildings);
      const previous = publicPlayers.find(p => p.id === monster.targetId && reachable(p));
      const target = previous || publicPlayers.filter(p => reachable(p) && distance(p, monster) <= 6).sort((a, b) => distance(a, monster) - distance(b, monster))[0];
      monster.attackCooldown = Math.max(0, monster.attackCooldown - dt); monster.animTime += dt;
      if ((monster.windup || 0) > 0) {
        monster.windup = Math.max(0, monster.windup! - dt); monster.state = 'attack'; changed ||= dt > 0;
        if (monster.windup <= 1e-6) {
          monster.windup = 0; monster.attackCooldown = 1.2;
          if (target && distance(target, monster) <= 1.8 && reachable(target)) { this.damage(target, monster.damage, undo); dirty = true; }
        }
        continue;
      }
      if (target) monster.targetId = target.id; else delete monster.targetId;
      if (target && distance(target, monster) <= 1.8) {
        monster.state = 'attack';
        if (monster.attackCooldown <= 0) { monster.windup = 0.35; changed = true; }
        continue;
      }
      monster.state = target ? 'chase' : 'roam';
      const destination = target || (distance(monster, spawn) > 2 ? spawn : { x: spawn.x + Math.sin(time / 2500 + monster.id.length) * 1.5, y: spawn.y + Math.cos(time / 3000 + monster.id.length) * 1.5 });
      monster.targetX = destination.x; monster.targetY = destination.y;
      const dist = distance(monster, destination);
      if (dist < 0.1 || dt <= 0) continue;
      const step = Math.min(dist, monster.speed * dt);
      const dx = (destination.x - monster.x) / dist * step, dy = (destination.y - monster.y) / dist * step;
      for (const pos of [{ x: monster.x + dx, y: monster.y + dy }, { x: monster.x + dx, y: monster.y }, { x: monster.x, y: monster.y + dy }]) {
        if (distance(pos, spawn) > 14 || isPositionBlocked(pos.x, pos.y, buildings) || !hasLineOfSight(monster, pos, buildings)) continue;
        if (distance(monster, pos) > 1e-6) { monster.x = pos.x; monster.y = pos.y; changed = true; }
        break;
      }
    }
    return { changed, dirty, simulated };
  }

  tick() {
    this.tickSharedChange = false;
    const undo = new TickUndo(), previousNpcTickAt = this.npcTickAt, previousResourceTickAt = this.resourceTickAt;
    try {
      const time = this.now(); let dirty = false;
      const changedPlayers: Player[] = [];
      const npcDt = Math.min(0.25, Math.max(0, (time - this.npcTickAt) / 1000)); this.npcTickAt = time;
      for (const [id, until] of this.active) if (until <= time) { undo.map(this.active, id); this.active.delete(id); }
      for (const [id, drop] of Object.entries(this.state.drops)) if (drop.expiresAt <= time) { undo.entry(this.state.drops, id); delete this.state.drops[id]; dirty = true; }
      const activePlayers = [...this.active.keys()].map(id => this.state.players[id]);
      dirty = this.renewResources(time, activePlayers, undo) || dirty;
      const npc = this.simulateMonsters(activePlayers, npcDt, time, undo); dirty ||= npc.dirty;
      for (const p of activePlayers) {
        const elapsed = Math.min(5, Math.max(0, (time - p.survivalAt) / 1000));
        if (elapsed < 1) continue;
        undo.object(p); changedPlayers.push(p);
        const shieldRegenTime = Math.min(elapsed, Math.max(0, (time - Math.max(p.survivalAt, p.lastDamageAt + 5000)) / 1000));
        p.satiety = Math.max(0, p.satiety - elapsed * 0.25); p.survivalAt = time;
        if (p.satiety <= 0) { this.damage(p, elapsed * 2.5, undo, false); dirty = true; }
        else if (p.satiety > 50 && p.combatUntil < time) p.hp = Math.min(p.maxHp, p.hp + elapsed * 1.2);
        if (p.mapId === 'world' && this.rules.weather?.() === 'acid_rain') p.shield = Math.max(0, p.shield - elapsed * ACID_SHIELD_DRAIN);
        else if (p.satiety > 0 && shieldRegenTime > 0) p.shield = Math.min(p.maxShield, p.shield + shieldRegenTime * 8);
      }
      const maps = new Set(activePlayers.filter(p => p.mapId.startsWith('home_')).map(p => p.mapId));
      const buildingsByMap = new Map<MapZoneId, BuildingEntity[]>([...maps].map(mapId => [mapId, []]));
      if (maps.size === 1) {
        const mapId = maps.values().next().value!;
        buildingsByMap.set(mapId, Object.values(this.state.buildings).filter(b => b.mapId === mapId && b.hp > 0));
      } else if (maps.size > 1) for (const b of Object.values(this.state.buildings)) {
        const mapId = b.mapId, buildings = mapId && buildingsByMap.get(mapId);
        if (buildings && b.hp > 0) buildings.push(b);
      }
      for (const [mapId, buildings] of buildingsByMap) {
        for (const defense of buildings.filter(b => b.type === 'turret' || b.type === 'spikes')) {
          if (time - (this.state.defenseAt[defense.id] ?? -Infinity) < 1000 || defense.type === 'turret' && !(this.state.ammo[defense.id] > 0)) continue;
          const target = activePlayers.find(p => p.mapId === mapId && !this.canUse(p.id, defense) && distance(p, defense) <= (defense.type === 'turret' ? 8 : 1) && hasLineOfSight(defense, p, buildings, defense.id));
          if (!target) continue;
          if (defense.type === 'turret') { undo.entry(this.state.ammo, defense.id); this.state.ammo[defense.id]--; }
          else { undo.entry(defense, 'hp'); defense.hp = Math.max(0, defense.hp - 10); }
          this.damage(target, defense.type === 'turret' ? 12 : 8, undo);
          undo.entry(this.state.defenseAt, defense.id); this.state.defenseAt[defense.id] = time; dirty = true;
        }
      }
      // NPC movement alone retains its existing sync-without-save cadence.
      const fullSave = dirty || npc.simulated && changedPlayers.length > 0;
      if (fullSave) this.persist();
      else if (changedPlayers.length) this.db.saveWorldPlayerCommits(changedPlayers.map(player => ({ id: player.id, data: JSON.stringify({ player, handled: this.state.handled[player.id] || [] }) })));
      if (npc.simulated && !fullSave) this.periodicSharedDirty = true;
      this.tickSharedChange = fullSave || npc.changed;
      return this.tickSharedChange || changedPlayers.length > 0;
    } catch (error) {
      undo.rollback(); this.npcTickAt = previousNpcTickAt; this.resourceTickAt = previousResourceTickAt;
      throw error;
    }
  }
}

export type GameStateSnapshot = ReturnType<GameWorld['snapshot']>;
export type PlayerActionSnapshot = ReturnType<GameWorld['snapshotPlayer']>;
