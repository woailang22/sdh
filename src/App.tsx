/**
 * 《坍界行者：边缘黎明》
 * 真正的多人实时联机MMORPG：领地建造、安全门突袭攻防、动态天气与野外练级体系
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { IsometricEngine } from './game/IsometricEngine';
import { NetworkManager } from './game/NetworkManager';
import { RadarMinimap } from './components/RadarMinimap';
import { CharacterHUD } from './components/CharacterHUD';
import { RadioChat } from './components/RadioChat';
import { Hotbar } from './components/Hotbar';
import { TopMenuBar } from './components/TopMenuBar';
import { MarketModal } from './components/MarketModal';
import { WorkbenchModal } from './components/WorkbenchModal';
import { RiftModal } from './components/RiftModal';
import { AnchorModal } from './components/AnchorModal';
import { ProfileModal } from './components/ProfileModal';
import { SettingsModal } from './components/SettingsModal';
import { WorldMapModal } from './components/WorldMapModal';
import { copyDiagnosticText, readRenderDiagnostics } from './game/renderDiagnostics';
import { BASE_INVENTORY_SLOTS, inventoryCapacity } from './game/equipmentRules';
import { BuildingBar } from './components/BuildingBar';
import { WeatherWidget } from './components/WeatherWidget';
import { QuestPanel, QuestStep } from './components/QuestPanel';
import { InventoryModal } from './components/InventoryModal';
import { MapEditorModal } from './components/MapEditorModal';
import { LootPanel, LootEntry } from './components/LootPanel';
import { lootResourceOf, RARITY, skillLevel, skillYieldMult, LootResource, SUBMAPS, displayName } from './game/maps';
import { ITEM_DEFS, getItemDef, makeItem, WEAPON_DAMAGE, ARMOR_BONUS_TABLE, MED_HEAL, FOOD_VALUE } from './game/items';
import { killReward, WEAPONS, ARMOR_REDUCTION } from './game/combat';
import { calcDeathDrop } from './game/death';
import { ALL_QUESTS } from './game/quests';
import { dayKey, isNextDay } from './game/daily';
import { BASE_PLOTS } from './game/spawn';
import { campExitPosition, homeMapIdFor } from './game/home';
import { WORLD_LOCATIONS } from './game/world';
import { weatherInfo } from './game/weather';
import { CampPanel } from './components/CampPanel';
import type { GameStateSnapshot } from '../server/worldState';
import { CraftOrder } from './components/WorkbenchModal';
import { findCraftingWorkbench } from './game/crafting';
import { hasLineOfSight } from './game/navigation';
import { RaidModal } from './components/RaidModal';
import { OnlinePlayersModal } from './components/OnlinePlayersModal';
import { TacticalDpad } from './components/TacticalDpad';
import { soundManager } from './audio/soundManager';
import {
  Item,
  SquadMember,
  MonsterEntity,
  ChatMessage,
  PlayerStats,
  MarketItem,
  BuildingEntity,
  WeatherState,
  MapZoneId,
  OnlinePlayer,
  RaidEvent,
  Equipment,
} from './types/game';

// 切图 splash 用图（与 WorldMapModal MAP_PREVIEW 同表，改一处记得改另一处）
const THEME_SPLASH_IMG: Record<string, string> = {
  camp: '/art/map-camp.jpg', plaza: '/art/map-camp.jpg', urban: '/art/map-camp.jpg',
  ruins: '/art/map-camp.jpg', field: '/art/map-camp.jpg',
  forest: '/art/map-wild.jpg', quarry: '/art/map-wild.jpg',
  lake: '/art/map-water.jpg', marsh: '/art/map-water.jpg',
  rift: '/art/map-rift.jpg',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<IsometricEngine | null>(null);
  const appliedBuildingsRef = useRef<{ engine: IsometricEngine; mapId: MapZoneId; buildings: BuildingEntity[]; projection: BuildingEntity[]; count: number } | null>(null);
  const netManagerRef = useRef<NetworkManager | null>(null);

  // Active Map Zone
  const [currentMapId, setCurrentMapId] = useState<MapZoneId>('world');
  const [gameState, setGameState] = useState<GameStateSnapshot | null>(null);
  const gameStateRef = useRef<GameStateSnapshot | null>(null);
  const [campOpen, setCampOpen] = useState(false);
  const [managedBuilding, setManagedBuilding] = useState<BuildingEntity | null>(null);
  const [actionNotice, setActionNotice] = useState('');
  const [renderIssue, setRenderIssue] = useState<string | null>(null);
  const [renderDetailsOpen, setRenderDetailsOpen] = useState(false);
  const [frameDetailsText, setFrameDetailsText] = useState<string | null>(null);
  const [renderCopyResult, setRenderCopyResult] = useState('');

  // Boot splash（keyart 开屏，点进入废土关闭）
  const [showBoot, setShowBoot] = useState(true);

  // 切图 splash（预览图 bridge，2.4s 后消失；z-40 在 boot z-50 之下）
  const [zoneSplash, setZoneSplash] = useState<{ mapId: MapZoneId; nonce: number } | null>(null);
  const splashTimer = useRef<number>(0);

  // Active Modals
  const [activeModal, setActiveModal] = useState<
    'market' | 'rift' | 'anchor' | 'profile' | 'settings' | 'workbench' | 'map' | 'inventory' | 'editor' | null
  >(null);

  // Raid Modal state (when attacking a safe door)
  const [raidDoor, setRaidDoor] = useState<BuildingEntity | null>(null);

  // GM 模式（地图编辑器门禁，会话级）
  const [isGM, setIsGM] = useState<boolean>(() => {
    try {
      return !!sessionStorage.getItem('sdc_gm_token');
    } catch {
      return false;
    }
  });

  // Online Players Modal (Tab)
  const [isOnlinePlayersOpen, setIsOnlinePlayersOpen] = useState<boolean>(false);

  // 每日签到红点：跨天置 true
  const [dailyRedDot, setDailyRedDot] = useState(false);
  useEffect(() => {
    try {
      const today = dayKey(new Date());
      const last = localStorage.getItem('sdc_daily_last') ?? today;
      if (isNextDay(last, today)) setDailyRedDot(true);
    } catch { /* ignore */ }
  }, []);

  // Build Mode State
  const [isBuildMode, setIsBuildMode] = useState<boolean>(false);
  const [selectedBuildType, setSelectedBuildType] = useState<string>('wood_floor');

  // Multiplayer Network State
  const [onlinePlayers, setOnlinePlayers] = useState<OnlinePlayer[]>([]);
  const [selfId, setSelfId] = useState<string>('');
  const [ping, setPing] = useState<number>(24);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  // Weather System State
  const [weatherState, setWeatherState] = useState<WeatherState>(() => weatherInfo('clear'));
  const serverWeatherRef = useRef({ state: weatherState, receivedAt: Date.now() });

  // Player Stats（单人末日生存零开局：1级/空钱包/空晶石）
  const [playerStats, setPlayerStats] = useState<PlayerStats>({
    hp: 100,
    maxHp: 100,
    shield: 0,
    maxShield: 50,
    stamina: 100,
    maxStamina: 100,
    satiety: 100,
    maxSatiety: 100,
    level: 1,
    title: '废土流浪者',
    xp: 0,
    maxXp: 100,
    credits: 0,
    shards: 0,
  });

  // Weapon Ammo State（零开局：无弹药，搜刮/制造获取）
  const [ammo, setAmmo] = useState({ current: 0, max: 30, reserve: 0 });

  // 单人模式：仅自己，无NPC小队成员
  const [squadMembers, setSquadMembers] = useState<SquadMember[]>([
    {
      id: 'player',
      name: '废土流浪者 (你)',
      role: '独自求生',
      hp: 100,
      maxHp: 100,
      shield: 0,
      maxShield: 50,
      status: '就绪',
      isPlayer: true,
      avatarSeed: 'player',
    },
  ]);

  // Inventory starts empty; the quick bar only displays its first six slots.
  const [hotbarSlots, setHotbarSlots] = useState<(Item | null)[]>(Array(BASE_INVENTORY_SLOTS).fill(null));

  // 个人装备栏：武器/护甲/工具/背包（战斗属性只看这里，背包决定格数）
  const [equipment, setEquipment] = useState<Equipment>({ weapon: null, armor: null, tool: null, pack: null });
  const equipmentRef = useRef(equipment);
  equipmentRef.current = equipment;

  // 背包容量与服务端共用规则。
  const packCapacity = (eq: Equipment) =>
    inventoryCapacity(eq.pack?.id);

  // 护甲加成表
  const ARMOR_BONUS: Record<string, number> = { armor_cloth: 25, armor_vest: 50, ...ARMOR_BONUS_TABLE };

  const [activeSlot, setActiveSlot] = useState<number>(1);

  // Tier-1 Gathering & Construction Inventory（零开局：全部从0采起）
  const [playerWood, setPlayerWood] = useState<number>(0); // 优质原木 (砍树产出)
  const [playerStone, setPlayerStone] = useState<number>(0); // 坚实条石 (采石产出)
  const [playerScrap, setPlayerScrap] = useState<number>(0); // 特种废铁 (拆车/废墟产出)
  const [playerParts, setPlayerParts] = useState<number>(0); // 机械零件 (搜刮产出)
  const [activeKeys, setActiveKeys] = useState<{ [key: string]: boolean }>({});

  // Radio Chat Stream（单人开局：仅系统欢迎语）
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      channel: 'world',
      sender: '坍界求生电台',
      senderTitle: '系统广播',
      text: '从公共荒野开始探索：捡取木石、制作工具、在野外插旗建营。营地进入后是独立地图，全天可被攻击，离线防御需要真实弹药。',
      timestamp: '00:01',
    },
  ]);

  // Statistics（零开局）
  const [killCount, setKillCount] = useState(0);
  const [scavengeCount, setScavengeCount] = useState(0);

  // 采集技能经验（星露谷式：伐木/采矿/垂钓）
  const [skillXp, setSkillXp] = useState({ wood: 0, stone: 0, fish: 0 });
  const skillXpRef = useRef({ wood: 0, stone: 0, fish: 0 });

  // 三角洲式搜刮面板（开箱挑选）
  const [lootPanel, setLootPanel] = useState<{ id: string; name: string; items: LootEntry[] } | null>(null);
  const lootPanelRef = useRef<{ id: string; name: string; items: LootEntry[] } | null>(null);
  lootPanelRef.current = lootPanel;

  // 在线引路进度来自服务端存档，不随花费、刷新或重登减少。
  const [totalWood, setTotalWood] = useState(0);
  const [totalStone, setTotalStone] = useState(0);
  const [totalScrap, setTotalScrap] = useState(0);
  const [ateFood, setAteFood] = useState(false);
  const [movedFar, setMovedFar] = useState(false);
  const [workbenchBuilt, setWorkbenchBuilt] = useState(false);
  const [storageUsed, setStorageUsed] = useState(false);
  const [pickaxeCrafted, setPickaxeCrafted] = useState(false);
  const [safeDoorBuilt, setSafeDoorBuilt] = useState(false);
  const [turretBuilt, setTurretBuilt] = useState(false);
  const [turretLoaded, setTurretLoaded] = useState(false);
  const [rifleOwned, setRifleOwned] = useState(false);
  const [raidHit, setRaidHit] = useState(false);
  const [eliteKilled, setEliteKilled] = useState(false);
  const [bossKilled, setBossKilled] = useState(false);
  const [darkCoreGot, setDarkCoreGot] = useState(false);
  const [claimedPlot, setClaimedPlot] = useState(false);
  const movedRef = useRef(false);
  const grantedQuestsRef = useRef<Set<string>>(new Set());
  const currentMapIdRef = useRef(currentMapId);
  currentMapIdRef.current = currentMapId;
  const pickaxeCraftedRef = useRef(pickaxeCrafted);
  pickaxeCraftedRef.current = pickaxeCrafted;
  const [currentStance, setCurrentStance] = useState('combat');

  // Radar Minimap Entities Sync
  const [radarEntities, setRadarEntities] = useState<{
    playerPos: { x: number; y: number; angle: number };
    monsters: MonsterEntity[];
    teammates: { x: number; y: number; name: string }[];
    interactables: { x: number; y: number; name: string }[];
    buildings: { x: number; y: number; type: string }[];
    waypoints: { x: number; y: number; name: string; targetMap: string; icon?: string }[];
  }>({
    playerPos: { x: 0, y: 0, angle: 0 },
    monsters: [],
    teammates: [],
    interactables: [],
    buildings: [],
    waypoints: [],
  });

  const hotbarSlotsRef = useRef(hotbarSlots);
  hotbarSlotsRef.current = hotbarSlots;
  const playerWoodRef = useRef(playerWood);
  playerWoodRef.current = playerWood;
  const playerStoneRef = useRef(playerStone);
  playerStoneRef.current = playerStone;
  const playerScrapRef = useRef(playerScrap);
  playerScrapRef.current = playerScrap;
  const playerPartsRef = useRef(playerParts);
  playerPartsRef.current = playerParts;
  const playerStatsRef = useRef(playerStats);
  playerStatsRef.current = playerStats;

  // 护甲上限增减（含引擎即时同步，60ms循环也会对齐）
  const applyArmorDelta = useCallback((delta: number) => {
    if (delta === 0) return;
    setPlayerStats((p) => ({
      ...p,
      maxShield: Math.max(0, p.maxShield + delta),
      shield: Math.min(p.maxShield + delta, p.shield + Math.max(0, delta)),
    }));
    if (engineRef.current) {
      engineRef.current.player.maxShield = Math.max(0, engineRef.current.player.maxShield + delta);
      engineRef.current.player.shield = Math.min(
        engineRef.current.player.maxShield,
        engineRef.current.player.shield + Math.max(0, delta)
      );
    }
  }, []);

  const isEquipment = (it: Item) =>
    it.category === 'weapon' || it.category === 'armor' || it.category === 'tool' || it.category === 'pack';

  // 穿装备：背包格 → 装备栏（旧装备换回背包，需有空格；背包扩容即时生效）
  const equipItem = useCallback((idx: number): boolean => {
    if (gameStateRef.current) {
      const item = hotbarSlotsRef.current[idx];
      if (!item || !isEquipment(item)) return false;
      netManagerRef.current?.gameAction('equip', { slot: item.category, index: idx });
      return true;
    }
    const cur = [...hotbarSlotsRef.current];
    const item = cur[idx];
    if (!item || !isEquipment(item)) return false;
    const slot = item.category as 'weapon' | 'armor' | 'tool' | 'pack';
    const eq = { ...equipmentRef.current };
    const prev = eq[slot];
    const equipping: Item = { ...item, count: 1 };
    if (item.count > 1) cur[idx] = { ...item, count: item.count - 1 };
    else cur[idx] = null;
    if (prev) {
      const sIdx = cur.findIndex((s) => s && s.id === prev.id && s.count < s.maxCount);
      if (sIdx >= 0) {
        const s = cur[sIdx]!;
        cur[sIdx] = { ...s, count: Math.min(s.maxCount, s.count + prev.count) };
      } else {
        const eIdx = cur.findIndex((s) => !s);
        if (eIdx < 0) {
          if (engineRef.current) {
            engineRef.current.addTextParticle(
              engineRef.current.player.x, engineRef.current.player.y - 1.5,
              '🎒 背包已满，换不下来', '#f87171'
            );
          }
          return false;
        }
        cur[eIdx] = prev;
      }
    }
    eq[slot] = equipping;
    // 背包扩容：格数跟上
    if (slot === 'pack') {
      const cap = packCapacity(eq);
      while (cur.length < cap) cur.push(null);
    }
    setHotbarSlots(cur);
    setEquipment(eq);
    if (slot === 'armor') {
      const bonus = ARMOR_BONUS[equipping.id] ?? 0;
      const prevBonus = prev ? (ARMOR_BONUS[prev.id] ?? 0) : 0;
      applyArmorDelta(bonus - prevBonus);
    }
    soundManager.playClick();
    if (engineRef.current) {
      engineRef.current.addTextParticle(
        engineRef.current.player.x, engineRef.current.player.y - 1.8,
        `已装备：${equipping.name}`, '#4ade80'
      );
    }
    return true;
  }, [applyArmorDelta]);

  // 脱装备：装备栏 → 背包（空间不足时拒绝缩容）
  const unequipSlot = useCallback((slot: 'weapon' | 'armor' | 'tool' | 'pack') => {
    if (gameStateRef.current) { netManagerRef.current?.gameAction('unequip', { slot }); return; }
    const eq = { ...equipmentRef.current };
    const item = eq[slot];
    if (!item) return;
    const cur = [...hotbarSlotsRef.current];
    const sIdx = cur.findIndex((s) => s && s.id === item.id && s.count < s.maxCount);
    if (sIdx >= 0) {
      const s = cur[sIdx]!;
      cur[sIdx] = { ...s, count: Math.min(s.maxCount, s.count + item.count) };
    } else {
      const eIdx = cur.findIndex((s) => !s);
      if (eIdx < 0) {
        if (engineRef.current) {
          engineRef.current.addTextParticle(
            engineRef.current.player.x, engineRef.current.player.y - 1.5,
            '🎒 背包已满，脱不下来', '#f87171'
          );
        }
        return;
      }
      cur[eIdx] = item;
    }
    eq[slot] = null;
    if (slot === 'pack') {
      // 缩容：先压紧，非空格超新上限则拒绝脱下
      const compacted: (Item | null)[] = cur.filter((s): s is Item => !!s);
      const newCap = packCapacity(eq);
      if (compacted.length > newCap) {
        if (engineRef.current) {
          engineRef.current.addTextParticle(
            engineRef.current.player.x, engineRef.current.player.y - 1.5,
            `东西太多（${compacted.length}/${newCap}），先用掉/丢掉一些`, '#f87171'
          );
        }
        return;
      }
      while (compacted.length < newCap) compacted.push(null);
      setHotbarSlots(compacted);
    } else {
      setHotbarSlots(cur);
    }
    setEquipment(eq);
    if (slot === 'armor') applyArmorDelta(-(ARMOR_BONUS[item.id] ?? 0));
    soundManager.playClick();
  }, [applyArmorDelta]);

  // 丢弃整叠
  const dropItem = useCallback((idx: number) => {
    if (gameStateRef.current) { netManagerRef.current?.gameAction('drop', { index: idx }); return; }
    const cur = [...hotbarSlotsRef.current];
    const item = cur[idx];
    if (!item) return;
    cur[idx] = null;
    setHotbarSlots(cur);
    soundManager.playClick();
    if (engineRef.current) {
      engineRef.current.addTextParticle(
        engineRef.current.player.x, engineRef.current.player.y - 1.2,
        `丢弃：${item.name}`, '#94a3b8'
      );
    }
  }, []);

  // 背包：同id堆叠，否则进第一个空格；装备类进空格且对应栏空则自动穿上
  const addItemToHotbar = useCallback((item: Item): boolean => {
    const cur = hotbarSlotsRef.current;
    const next = [...cur];
    const stackIdx = next.findIndex((s) => s && s.id === item.id && s.count < s.maxCount);
    if (stackIdx >= 0) {
      const s = next[stackIdx]!;
      next[stackIdx] = { ...s, count: Math.min(s.maxCount, s.count + item.count) };
      setHotbarSlots(next);
      return true;
    }
    const emptyIdx = next.findIndex((s) => !s);
    if (emptyIdx < 0) {
      if (engineRef.current) {
        engineRef.current.addTextParticle(
          engineRef.current.player.x,
          engineRef.current.player.y - 1.5,
          '🎒 背包已满！按 I 整理一下',
          '#f87171'
        );
      }
      return false;
    }
    next[emptyIdx] = { ...item };
    // 自动装备：武器/护甲/工具/背包首次获得且对应栏空
    if (isEquipment(item)) {
      const slot = item.category as 'weapon' | 'armor' | 'tool' | 'pack';
      if (!equipmentRef.current[slot]) {
        const eq = { ...equipmentRef.current, [slot]: { ...item, count: 1 } };
        if (item.count > 1) next[emptyIdx] = { ...item, count: item.count - 1 };
        else next[emptyIdx] = null;
        setEquipment(eq);
        if (slot === 'armor') {
          const bonus = ARMOR_BONUS[item.id] ?? 0;
          applyArmorDelta(bonus);
        }
        if (slot === 'pack') {
          const cap = packCapacity(eq);
          while (next.length < cap) next.push(null);
        }
        setHotbarSlots(next);
        soundManager.playClick();
        if (engineRef.current) {
          engineRef.current.addTextParticle(
            engineRef.current.player.x,
            engineRef.current.player.y - 1.8,
            `已自动装备：${item.name}（按 I 查看）`,
            '#4ade80'
          );
        }
        return true;
      }
    }
    setHotbarSlots(next);
    return true;
  }, [applyArmorDelta]);

  // 统一经验发放（含升级：+10生命上限/+5护盾上限/回满）
  const grantXp = useCallback((amount: number) => {
    setPlayerStats((prev) => {
      const nextXp = prev.xp + amount;
      if (nextXp >= prev.maxXp) {
        soundManager.playCraft();
        const newLvl = prev.level + 1;
        netManagerRef.current?.sendChat('world', `✨ 我已升级至 Lv.${newLvl}！`);
        return {
          ...prev,
          level: newLvl,
          xp: nextXp - prev.maxXp,
          maxXp: Math.floor(prev.maxXp * 1.3),
          maxHp: prev.maxHp + 10,
          hp: prev.maxHp + 10,
          maxShield: prev.maxShield + 5,
          shield: prev.maxShield + 5,
          credits: prev.credits + 50,
        };
      }
      return { ...prev, xp: nextXp };
    });
  }, []);

  const pushSystemMsg = useCallback((text: string) => {
    setChatMessages((prev) => [
      ...prev.slice(-30),
      {
        id: `sys_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        channel: 'system' as const,
        sender: '求生引路',
        senderTitle: '任务',
        text,
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  }, []);

  const sendGameAction = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    if (!netManagerRef.current?.isConnected) { pushSystemMsg('连接已断开，恢复连接后再操作。'); return; }
    netManagerRef.current.gameAction(action, payload);
  }, [pushSystemMsg]);

  const applyGameState = useCallback((state: GameStateSnapshot) => {
    const prev = gameStateRef.current;
    gameStateRef.current = state;
    setGameState(state);
    const p = state.player;
    setHotbarSlots(p.inventory);
    setEquipment(p.equipment);
    setPlayerWood(p.resources.wood); setPlayerStone(p.resources.stone);
    setPlayerScrap(p.resources.scrap); setPlayerParts(p.resources.parts);
    setTotalWood(p.onboarding.wood);
    setTotalStone(p.onboarding.stone);
    setTotalScrap(v => v + Math.max(0, p.resources.scrap - (prev?.player.resources.scrap ?? 0)));
    setPlayerStats(v => ({ ...v, hp: p.hp, maxHp: p.maxHp, shield: p.shield, maxShield: p.maxShield, satiety: p.satiety, credits: p.resources.credits, shards: p.resources.shard, level: p.level, title: p.title, xp: p.xp, maxXp: p.maxXp }));
    setKillCount(p.kills);
    setClaimedPlot(!!p.campId);
    setMovedFar(p.onboarding.explored);
    setAteFood(p.onboarding.ateFood);
    setPickaxeCrafted(p.onboarding.toolEquipped);
    const owned = state.buildings.filter(b => b.ownerId === p.id);
    setWorkbenchBuilt(p.onboarding.workbenchBuilt);
    setStorageUsed(!!p.onboarding.storageUsed);
    setSafeDoorBuilt(v => v || owned.some(b => b.type === 'safe_door'));
    setTurretBuilt(p.onboarding.turretBuilt);
    setTurretLoaded(!!p.onboarding.turretLoaded);
    setRaidDoor(v => v ? state.buildings.find(b => b.id === v.id) ?? null : null);
    setManagedBuilding(v => v ? state.buildings.find(b => b.id === v.id) ?? null : null);
    if (state.loot) setLootPanel(state.loot.items.length ? { ...state.loot, items: state.loot.items.map(it => ({ ...it, taken: false })) } : null);
    else setLootPanel(panel => panel && prev?.drops.some(drop => drop.id === panel.id) && !state.drops.some(drop => drop.id === panel.id) ? null : panel);
    if (state.error) { pushSystemMsg(state.error); setActionNotice(state.error); }
    const eng = engineRef.current;
    if (!eng) return;
    eng.localPlayerId = p.id;
    eng.campEntrances = state.camps;
    const currentCamp = state.camps.find(c => c.id === p.mapId);
    eng.campSize = currentCamp?.size ?? 64;
    eng.friendlyPlayerIds = currentCamp && (currentCamp.ownerId === p.id || currentCamp.members?.includes(p.id)) ? new Set([currentCamp.ownerId, ...(currentCamp.members ?? [])]) : new Set();
    if (eng.currentMapId !== p.mapId) {
      eng.warpToMap(p.mapId, p.x, p.y);
      setCampOpen(false); setLootPanel(null);
    } else if (state.correction || !prev) {
      eng.player.x = p.x; eng.player.y = p.y;
      eng.targetMovePoint = null;
    }
    if (prev?.player.mapId === p.mapId && p.lastDamageAt > prev.player.lastDamageAt && (p.hp < prev.player.hp || (p.shield < prev.player.shield && p.maxShield >= prev.player.maxShield))) {
      eng.receiveAuthoritativeDamage(Math.max(0, prev.player.hp - p.hp) + Math.max(0, prev.player.shield - p.shield));
    }
    eng.player.hp = p.hp; eng.player.maxHp = p.maxHp;
    eng.player.shield = p.shield; eng.player.maxShield = p.maxShield;
    eng.player.satiety = p.satiety;
    eng.setAuthoritativeAmmo(p.resources.ammo);
    // Omitted delta lists retain their decoded reference; only rebuild the
    // projection for a new list, lifecycle or local editor/window reset.
    const applied = appliedBuildingsRef.current;
    if (applied?.engine !== eng || applied.mapId !== p.mapId || applied.buildings !== state.buildings
      || applied.projection !== eng.buildings || applied.count !== eng.buildings.length) {
      eng.setAuthoritativeBuildings(state.buildings);
      appliedBuildingsRef.current = { engine: eng, mapId: p.mapId, buildings: state.buildings, projection: eng.buildings, count: eng.buildings.length };
    }
    eng.setResourceStates(state.nodes);
    eng.setAuthoritativeMonsters(state.monsters);
    eng.setAuthoritativeDrops(state.drops);
  }, [pushSystemMsg]);

  // 采集技能经验（星露谷式）：升级提示 + 产量加成同步引擎
  const gainSkill = useCallback((key: 'wood' | 'stone' | 'fish') => {
    const prev = skillXpRef.current[key];
    const next = prev + (key === 'fish' ? 8 : 6);
    const updated = { ...skillXpRef.current, [key]: next };
    skillXpRef.current = updated;
    setSkillXp(updated);
    const names = { wood: '伐木', stone: '采矿', fish: '垂钓' };
    if (skillLevel(next) > skillLevel(prev) && engineRef.current) {
      const lvl = skillLevel(next);
      engineRef.current.addTextParticle(
        engineRef.current.player.x, engineRef.current.player.y - 1.8,
        `⛏️ ${names[key]}升至 Lv.${lvl}！产量+${lvl * 8}%`, '#4ade80'
      );
      soundManager.playCraft();
      pushSystemMsg(`⛏️ 采集技能提升：${names[key]} Lv.${lvl}，产量 +${lvl * 8}%！`);
    }
    if (engineRef.current) {
      engineRef.current.skillWood = skillYieldMult(skillLevel(updated.wood));
      engineRef.current.skillStone = skillYieldMult(skillLevel(updated.stone));
      engineRef.current.skillFish = skillYieldMult(skillLevel(updated.fish));
    }
  }, [pushSystemMsg]);

  // 统一掉落结算（即时采集 + 开箱拿取共用，返回是否成功进账）
  const applyLoot = useCallback((rt: LootResource, itemId: string, name: string, count: number): boolean => {
    const rarity = RARITY[itemId] ?? 1;
    switch (rt) {
      case 'wood':
        setPlayerWood((prev) => prev + count);
        setTotalWood((prev) => prev + count);
        return true;
      case 'stone':
        setPlayerStone((prev) => prev + count);
        setTotalStone((prev) => prev + count);
        return true;
      case 'scrap':
        setPlayerScrap((prev) => prev + count);
        setTotalScrap((prev) => prev + count);
        return true;
      case 'parts':
        setPlayerParts((prev) => prev + count);
        return true;
      case 'food': {
        const def = (() => { try { return getItemDef(itemId); } catch { return null; } })();
        const fv = FOOD_VALUE[itemId];
        const icon = def?.icon ?? (name.includes('鱼') || name.includes('鳟') ? '🐟' : name.includes('水') ? '💧' : '🥩');
        const dname = def?.name ?? name;
        return addItemToHotbar({ id: itemId.startsWith('food_') || itemId.startsWith('fish') || itemId.startsWith('crop_') || itemId.startsWith('cook_') || itemId.startsWith('jam_') || itemId.startsWith('wine_') || itemId.startsWith('pickle_') || itemId.startsWith('cheese_') || itemId.startsWith('honey_') ? itemId : `food_${name}`, name: dname, category: 'food', icon, count, maxCount: 99, desc: def?.desc ?? '点击快捷栏食用，恢复35点饱食。', rarity });
      }
      case 'ammo': {
        if (engineRef.current) {
          const mult = itemId === 'ammo_762' ? 30 : itemId === 'ammo_556' ? 30 : itemId === 'ammo_9mm' ? 30 : itemId === 'ammo_shell' ? 10 : itemId === 'ammo_signal' ? 10 : count;
          engineRef.current.player.reserveAmmo += mult;
          engineRef.current.addTextParticle(
            engineRef.current.player.x, engineRef.current.player.y - 1.8,
            `+${mult} 备弹（R装填）`, '#38bdf8'
          );
        }
        return true;
      }
      case 'c4':
        return addItemToHotbar({ id: 'c4_explosive', name: '高爆C4塑胶炸药', category: 'tool', icon: '💣', count, maxCount: 20, desc: '突袭破拆敌方领地高耐久安全门的利器。', rarity });
      case 'medical': {
        const def = (() => { try { return getItemDef(itemId); } catch { return null; } })();
        const heal = MED_HEAL[itemId] ?? (name.includes('绷带') ? 30 : 60);
        const isBandage = (def?.name ?? name).includes('绷带');
        return addItemToHotbar({ id: def?.id ?? `med_${name}`, name: def?.name ?? name, category: 'medical', icon: def?.icon ?? (isBandage ? '🩹' : '💉'), count, maxCount: 10, desc: def?.desc ?? (isBandage ? '点击使用，恢复30点生命。' : `点击使用，恢复${heal}点生命。`), rarity });
      }
      case 'weapon': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'weapon', icon: def.icon, count: 1, maxCount: 1, desc: `${def.desc}（单发${WEAPON_DAMAGE[itemId] ?? 50}伤）`, rarity: def.rarity });
      }
      case 'armor': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'armor', icon: def.icon, count: 1, maxCount: 1, desc: `${def.desc}（护盾+${ARMOR_BONUS_TABLE[itemId] ?? ARMOR_BONUS_TABLE[def.id] ?? 0}）`, rarity: def.rarity });
      }
      case 'credits':
        setPlayerStats((prev) => ({ ...prev, credits: prev.credits + count }));
        return true;
      case 'shard':
        setPlayerStats((prev) => ({ ...prev, shards: prev.shards + count }));
        return true;
      case 'blueprint':
        // 蓝图：一次性鉴定费（后续版本做图纸解锁）
        setPlayerStats((prev) => ({ ...prev, credits: prev.credits + 500 }));
        if (engineRef.current) {
          engineRef.current.addTextParticle(
            engineRef.current.player.x, engineRef.current.player.y - 1.8,
            '蓝图鉴定 +500 信用点', '#c084fc'
          );
        }
        return true;
      case 'pack': {
        const isTactical = itemId === 'pack_tactical';
        return addItemToHotbar({
          id: isTactical ? 'pack_tactical' : 'pack_canvas',
          name: isTactical ? '战术携行具' : '帆布背包',
          category: 'pack',
          icon: isTactical ? '🧳' : '🎒',
          count: 1, maxCount: 1,
          desc: isTactical ? '背包格 +4。' : '背包格 +2。',
          rarity,
        });
      }
      case 'throwable': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'tool', icon: def.icon, count, maxCount: def.maxCount, desc: def.desc, rarity: def.rarity });
      }
      case 'valuable': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'material', icon: def.icon, count, maxCount: def.maxCount, desc: def.desc + `（黑市可售${def.sellPrice}点）`, rarity: def.rarity });
      }
      case 'seed': {
        const def = getItemDef(itemId);
        return addItemToHotbar({ id: def.id, name: def.name, category: 'material', icon: def.icon, count, maxCount: def.maxCount, desc: def.desc, rarity: def.rarity });
      }
      default:
        setPlayerScrap((prev) => prev + count);
        setTotalScrap((prev) => prev + count);
        return true;
    }
  }, [addItemToHotbar]);

  // 开箱拿空 → 扣储量
  const emptyLootContainer = useCallback((targetId: string) => {
    const eng = engineRef.current;
    if (!eng) return;
    const it = eng.interactables.find((x) => x.id === targetId);
    if (it) {
      eng.consumeStock(it);
      eng.addTextParticle(it.x, it.y - 1.2, '搜刮一空…', '#94a3b8');
    }
  }, []);

  const handleTakeLoot = useCallback((itemId: string) => {
    const prev = lootPanelRef.current;
    if (!prev) return;
    const entry = prev.items.find((i) => i.itemId === itemId && !i.taken);
    if (!entry) return;
    if (gameStateRef.current) { sendGameAction('take_loot', { targetId: prev.id, itemId, count: entry.count }); return; }
    if (!applyLoot(lootResourceOf(itemId), itemId, entry.name, entry.count)) return;
    grantXp(3);
    soundManager.playLoot();
    const items = prev.items.map((i) => (i.itemId === itemId ? { ...i, taken: true } : i));
    if (items.every((i) => i.taken)) {
      emptyLootContainer(prev.id);
      setLootPanel(null);
    } else {
      setLootPanel({ ...prev, items });
    }
  }, [applyLoot, emptyLootContainer, grantXp]);

  const handleTakeAllLoot = useCallback(() => {
    const prev = lootPanelRef.current;
    if (!prev) return;
    if (gameStateRef.current) {
      for (const entry of prev.items) if (!entry.taken && entry.count > 0) sendGameAction('take_loot', { targetId: prev.id, itemId: entry.itemId, count: entry.count });
      return;
    }
    let changed = false;
    const items = prev.items.map((i) => {
      if (i.taken) return i;
      if (applyLoot(lootResourceOf(i.itemId), i.itemId, i.name, i.count)) {
        changed = true;
        grantXp(3);
        return { ...i, taken: true };
      }
      return i;
    });
    if (!changed) return;
    soundManager.playLoot();
    if (items.every((i) => i.taken)) {
      emptyLootContainer(prev.id);
      setLootPanel(null);
    } else {
      setLootPanel({ ...prev, items });
      pushSystemMsg('背包满了！按 I 整理或先吃掉/用掉一些，再回来拿剩下的。');
    }
  }, [applyLoot, emptyLootContainer, grantXp, pushSystemMsg]);

  // Keyboard Shortcuts (Tab for online players, M for Map, B for build, C for profile, I for backpack, Esc to close)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setIsOnlinePlayersOpen((prev) => !prev);
        soundManager.playClick();
      }
      // 聊天输入时不触发游戏快捷键
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 'm' && !activeModal && !raidDoor) {
        setActiveModal('map');
        soundManager.playClick();
      }
      if (e.key.toLowerCase() === 'c' && !activeModal && !raidDoor) {
        setActiveModal('profile');
        soundManager.playClick();
      }
      if (e.key.toLowerCase() === 'i' && !activeModal && !raidDoor) {
        setActiveModal('inventory');
        soundManager.playClick();
      }
      if (e.key === 'Escape') {
        setActiveModal(null);
        setRaidDoor(null);
        setIsOnlinePlayersOpen(false);
        setCampOpen(false); setLootPanel(null); setManagedBuilding(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, raidDoor]);

  // Initialize Realtime Multiplayer Network Manager（只连一次，切图不断线：身份保持，防幽灵连接刷人数）
  useEffect(() => {
    const netManager = new NetworkManager({
      onGameState: applyGameState,
      onInit: (data) => {
        // 过期 manager 的回包直接丢弃（防僵尸连接劫持身份）
        if (netManagerRef.current && netManagerRef.current !== netManager) return;
        setSelfId(data.selfId);
        if (data.gameState) applyGameState(data.gameState);
        setOnlinePlayers(data.players);
        if (engineRef.current) {
          engineRef.current.localPlayerId = data.selfId;
          engineRef.current.setOnlinePlayers(data.players);
          if (!data.gameState && data.buildings && data.buildings.length > 0) {
            engineRef.current.setAuthoritativeBuildings(data.buildings);
          }
        }
        if (data.weather) {
          serverWeatherRef.current = { state: data.weather, receivedAt: Date.now() };
          setWeatherState(data.weather);
          if (currentMapIdRef.current !== 'sanctuary' && engineRef.current) {
            engineRef.current.setWeather(data.weather.current, data.weather.durationLeft);
          }
        }
      },
      onPlayerJoined: (player) => {
        setOnlinePlayers((prev) => [...prev.filter((p) => p.id !== player.id), player]);
        if (engineRef.current) {
          engineRef.current.updateRemotePlayer(player);
        }
      },
      onPlayerLeft: (playerId, name) => {
        setOnlinePlayers((prev) => prev.filter((p) => p.id !== playerId));
        if (engineRef.current) {
          engineRef.current.removeRemotePlayer(playerId);
        }
      },
      onPlayerSync: (player) => {
        if (engineRef.current) {
          engineRef.current.updateRemotePlayer(player);
        }
      },
      onBuildingPlaced: (building) => {
        if (engineRef.current) {
          if (!engineRef.current.buildings.some((b) => b.id === building.id)) {
            engineRef.current.buildings.push(building);
          }
        }
      },
      onRaidResult: (raidEvent: RaidEvent) => {
        if (engineRef.current) {
          const b = engineRef.current.buildings.find((x) => x.id === raidEvent.targetId);
          if (b) {
            b.hp = raidEvent.remainingHp;
            if (raidEvent.isBreached) {
              b.isOpen = true;
              b.isLocked = false;
            }
          }
          engineRef.current.addTextParticle(
            raidEvent.targetX,
            raidEvent.targetY - 1.2,
            `-${raidEvent.damage}! ${raidEvent.isCritical ? '暴击破拆!' : ''}`,
            raidEvent.isCritical ? '#facc15' : '#f87171'
          );
        }
        soundManager.playHit(raidEvent.isCritical);
        if ((raidEvent as any)?.targetId) setRaidHit(true);

        // Update active raid modal door if open
        setRaidDoor((prev) => {
          if (prev && prev.id === raidEvent.targetId) {
            return {
              ...prev,
              hp: raidEvent.remainingHp,
              isOpen: raidEvent.isBreached ? true : prev.isOpen,
              isLocked: raidEvent.isBreached ? false : prev.isLocked,
            };
          }
          return prev;
        });
      },
      onWeatherUpdate: (wState) => {
        serverWeatherRef.current = { state: wState, receivedAt: Date.now() };
        setWeatherState(wState);
        if (engineRef.current && currentMapIdRef.current !== 'sanctuary') {
          engineRef.current.setWeather(wState.current, wState.durationLeft);
        }
      },
      onChatMessage: (msg) => {
        setChatMessages((prev) => [...prev.slice(-30), msg]);
      },
      onConnectionChange: (connected, pingMs) => {
        setIsConnected(connected);
        setPing(pingMs);
        // 重连后自动续 GM 身份
        if (connected) {
          try {
            const t = sessionStorage.getItem('sdc_gm_token');
            if (t) netManager.gmAuth(t);
          } catch { /* ignore */ }
        }
      },
      onGMStatus: (ok, error) => {
        if (ok) {
          setIsGM(true);
          pushSystemMsg('GM 身份已激活，顶栏出现「编辑」入口。');
        } else {
          setIsGM(false);
          try { sessionStorage.removeItem('sdc_gm_token'); } catch { /* ignore */ }
          pushSystemMsg(`GM 登录失败${error ? `：${error}` : '：口令错误'}。`);
        }
      },
      onPvpHit: (hit) => {
        if (engineRef.current) { engineRef.current.hurtFlash = 0.4; engineRef.current.addTextParticle(engineRef.current.player.x, engineRef.current.player.y, `受到 ${hit.attackerName} 攻击`, '#f87171'); }
      },
    });

    netManager.connect();
    netManagerRef.current = netManager;

    return () => {
      netManager.disconnect();
    };
  }, []);

  // Init Engine（等开屏关闭后再初始化：首屏只加载 splash 图，引擎与贴图解压不阻塞页面打开）
  useEffect(() => {
    if (showBoot || !canvasRef.current) return;

    const engine = new IsometricEngine(canvasRef.current, {
      onRenderStatus: message => {
        setRenderIssue(message);
        if (message) {
          setFrameDetailsText(null);
          setRenderDetailsOpen(true);
          setRenderCopyResult('');
        }
      },
      onGameAction: sendGameAction,
      onCampInteract: () => {
        const eng = engineRef.current;
        if (!eng) return false;
        if (eng.currentMapId === 'world') {
          const camp = gameStateRef.current?.camps.find(c => Math.hypot(c.x - eng.player.x, c.y - eng.player.y) <= 3);
          if (camp) { sendGameAction('enter_camp', { campId: camp.id }); return true; }
        } else if (Math.hypot(eng.player.x, eng.player.y - campExitPosition(eng.campSize).y) <= 3) {
          sendGameAction('leave_camp'); return true;
        }
        return false;
      },
      onOpenWorkbench: () => setActiveModal('workbench'),
      onLootFound: () => {},
      onOpenLootPanel: target => sendGameAction('search', { targetId: target.id }),
      onMonsterKilled: (name, maxHp) => {
        if ((maxHp ?? 0) >= 600) setEliteKilled(true);
        if ((maxHp ?? 0) >= 1000) setBossKilled(true);
      },
      onPlayerDamage: () => {},
      onUpdateSquadStatus: () => {},
      onBuildingPlaced: () => false,
      onOpenStorageBox: building => {
        setManagedBuilding(building ?? null);
        setCampOpen(true);
        if (building?.type === 'storage_box') sendGameAction('search', { targetId: building.id });
      },
      onWeatherChange: setWeatherState,
      onMapZoneChange: mapId => {
        appliedBuildingsRef.current = null;
        currentMapIdRef.current = mapId;
        setCurrentMapId(mapId);
        setLootPanel(null);
        setZoneSplash(null);
      },
      onOpenRaidModal: setRaidDoor,
      onPlayerSyncNeeded: state => {
        netManagerRef.current?.syncPlayerState({ ...state, level: playerStatsRef.current.level });
      },
    });

    engineRef.current = engine;
    const latestWeather = serverWeatherRef.current;
    engine.setWeather(latestWeather.state.current, Math.max(0, latestWeather.state.durationLeft - (Date.now() - latestWeather.receivedAt) / 1000));
    if (selfId) {
      engine.localPlayerId = selfId;
    }
    if (gameStateRef.current) applyGameState({ ...gameStateRef.current, correction: true });
    engine.inputBlocked = !!activeModal || campOpen || !!raidDoor;
    engine.start();

    // Sync state interval (60ms)
    const syncInterval = setInterval(() => {
      if (!engineRef.current || document.hidden) return;
      const eng = engineRef.current;

      setPlayerStats((prev) => ({
        ...prev,
        hp: eng.player.hp,
        shield: eng.player.shield,
        stamina: eng.player.stamina,
        satiety: eng.player.satiety,
      }));

      // 装备→引擎：战斗属性只看装备栏（背包只管存）
      const eq = equipmentRef.current;
      if (eq.weapon) {
        eng.hasRangedWeapon = true;
        const def = WEAPONS[eq.weapon.id] ?? WEAPONS['rifle'];
        eng.rangedDamage = def.damage;
        eng.rangedRange = def.range;
        eng.rangedSpread = def.spread;
        eng.rangedCritChance = def.critChance;
        eng.rangedCritMult = def.critMult;
        eng.player.fireRate = def.fireRate;
      } else {
        eng.hasRangedWeapon = false;
        eng.rangedDamage = 0;
      }
      // 星露谷式工具分化（注意 pickaxe 含 axe 子串，先判 pick）
      const tid = eq.tool?.id ?? '';
      eng.toolKind = tid.includes('pickaxe') ? 'pick' : tid.includes('axe') ? 'axe' : tid.includes('rod') ? 'rod' : 'none';
      eng.meleeDamage = eng.toolKind !== 'none' ? 22 : 12;
      eng.armorReduction = eq.armor ? (ARMOR_REDUCTION[eq.armor.id] ?? 0) : 0;
      // 上限同步（升级/护甲加成进引擎，否则治疗会被旧上限卡住）
      const ps = playerStatsRef.current;
      eng.player.maxHp = ps.maxHp;
      eng.player.maxShield = ps.maxShield;
      eng.player.maxStamina = ps.maxStamina;
      eng.player.maxSatiety = ps.maxSatiety;

      // 新手引路：走出第一步
      if (!gameStateRef.current && !movedRef.current && Math.hypot(eng.player.x, eng.player.y) > 2.5) {
        movedRef.current = true;
        setMovedFar(true);
      }

      setAmmo({
        current: eng.player.ammo,
        max: eng.player.maxAmmo,
        reserve: eng.player.reserveAmmo,
      });

      setActiveSlot(eng.activeSlot);
      setIsBuildMode(eng.isBuildMode);

      setRadarEntities({
        playerPos: { x: eng.player.x, y: eng.player.y, angle: eng.player.angle },
        monsters: eng.monsters,
        teammates: eng.teammates.map((t) => ({ x: t.x, y: t.y, name: t.name })),
        interactables: eng.interactables.map((i) => ({ x: i.x, y: i.y, name: i.name })),
        buildings: eng.buildings.map((b) => ({ x: b.x, y: b.y, type: b.type })),
        waypoints: eng.mapWaypoints.map((w) => ({
          x: w.x,
          y: w.y,
          name: w.name,
          targetMap: w.targetMap,
          icon: w.icon,
        })),
      });
      setRifleOwned((v) => v || hotbarSlotsRef.current.some((s) => s?.id === 'rifle'));
      setDarkCoreGot((v) => v || playerStatsRef.current.shards >= 12);
      setClaimedPlot((v) => v || String(currentMapIdRef.current).startsWith('home_'));

      setSquadMembers((prev) => [
        {
          ...prev[0],
          hp: Math.round(eng.player.hp),
          shield: Math.round(eng.player.shield),
        },
      ]);
    }, 120);

    return () => {
      clearInterval(syncInterval);
      engine.dispose();
      if (appliedBuildingsRef.current?.engine === engine) appliedBuildingsRef.current = null;
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [showBoot]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.inputBlocked = !!activeModal || campOpen || !!raidDoor || !!lootPanel || isOnlinePlayersOpen || renderDetailsOpen;
    if (engine.inputBlocked) { engine.clearKeys(); engine.targetMovePoint = null; }
  }, [activeModal, campOpen, raidDoor, lootPanel, isOnlinePlayersOpen, renderDetailsOpen]);

  const handleSelectSlot = useCallback((slotIdx: number) => {
    setActiveSlot(slotIdx);
    if (engineRef.current) {
      engineRef.current.activeSlot = slotIdx;
    }
  }, []);

  // Item effects and consumption are committed by the server.
  const handleUseItem = useCallback((index: number) => {
    sendGameAction('use_item', { index });
  }, [sendGameAction]);

  const handleToggleBuildMode = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.isBuildMode = !engineRef.current.isBuildMode;
      setIsBuildMode(engineRef.current.isBuildMode);
    }
  }, []);

  const handleSelectBuildType = useCallback((type: string) => {
    setSelectedBuildType(type);
    if (engineRef.current) {
      engineRef.current.selectedBuildType = type;
    }
  }, []);

  const handleSendMessage = useCallback(
    (text: string, channel: 'team' | 'world') => {
      if (netManagerRef.current && netManagerRef.current.isConnected) {
        netManagerRef.current.sendChat(channel, text);
      } else {
        const newMsg: ChatMessage = {
          id: Date.now().toString(),
          channel,
          sender: '废土流浪者',
          senderTitle: `Lv.${playerStats.level} 独行者`,
          text,
          timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          isSelf: true,
        };
        setChatMessages((prev) => [...prev.slice(-30), newMsg]);
      }
    },
    [playerStats.level]
  );

  const markDestination = useCallback((x: number, y: number, name = '目的地') => {
    if (engineRef.current) engineRef.current.navigationTarget = { x, y, name };
    pushSystemMsg(`已标记 ${name}（${Math.round(x)}, ${Math.round(y)}），沿道路前往。`);
    setActiveModal(null);
  }, [pushSystemMsg]);

  const handleSelectMapZone = useCallback((zoneId: MapZoneId, x?: number, y?: number) => {
    const location = WORLD_LOCATIONS.find(l => l.sourceMapId === zoneId);
    markDestination(x ?? location?.x ?? 0, y ?? location?.y ?? 0, location?.name ?? '地图标记');
  }, [markDestination]);

  const handleGoHome = useCallback(() => {
    const camp = gameStateRef.current?.camps.find(c => c.id === gameStateRef.current?.player.campId);
    if (camp) markDestination(camp.x, camp.y, '我的营地');
    setCampOpen(true);
  }, [markDestination]);

  const handleVisitHome = useCallback((targetId: string, targetName: string) => {
    const camp = gameStateRef.current?.camps.find(c => c.ownerId === targetId);
    if (camp) markDestination(camp.x, camp.y, `${targetName}的营地`);
    else pushSystemMsg('尚未在附近发现该玩家营地，需要到野外寻找入口。');
  }, [markDestination, pushSystemMsg]);

  const handleBuyMarketItem = useCallback((item: MarketItem, quantity: number): boolean => {
    sendGameAction('buy', { itemId: item.id, quantity });
    return true;
  }, [sendGameAction]);

  const handleSellMarketItem = useCallback((item: MarketItem, quantity: number): boolean => {
    sendGameAction('sell', { itemId: item.id, quantity });
    return true;
  }, [sendGameAction]);

  const handleCraftSuccess = useCallback((order: CraftOrder) => {
    sendGameAction('craft', { recipeId: order.id });
  }, [sendGameAction]);

  const handleExecuteRaid = useCallback((supplyId: string) => {
    if (raidDoor) sendGameAction('raid', { targetId: raidDoor.id, supplyId });
  }, [raidDoor, sendGameAction]);

  const handleClaimRaidLoot = useCallback(() => {
    pushSystemMsg('破门不会生成奖励，请进入营地搜取实际仓库物资。');
  }, [pushSystemMsg]);

  const handleResetGame = useCallback(() => {
    engineRef.current?.clearKeys();
    pushSystemMsg('已清除移动按键；存档、位置和生命值由服务器保存。');
    setActiveModal(null);
  }, [pushSystemMsg]);

  const handleGMLogin = useCallback((token: string) => {
    try { sessionStorage.setItem('sdc_gm_token', token); } catch { /* ignore */ }
    if (netManagerRef.current && netManagerRef.current.isConnected) {
      netManagerRef.current.gmAuth(token);
    } else {
      // 离线也允许本地编辑（天气调度需在线）
      setIsGM(true);
      pushSystemMsg('已进入本地 GM 编辑模式（离线：天气调度需联网）。');
    }
  }, [pushSystemMsg]);

  const handleGMLogout = useCallback(() => {
    try { sessionStorage.removeItem('sdc_gm_token'); } catch { /* ignore */ }
    setIsGM(false);
    if (engineRef.current) engineRef.current.setEditMode(false);
    setActiveModal(null);
  }, []);

  const handleEditorWeather = useCallback((weather: string, label: string) => {
    // 本地预览即时生效
    if (engineRef.current) {
      engineRef.current.setWeather(weather as WeatherState['current']);
    }
    // 在线 GM 则广播全服
    if (netManagerRef.current && netManagerRef.current.isConnected) {
      netManagerRef.current.requestWeather(weather);
      pushSystemMsg(`已请求全服天气切换：${label}（需 GM 鉴权）。`);
    } else {
      pushSystemMsg(`本地预览天气：${label}（离线，仅自己可见）。`);
    }
  }, [pushSystemMsg]);

  const questSteps: QuestStep[] = [
    { id: 'move', title: '探索公共荒野', desc: 'WASD 或右键移动，沿道路进入林地、矿场和城镇；打开地图标记目的地。', progressText: movedFar ? '1/1' : '0/1', done: movedFar },
    { id: 'wood', title: '收集木材', desc: '捡取枯枝、搜刮农舍；装备斧后伐木更快。按住 E/F 可连续采集。', progressText: `${Math.min(totalWood, 20)}/20`, done: totalWood >= 20 },
    { id: 'stone', title: '收集石料', desc: '捡取碎石或开采石堆，制作镐来提升效率。满包不会扣除未收到的物资。', progressText: `${Math.min(totalStone, 10)}/10`, done: totalStone >= 10 },
    { id: 'pickaxe', title: '制作并装备开山镐', desc: '从制造面板制作开山镐（8木、6石），在背包中装备。完成后更换工具不影响进度。', progressText: pickaxeCrafted ? '1/1' : '0/1', done: pickaxeCrafted },
    { id: 'claim', title: '在野外建立营地', desc: '收集20木、10石，在道路和地标外选址，打开营地面板插旗；开局没有私人领地。', progressText: claimedPlot ? '1/1' : '0/1', done: claimedPlot },
    { id: 'workbench', title: '建设与储存', desc: '在自己的营地建造工作台和仓库，并实际存入物资。零件可去维修工棚或拆车获取；取出物资不影响已完成的引导。', progressText: !workbenchBuilt ? '未建工作台' : storageUsed ? '1/1' : '待存入物资', done: workbenchBuilt && storageUsed },
    { id: 'turret', title: '准备离线防御', desc: '架设炮塔并靠近按 E 装入至少10发弹药，可在工作台制造弹药。墙门与地刺辅助阻挡；弹药会消耗，需要继续补充。', progressText: !turretBuilt ? '未建炮塔' : turretLoaded ? '1/1' : '待装10发弹药', done: turretBuilt && turretLoaded },
    { id: 'survive', title: '补给与谨慎撤离', desc: '在营地种植、烹饪和研究，探索更远区域。死亡会掉落携带物资，进出营地不会回血。', progressText: ateFood ? '已补给' : '待补给', done: ateFood },
  ];

  useEffect(() => {
    for (const step of questSteps) if (step.done && !grantedQuestsRef.current.has(step.id)) {
      grantedQuestsRef.current.add(step.id);
      pushSystemMsg(`引路完成：${step.title}`);
    }
  }, [movedFar, totalWood, totalStone, totalScrap, pickaxeCrafted, claimedPlot, workbenchBuilt, storageUsed, safeDoorBuilt, turretBuilt, turretLoaded, ateFood]);

  const craftPlayer = activeModal === 'workbench' ? gameState?.player : undefined;
  const craftCamp = gameState?.camps.find(camp => camp.id === craftPlayer?.mapId);
  const craftWorkbench = craftPlayer && gameState ? findCraftingWorkbench(craftPlayer, gameState.buildings,
    () => engineRef.current?.currentMapId === craftPlayer.mapId ? engineRef.current.interactables : [],
    building => building.ownerId === craftPlayer.id || craftCamp?.ownerId === building.ownerId && !!craftCamp?.members?.includes(craftPlayer.id),
  ) : undefined;
  const hasCraftWorkbench = !!craftPlayer && !!gameState && !!craftWorkbench && hasLineOfSight(craftPlayer, craftWorkbench, gameState.buildings, craftWorkbench.id);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 2.5D Isometric Canvas Engine */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" />
      {renderDetailsOpen && <div role="alert" className="absolute inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-4 text-slate-100">
        <div className="w-full max-w-xl space-y-4 rounded-xl border border-amber-700/50 bg-slate-900 p-6 text-center">
          <p>{renderIssue ?? (frameDetailsText !== null ? '卡顿记录（仅保留在本地，刷新后清空）' : readRenderDiagnostics() === '[]' ? '暂无画面错误记录' : '画面已恢复，错误信息已保留')}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {!renderIssue && <button className="rounded bg-emerald-700 px-4 py-2" onClick={() => setRenderDetailsOpen(false)}>继续游戏</button>}
            <button className="rounded bg-amber-600 px-4 py-2" onClick={() => window.location.reload()}>重新载入</button>
            <button className="rounded bg-slate-700 px-4 py-2" onClick={async () => setRenderCopyResult(await copyDiagnosticText(frameDetailsText ?? readRenderDiagnostics()) ? '已复制记录' : '复制未成功，请在下方长按或选中文字复制')}>{frameDetailsText !== null ? '复制卡顿记录' : '复制错误信息'}</button>
          </div>
          {renderCopyResult && <p role="status" className="text-sm text-amber-200">{renderCopyResult}</p>}
          <textarea aria-label={frameDetailsText !== null ? '卡顿记录' : '错误信息'} readOnly value={frameDetailsText ?? readRenderDiagnostics()} className="h-40 w-full select-text rounded bg-slate-950 p-3 text-left font-mono text-xs text-slate-300" onFocus={event => event.currentTarget.select()} />
        </div>
      </div>}

      {/* Boot splash：keyart 开屏，点进入废土关闭 */}
      {showBoot && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center cursor-pointer"
          onClick={() => { soundManager.playClick(); setShowBoot(false); }}
        >
          <img src="/art/keyart-dawn.jpg" alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/40" />
          <div className="relative text-center px-6">
            <h1 className="text-4xl sm:text-5xl font-black text-amber-300 tracking-widest drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">坍界行者</h1>
            <p className="mt-2 text-sm text-slate-200 tracking-[0.5em]">边缘黎明</p>
            <div className="mt-8 inline-block px-8 py-3 rounded-xl bg-amber-500/90 hover:bg-amber-400 text-slate-950 font-black tracking-widest transition-colors">进入废土</div>
            <p className="mt-3 text-[11px] text-slate-400 font-mono">WASD 移动 · 鼠标瞄准 · 点击开火</p>
          </div>
        </div>
      )}

      {/* 切图 splash：地图预览图 bridge，2.4s 后消失 */}
      {zoneSplash && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <img
            key={zoneSplash.nonce}
            src={THEME_SPLASH_IMG[SUBMAPS[zoneSplash.mapId]?.theme ?? 'camp'] ?? '/art/map-camp.jpg'}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/50" />
          <div className="relative text-center px-6">
            <p className="text-[11px] font-mono text-cyan-300 tracking-[0.4em]">正在进入</p>
            <h2 className="mt-1 text-3xl font-black text-slate-100 tracking-widest">{displayName(zoneSplash.mapId)}</h2>
          </div>
        </div>
      )}

      {/* HUD 区域：开屏期间 display:none，HUD 图标/Panel 贴图（~7MB）延后到进入游戏才加载 */}
      <div hidden={showBoot} className="game-hud">
      {/* Top Menu Bar with Weather Widget, Online Ping & Roster Button */}
      <TopMenuBar
        onOpenModal={(modal) => { if (modal === 'anchor') { setManagedBuilding(null); setCampOpen(true); } else setActiveModal(modal); }}
        activeModal={activeModal}
        onlineCount={Math.max(1, onlinePlayers.length)}
        ping={ping}
        onOpenOnlinePlayers={() => setIsOnlinePlayersOpen(true)}
        isGM={isGM}
        dailyRedDot={dailyRedDot}
        mapName={engineRef.current?.getMapName(currentMapId) || '恒界营地 · 营地广场'}
        coords={radarEntities.playerPos}
        weatherWidget={
          <WeatherWidget
            weather={weatherState}
            currentMapId={currentMapId}
          />
        }
      />

      {/* Top Right Radar Minimap (Click to open Tactical World Map [M]) */}
      <div className="absolute top-4 right-4 z-20">
        <RadarMinimap
          currentMapId={currentMapId}
          playerPos={radarEntities.playerPos}
          monsters={radarEntities.monsters}
          teammates={radarEntities.teammates}
          interactables={radarEntities.interactables}
          buildings={radarEntities.buildings}
          waypoints={radarEntities.waypoints}
          onOpenWorldMap={() => setActiveModal('map')}
        />
      </div>

      {/* 单人模式：无NPC小队面板，在线真人见右上战区名单/雷达 */}

      {/* Left Side Quest Guide */}
      <div className="absolute left-3 top-20 z-20">
        <QuestPanel steps={questSteps} />
      </div>

      {/* Bottom Left Character Status HUD, Tactical Radio Chat & Direction Controls */}
      <div className="absolute bottom-4 left-4 z-20 flex items-end gap-3 pointer-events-none">
        <div className="flex flex-col gap-2 pointer-events-auto">
          <CharacterHUD stats={playerStats} />
          <RadioChat messages={chatMessages} onSendMessage={handleSendMessage} />
        </div>
        <div className="pointer-events-auto mb-1">
          <TacticalDpad
            onDirectionChange={(dir) => {
              if (engineRef.current) {
                engineRef.current.virtualJoystick = dir;
              }
            }}
            onResetKeys={() => {
              engineRef.current?.clearKeys();
            }}
            activeKeys={activeKeys}
            currentCoords={radarEntities.playerPos}
          />
        </div>
      </div>

      {/* Bottom Center 6-Slot Tactical Hotbar, Tier-1 Gathering Material Pack & Territory Building Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
        {/* Tier-1 Survival Gathering Materials Bar (参考 《裂隙拾荒者》 逻辑) */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-cyan-500/40 shadow-lg text-[11px] font-mono text-slate-200">
          <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">一级搜集物资:</span>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/80 border border-amber-600/40 text-amber-300">
            <span>🪵 原木:</span>
            <span className="font-bold">{playerWood}</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/80 border border-slate-500/40 text-slate-200">
            <span>🪨 条石:</span>
            <span className="font-bold">{playerStone}</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/80 border border-cyan-500/40 text-cyan-300">
            <span>⚙️ 废铁:</span>
            <span className="font-bold">{playerScrap}</span>
          </div>
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900/80 border border-emerald-500/40 text-emerald-300">
            <span>🔧 零件:</span>
            <span className="font-bold">{playerParts}</span>
          </div>
          <button
            onClick={() => { soundManager.playClick(); setActiveModal('inventory'); }}
            className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-950/60 border border-amber-500/50 text-amber-300 hover:bg-amber-900/60 transition-colors font-bold"
            title="打开背包与装备 [I]"
          >
            <span>🎒 背包</span>
            <span className="text-[9px] font-mono opacity-70">[I]</span>
          </button>
        </div>

        <div className="flex justify-center gap-2 mb-2">
          <button onClick={() => { setManagedBuilding(null); setCampOpen(true); }} className="rounded-lg border border-amber-600/60 bg-slate-950/90 px-3 py-1.5 text-xs font-bold text-amber-200">🏕️ 营地与建营</button>
          <button onClick={() => setActiveModal('workbench')} className="rounded-lg border border-slate-600 bg-slate-950/90 px-3 py-1.5 text-xs text-slate-200">🛠️ 随身制造</button>
        </div>

        {/* Building Bar Toggle & Structure Selection */}
        <BuildingBar
          isBuildMode={isBuildMode}
          selectedType={selectedBuildType}
          onSelectType={handleSelectBuildType}
          onToggleBuildMode={handleToggleBuildMode}
          playerScrap={playerScrap}
          playerParts={playerParts}
          playerWood={playerWood}
          playerStone={playerStone}
        />

        {/* 6-Slot Hotbar */}
        <Hotbar
          slots={hotbarSlots.slice(0, 6)}
          activeSlotIndex={activeSlot}
          ammo={ammo}
          onSelectSlot={handleSelectSlot}
          onUseItem={handleUseItem}
        />
      </div>

      {/* Territory Raid / Safe Door Assault Modal */}
      {raidDoor && (
        <RaidModal
          door={raidDoor}
          onClose={() => setRaidDoor(null)}
          onRaidAttempt={handleExecuteRaid}
          onClaimLoot={handleClaimRaidLoot}
          resources={gameState?.player.resources}
          inventory={hotbarSlots}
          equipment={equipment}
        />
      )}

      {/* Online Players Roster Modal [Tab] */}
      {isOnlinePlayersOpen && (
        <OnlinePlayersModal
          players={onlinePlayers.length > 0 ? onlinePlayers : [
            {
              id: 'self',
              name: '废土流浪者 (你)',
              level: playerStats.level,
              title: playerStats.title,
              avatarSeed: 'self',
              x: 0,
              y: 0,
              angle: 0,
              mapId: currentMapId,
              hp: playerStats.hp,
              maxHp: playerStats.maxHp,
              shield: playerStats.shield,
              maxShield: playerStats.maxShield,
              isFiring: false,
              isDashing: false,
              color: '#06b6d4',
              ping: ping,
              lastSeen: Date.now(),
              currentAction: '战备',
            }
          ]}
          selfId={selfId || 'self'}
          ping={ping}
          isConnected={isConnected}
          onClose={() => setIsOnlinePlayersOpen(false)}
          onInviteToSquad={(p) => {
            handleSendMessage(`已向 [${p.name}] 发送小队战术协同邀请！`, 'team');
          }}
          onVisitHome={handleVisitHome}
        />
      )}

      {/* Tactical World Map Modal [M] */}
      <WorldMapModal
        isOpen={activeModal === 'map'}
        onClose={() => setActiveModal(null)}
        currentMapId={currentMapId}
        playerPos={radarEntities.playerPos}
        teammates={radarEntities.teammates}
        monsters={radarEntities.monsters}
        waypoints={radarEntities.waypoints}
        onSelectMapZone={handleSelectMapZone}
        onGoHome={handleGoHome}
        onSetWaypoint={markDestination}
        camps={gameState?.camps ?? []}
        campSize={engineRef.current?.campSize ?? 64}
      />

      {/* Interactive Modals */}
      <MarketModal
        isOpen={activeModal === 'market'}
        onClose={() => setActiveModal(null)}
        playerCredits={playerStats.credits}
        playerShards={playerStats.shards}
        onBuyItem={handleBuyMarketItem}
        onSellItem={handleSellMarketItem}
      />

      <WorkbenchModal
        isOpen={activeModal === 'workbench'}
        onClose={() => setActiveModal(null)}
        playerWood={playerWood}
        playerStone={playerStone}
        playerScrap={playerScrap}
        playerParts={playerParts}
        onCraftSuccess={handleCraftSuccess}
        hasWorkbench={hasCraftWorkbench}
        blueprints={gameState?.player.blueprints}
        hasExtra={(itemId, count) => {
          let have = 0;
          for (const s of hotbarSlotsRef.current) if (s && s.id === itemId) have += s.count;
          return have >= count;
        }}
      />

      <RiftModal
        isOpen={activeModal === 'rift'}
        onClose={() => setActiveModal(null)}
        onClaimReward={() => {
          setPlayerStats((prev) => ({
            ...prev,
            credits: prev.credits + 300,
          }));
          if (engineRef.current) {
            engineRef.current.player.reserveAmmo += 50;
          }
          setActiveModal(null);
        }}
        hasReward={false}
      />

      <AnchorModal
        isOpen={activeModal === 'anchor'}
        onClose={() => setActiveModal(null)}
        onUpgradeAnchor={() => {
          setPlayerStats((prev) => ({
            ...prev,
            xp: prev.xp + 150,
          }));
          setActiveModal(null);
        }}
      />

      <ProfileModal
        isOpen={activeModal === 'profile'}
        onClose={() => setActiveModal(null)}
        stats={playerStats}
        killCount={killCount}
        scavengeCount={scavengeCount}
        skills={skillXp}
      />

      {/* 三角洲式搜刮面板 */}
      <LootPanel
        target={campOpen ? null : lootPanel}
        onTake={handleTakeLoot}
        onTakeAll={handleTakeAllLoot}
        onClose={() => setLootPanel(null)}
      />

      <CampPanel
        isOpen={campOpen}
        onClose={() => { setCampOpen(false); setLootPanel(null); setManagedBuilding(null); }}
        camps={gameState?.camps ?? []}
        campId={gameState?.player.campId ?? null}
        currentMapId={currentMapId}
        playerPos={radarEntities.playerPos}
        selfId={selfId}
        resources={gameState?.player.resources ?? {}}
        inventory={hotbarSlots}
        building={managedBuilding}
        loot={lootPanel}
        reports={gameState?.reports ?? []}
        blueprints={gameState?.player.blueprints ?? []}
        onAction={sendGameAction}
        onNavigate={markDestination}
      />
      {actionNotice && <button onClick={() => setActionNotice('')} role="status" className="fixed top-24 left-1/2 z-[80] -translate-x-1/2 rounded-xl border border-amber-500/60 bg-slate-950 px-5 py-3 text-sm text-amber-200 shadow-xl">{actionNotice} · 点击关闭</button>}

      <SettingsModal
        isOpen={activeModal === 'settings'}
        onClose={() => setActiveModal(null)}
        onResetGame={handleResetGame}
        isGM={isGM}
        onGMLogin={handleGMLogin}
        onGMLogout={handleGMLogout}
        onOpenRenderDiagnostics={() => { setFrameDetailsText(null); setActiveModal(null); setRenderCopyResult(''); setRenderDetailsOpen(true); }}
        onOpenFrameDiagnostics={() => { setFrameDetailsText(engineRef.current?.readFrameDiagnostics() ?? '{"status":"引擎尚未启动"}'); setActiveModal(null); setRenderCopyResult(''); setRenderDetailsOpen(true); }}
      />

      <InventoryModal
        isOpen={activeModal === 'inventory'}
        onClose={() => setActiveModal(null)}
        hotbar={hotbarSlots}
        equipment={equipment}
        materials={{ wood: playerWood, stone: playerStone, scrap: playerScrap, parts: playerParts }}
        onUseItem={handleUseItem}
        onEquip={equipItem}
        onUnequip={unequipSlot}
        onDrop={dropItem}
      />

      <MapEditorModal
        isOpen={activeModal === 'editor'}
        onClose={() => setActiveModal(null)}
        getEngine={() => engineRef.current}
        mapName={engineRef.current?.getMapName(currentMapId) || currentMapId}
        onSetWeather={handleEditorWeather}
      />
      </div>
    </div>
  );
}
