export interface Item {
  id: string;
  name: string;
  category: 'weapon' | 'tool' | 'medical' | 'food' | 'material' | 'armor' | 'pack';
  icon: string;
  count: number;
  maxCount: number;
  durability?: number;
  maxDurability?: number;
  ammo?: number;
  maxAmmo?: number;
  desc: string;
  actionKey?: string;
  rarity?: number; // 1白2绿3蓝4紫5金（三角洲式）
}

// 个人装备栏：武器/护甲/工具/背包（背包只管存，装备栏决定战斗属性，背包决定格数）
export interface Equipment {
  weapon: Item | null;
  armor: Item | null;
  tool: Item | null;
  pack: Item | null;
}

export interface SquadMember {
  id: string;
  name: string;
  role: string;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  status: '战斗中' | '破拆搜刮中' | '工作台制造' | '战术伴飞' | '就绪';
  isPlayer: boolean;
  avatarSeed: string;
}

export interface MonsterEntity {
  id: string;
  name: string;
  x: number; // Isometric world coordinate
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  state: 'roam' | 'chase' | 'attack' | 'hurt' | 'dead';
  animTime: number;
  targetX?: number;
  targetY?: number;
  attackCooldown: number;
  spawnX?: number; // 出生锚点：回拉用
  spawnY?: number; // 出生锚点：回拉用
  windup?: number; // 攻击前摇剩余秒数，>0 时闪红预警不造成伤害
}

export interface InteractableEntity {
  id: string;
  name: string;
  type:
    | 'scrap'
    | 'workbench'
    | 'car'
    | 'van'
    | 'shelves'
    | 'med_cabinet'
    | 'ammo_crate'
    | 'campfire'
    | 'box'
    | 'tree'
    | 'boulder'
    | 'pond'
    | 'crystal';
  x: number;
  y: number;
  radius: number;
  prompt: string;
  available: boolean;
  searchDuration?: number;
  lootTable?: { itemId: string; name: string; count: number }[];
  // 采集上限：stock 采空后按 respawnSec 秒恢复（Infinity = 无限，如工作台）
  stock?: number;
  maxStock?: number;
  respawnSec?: number;
  respawnAt?: number;
}

export type BuildableType =
  | 'wood_floor'
  | 'stone_floor'
  | 'iron_floor'
  | 'wood_wall'
  | 'stone_wall'
  | 'iron_wall'
  | 'glass_wall'
  | 'door'
  | 'safe_door'
  | 'storage_box'
  | 'campfire'
  | 'bed'
  | 'furnace'
  | 'farm_plot'
  | 'research_table'
  | 'workbench'
  | 'turret'
  | 'electric_core'
  | 'flame_core'
  | 'spikes'
  | 'anchor_core';

export interface FloorEntity {
  x: number;
  y: number;
  type: 'wood_floor' | 'stone_floor' | 'iron_floor';
  material: 'wood' | 'stone' | 'iron';
}

export interface BuildingEntity {
  id: string;
  type: BuildableType;
  name: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  level: number;
  isOpen?: boolean;
  isLocked?: boolean;
  doorWidth?: number;
  ownerId?: string;
  ownerName?: string;
  mapId?: MapZoneId;
  fireCooldown?: number;
  material?: 'wood' | 'stone' | 'iron';
  storedLoot?: { name: string; count: number; icon: string }[];
  /** 墙体/门朝向：ew=沿东西向展开，ns=沿南北向展开（等距视角下形态不同） */
  facing?: 'ew' | 'ns';
  production?: { recipeId: string; resultItemId: string; resultCount: number; readyAt: number };
}

export interface WorldZone {
  id: string;
  name: string;
  levelDesc: string;
  riskLevel: 'SAFE' | 'LOW' | 'HIGH' | 'EXTREME';
  description: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pois: { name: string; type: string; x: number; y: number }[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'spark' | 'smoke' | 'fire' | 'rain' | 'text' | 'blood' | 'laser';
  text?: string;
  fontSize?: number;
}

export interface ChatMessage {
  id: string;
  channel: 'team' | 'world' | 'rift' | 'system';
  sender: string;
  senderTitle?: string;
  text: string;
  timestamp: string;
  isSelf?: boolean;
}

export interface MarketItem {
  id: string;
  name: string;
  category: '物资' | '装备' | '稀有材料' | '裂隙药剂';
  buyPrice: number;
  sellPrice: number;
  icon: string;
  stock: number;
  description: string;
}

export interface CraftRecipe {
  id: string;
  name: string;
  category: '弹药' | '医疗' | '工具' | '防具';
  resultItemId: string;
  resultName: string;
  resultCount: number;
  materials: { name: string; required: number }[];
  desc: string;
  craftTimeMs: number;
}

export type MapZoneId =
  | 'world'
  | 'camp_plaza' | 'camp_workshop' | 'camp_outskirts'
  | 'town_gas' | 'town_street' | 'town_ruins'
  | 'mtn_logging' | 'mtn_quarry' | 'mtn_deep'
  | 'marsh_docks' | 'marsh_bog' | 'marsh_rift'
  | 'town_factory' | 'mtn_peak' | 'marsh_abyss'
  | 'home_base' | `home_${string}`
  // 旧ID（兼容遗留代码，运行时不再使用）
  | 'sanctuary' | 'highway' | 'pond' | 'forest' | 'rift_core';

export type RegionId = 'camp' | 'town' | 'mountain' | 'marsh';

// 地形主题（渲染分支按主题走，同主题多图复用 + 数据饰品区分）
export type GroundTheme =
  | 'camp' | 'plaza' | 'field'
  | 'urban' | 'ruins'
  | 'forest' | 'quarry'
  | 'lake' | 'marsh'
  | 'rift';

export interface RegionDef {
  id: RegionId;
  name: string;
  icon: string;
  desc: string;
}

export interface GateDef {
  x: number;
  y: number;
  targetMap: MapZoneId;
  targetX: number;
  targetY: number;
  name: string;
  icon?: string;
  desc?: string;
}

// 地面饰品（数据驱动，每张图长得不一样的关键）
export interface DecoDef {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'foundation' | 'crater' | 'rubble' | 'farm' | 'sandpit' | 'rockery';
}

export interface SubMapDef {
  id: MapZoneId;
  region: RegionId;
  name: string;
  theme: GroundTheme;
  desc: string;
  risk: 'SAFE' | 'LOW' | 'HIGH' | 'EXTREME';
  gates: GateDef[];
  interactables: InteractableEntity[];
  monsters: MonsterEntity[];
  buildings: BuildingEntity[];
  deco?: DecoDef[];
}

export type WeatherType = 'rain' | 'thunder' | 'fog' | 'clear' | 'acid_rain';

export interface WeatherState {
  current: WeatherType;
  name: string;
  icon: string;
  desc: string;
  effectLabel: string;
  durationLeft: number;
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  stamina: number;
  maxStamina: number;
  satiety: number; // 饱食度：归零后HP持续流失，进食恢复
  maxSatiety: number;
  level: number;
  title: string;
  xp: number;
  maxXp: number;
  credits: number; // 废土信用点
  shards: number;  // 坍界晶石
}

export interface OnlinePlayer {
  id: string;
  name: string;
  level: number;
  title: string;
  avatarSeed: string;
  x: number;
  y: number;
  angle: number;
  mapId: MapZoneId;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  isFiring: boolean;
  isDashing: boolean;
  color: string;
  ping: number;
  lastSeen: number;
  currentAction?: string;
  spawnIndex?: number;
}

export interface RaidSupply {
  id: string;
  name: string;
  icon: string;
  count: number;
  desc: string;
  baseDamage: number;
  critChance: number;
  critMultiplier: number;
  successRate: number; // 基础成功率，若失败则消耗破损但造成少许震击
  stealthBonus: boolean; // 是否无声破拆（不立即拉响领地全图警报）
}

export interface RaidEvent {
  targetId: string;
  targetName: string;
  targetX: number;
  targetY: number;
  ownerName: string;
  raiderId: string;
  raiderName: string;
  supplyUsed: string;
  damage: number;
  remainingHp: number;
  isCritical: boolean;
  isBreached: boolean;
  timestamp: number;
  loot?: { name: string; count: number; icon: string }[];
}

export interface TerritoryZone {
  id: string;
  ownerId: string;
  ownerName: string;
  mapId: MapZoneId;
  centerX: number;
  centerY: number;
  radius: number;
  coreHp: number;
  coreMaxHp: number;
  safeDoorId?: string;
}

export type NetMessageType =
  | 'game_action'
  | 'game_state'
  | 'game_state_patch'
  | 'state_sync'
  | 'init'
  | 'player_sync'
  | 'player_joined'
  | 'player_left'
  | 'player_action'
  | 'building_placed'
  | 'building_damaged'
  | 'building_destroyed'
  | 'raid_attempt'
  | 'raid_result'
  | 'chat'
  | 'weather_update'
  | 'weather_set'
  | 'gm_auth'
  | 'gm_auth_result'
  | 'monster_sync'
  | 'monster_killed'
  | 'ping'
  | 'pong'
  | 'pvp_hit';

export interface NetMessage {
  type: NetMessageType;
  payload: any;
  senderId?: string;
  timestamp?: number;
}
