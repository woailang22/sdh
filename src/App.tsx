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
import { homeMapIdFor } from './game/home';
import { CraftOrder } from './components/WorkbenchModal';
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
  const netManagerRef = useRef<NetworkManager | null>(null);

  // Active Map Zone
  const [currentMapId, setCurrentMapId] = useState<MapZoneId>('camp_plaza');

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
  const [weatherState, setWeatherState] = useState<WeatherState>({
    current: 'clear',
    name: '恒界破晓',
    icon: '☀️',
    desc: '晴空破晓，全图视野清澈明亮！',
    effectLabel: '搜刮掉落提升 25%',
    durationLeft: 180,
  });

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

  // Inventory Hotbar（零开局：6格全空，靠采集/搜刮/制造填满）
  const [hotbarSlots, setHotbarSlots] = useState<(Item | null)[]>([
    null,
    null,
    null,
    null,
    null,
    null,
  ]);

  // 个人装备栏：武器/护甲/工具/背包（战斗属性只看这里，背包决定格数）
  const [equipment, setEquipment] = useState<Equipment>({ weapon: null, armor: null, tool: null, pack: null });
  const equipmentRef = useRef(equipment);
  equipmentRef.current = equipment;

  // 背包容量：基础6格 + 背包装备（帆布+2/战术+4）
  const packCapacity = (eq: Equipment) =>
    6 + (eq.pack?.id === 'pack_tactical' ? 4 : eq.pack?.id === 'pack_canvas' ? 2 : 0);

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
      text: '欢迎来到末日废土！营地只管建造不产物资：去野外山地/城镇徒手采集木/石/废铁 → 回营地工作台制造 → 钓鱼补充饱食。在线真人同图求生。',
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

  // 新手引路进度（累计量，不随花费减少）
  const [totalWood, setTotalWood] = useState(0);
  const [totalStone, setTotalStone] = useState(0);
  const [totalScrap, setTotalScrap] = useState(0);
  const [ateFood, setAteFood] = useState(false);
  const [movedFar, setMovedFar] = useState(false);
  const [workbenchBuilt, setWorkbenchBuilt] = useState(false);
  const [pickaxeCrafted, setPickaxeCrafted] = useState(false);
  const [safeDoorBuilt, setSafeDoorBuilt] = useState(false);
  const [turretBuilt, setTurretBuilt] = useState(false);
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

  // 脱装备：装备栏 → 背包（脱背包时若东西超6格则拒绝）
  const unequipSlot = useCallback((slot: 'weapon' | 'armor' | 'tool' | 'pack') => {
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
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal, raidDoor]);

  // Initialize Realtime Multiplayer Network Manager（只连一次，切图不断线：身份保持，防幽灵连接刷人数）
  useEffect(() => {
    const netManager = new NetworkManager({
      onInit: (data) => {
        // 过期 manager 的回包直接丢弃（防僵尸连接劫持身份）
        if (netManagerRef.current && netManagerRef.current !== netManager) return;
        setSelfId(data.selfId);
        setOnlinePlayers(data.players);
        if (engineRef.current) {
          engineRef.current.localPlayerId = data.selfId;
          engineRef.current.setOnlinePlayers(data.players);
          if (data.buildings && data.buildings.length > 0) {
            engineRef.current.buildings = data.buildings;
          }
        }
        if (data.weather) {
          setWeatherState(data.weather);
          if (currentMapIdRef.current !== 'sanctuary' && engineRef.current) {
            engineRef.current.setWeather(data.weather.current);
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
        setWeatherState(wState);
        if (engineRef.current && currentMapIdRef.current !== 'sanctuary') {
          engineRef.current.setWeather(wState.current);
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
        engineRef.current?.applyPvpHit(hit.damage, hit.attackerName);
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
      onOpenWorkbench: () => {
        setActiveModal('workbench');
      },
      onLootFound: (itemName: string, count: number, resourceType?: 'wood' | 'stone' | 'scrap' | 'parts' | 'food' | 'ammo' | 'c4' | 'medical' | 'weapon' | 'armor' | 'credits' | 'shard' | 'blueprint' | 'pack') => {
        setScavengeCount((prev) => prev + 1);
        grantXp(8);
        setPlayerStats((prev) => ({ ...prev, credits: prev.credits + count }));
        // 即时采集（星露谷侧）：树/石/鱼
        if (resourceType === 'wood') gainSkill('wood');
        else if (resourceType === 'stone') gainSkill('stone');
        else if (resourceType === 'food' && (itemName.includes('鱼') || itemName.includes('鳟'))) gainSkill('fish');
        const guessId =
          resourceType === 'wood' ? 'wood'
          : resourceType === 'stone' ? 'stone'
          : resourceType === 'food' ? 'fish'
          : resourceType === 'ammo' ? 'ammo'
          : resourceType === 'c4' ? 'c4_explosive'
          : resourceType === 'medical' ? (itemName.includes('绷带') ? 'bandage' : 'medkit')
          : resourceType === 'weapon' ? 'rifle'
          : resourceType === 'armor' ? 'vest'
          : resourceType === 'credits' ? 'credits'
          : resourceType === 'shard' ? 'shard'
          : resourceType === 'blueprint' ? 'blueprint'
          : resourceType === 'pack' ? (itemName.includes('战术') ? 'pack_tactical' : 'pack_canvas')
          : 'scrap';
        applyLoot(resourceType ?? 'scrap', guessId, itemName, count);
      },
      onOpenLootPanel: (target) => {
        // 三角洲式开箱：校验还有储量才打开
        const eng = engineRef.current;
        if (eng) {
          const it = eng.interactables.find((x) => x.id === target.id);
          if (!it || (it.stock ?? 1) <= 0) return;
        }
        setLootPanel({
          id: target.id,
          name: target.name,
          items: target.items.map((i) => ({ ...i, taken: false })),
        });
      },
      onMonsterKilled: (monsterName: string, monsterMaxHp?: number) => {
        setKillCount((prev) => prev + 1);
        if ((monsterMaxHp ?? 0) >= 550) setEliteKilled(true);
        if (monsterName.includes('深渊霸主') || monsterName.includes('领主BOSS')) setBossKilled(true);
        if (monsterName.includes('蚀骸巨兽')) setBossKilled(true);
        const reward = killReward(monsterMaxHp ?? 300);
        const xpGained = reward.xp;

        // Level-up logic（求生数值：升级+10生命/+5护盾）
        setPlayerStats((prev) => {
          const nextXp = prev.xp + xpGained;
          if (nextXp >= prev.maxXp) {
            soundManager.playCraft();
            const newLvl = prev.level + 1;
            // Broadcast level up in server chat
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
              credits: prev.credits + reward.credits,
            };
          }
          return {
            ...prev,
            xp: nextXp,
            credits: prev.credits + reward.credits,
            shards: prev.shards + reward.shards,
          };
        });
        // 击杀掉落：按强度概率掉弹药/医疗（进背包，满则转文字提示）
        if (engineRef.current) {
          const eng = engineRef.current;
          const roll = Math.random();
          if ((monsterMaxHp ?? 0) >= 1000 || roll < 0.25) {
            eng.player.reserveAmmo += 12;
            eng.addTextParticle(eng.player.x, eng.player.y - 1.8, '+12 步枪弹药（按R装填）', '#38bdf8');
          } else if (roll < 0.4) {
            addItemToHotbar({ id: 'med_亚麻绷带', name: '亚麻绷带', category: 'medical', icon: '🩹', count: 1, maxCount: 10, desc: '点击使用，恢复30点生命。', rarity: 2 });
          }
        }
      },
      onPlayerDamage: (dmg: number) => {},
      onUpdateSquadStatus: (_members: SquadMember[]) => {
        // 单人模式：忽略NPC小队状态，仅保留自己
      },
      onBuildingPlaced: (type: string, costWood: number, costStone: number, costScrap: number, costParts: number) => {
        if (
          playerWoodRef.current < costWood ||
          playerStoneRef.current < costStone ||
          playerScrapRef.current < costScrap ||
          playerPartsRef.current < costParts
        ) {
          return false;
        }

        // Deduct materials accurately based on blueprint costs
        if (costWood > 0) setPlayerWood((prev) => Math.max(0, prev - costWood));
        if (costStone > 0) setPlayerStone((prev) => Math.max(0, prev - costStone));
        if (costScrap > 0) setPlayerScrap((prev) => Math.max(0, prev - costScrap));
        if (costParts > 0) setPlayerParts((prev) => Math.max(0, prev - costParts));
        grantXp(20);
        if (type === 'workbench') setWorkbenchBuilt(true);
        if (type === 'safe_door') setSafeDoorBuilt(true);
        if (type === 'turret') setTurretBuilt(true);

        // Broadcast to multiplayer server
        if (netManagerRef.current && engineRef.current) {
          const mouseX = Math.round(engineRef.current.mouse.worldX);
          const mouseY = Math.round(engineRef.current.mouse.worldY);
          netManagerRef.current.placeBuilding({
            type,
            name: type === 'safe_door' ? '高耐久防爆安全门' : '领地防御设施',
            x: mouseX,
            y: mouseY,
            hp: type === 'safe_door' ? 5000 : 800,
            maxHp: type === 'safe_door' ? 5000 : 800,
            mapId: currentMapId,
          });
        }
        const eb = engineRef.current as any;
        if (eb && Array.isArray(eb._serverBuildings)) {
          eb._serverBuildings.push({ id: `b_${Date.now()}`, type, x: Math.round(eb.mouse.worldX), y: Math.round(eb.mouse.worldY), mapId: currentMapId, ownerId: selfId });
        }
        return true;
      },
      onOpenStorageBox: (building) => {
        grantXp(10);
        const loot = building?.storedLoot;
        if (loot && loot.length > 0) {
          // 建筑含物资：按名关键字分拣进账
          for (const l of loot) {
            const n = l.name;
            if (/信用|钞票|凭证/.test(n)) {
              setPlayerStats((p) => ({ ...p, credits: p.credits + l.count }));
            } else if (/晶/.test(n)) {
              setPlayerStats((p) => ({ ...p, shards: p.shards + l.count }));
            } else if (/C4|炸药|爆破|铝热|解码|EMP|火炬/.test(n)) {
              addItemToHotbar({ id: 'c4_explosive', name: '高爆C4塑胶炸药', category: 'tool', icon: '💣', count: l.count, maxCount: 20, desc: '突袭破拆敌方安全门的利器。' });
            } else if (/医疗|绷带|针剂|药剂|急救/.test(n)) {
              addItemToHotbar({ id: `med_${n}`, name: n, category: 'medical', icon: '💉', count: l.count, maxCount: 10, desc: '点击使用，恢复生命。' });
            } else if (/弹药|子弹/.test(n)) {
              if (engineRef.current) engineRef.current.player.reserveAmmo += l.count * 10;
            } else if (/食物|肉|鱼|罐头|干粮|合剂|口粮|莲藕|熏鱼/.test(n)) {
              addItemToHotbar({ id: `food_${n}`, name: n, category: 'food', icon: '🥩', count: l.count, maxCount: 99, desc: '点击食用，恢复饱食。' });
            } else if (/蓝图/.test(n)) {
              setPlayerStats((p) => ({ ...p, credits: p.credits + 500 }));
            } else if (/装甲|护甲|背心/.test(n)) {
              addItemToHotbar({ id: 'armor_vest', name: '军用防弹背心', category: 'armor', icon: '🦺', count: 1, maxCount: 1, desc: '护盾上限+50，受伤减免15%。' });
            } else {
              setPlayerScrap((prev) => prev + l.count);
              setTotalScrap((prev) => prev + l.count);
            }
          }
          if (engineRef.current) {
            engineRef.current.addTextParticle(
              engineRef.current.player.x,
              engineRef.current.player.y - 1.2,
              `开箱：${loot.map((l) => `${l.name}×${l.count}`).join('、').slice(0, 24)}`,
              '#4ade80'
            );
          }
        } else {
          setPlayerScrap((prev) => prev + 15);
          setTotalScrap((prev) => prev + 15);
          if (engineRef.current) {
            engineRef.current.addTextParticle(
              engineRef.current.player.x,
              engineRef.current.player.y - 1.2,
              '+15 废铁（公共储物箱）',
              '#10b981'
            );
          }
        }
      },
      onWeatherChange: (w: WeatherState) => {
        setWeatherState(w);
      },
      onMapZoneChange: (mapId: MapZoneId) => {
        const from = String(currentMapIdRef.current);
        const to = String(mapId);
        const fromCamp = from.startsWith('camp_');
        const toWild = !to.startsWith('camp_') && !to.startsWith('home_') && to !== 'sanctuary';
        // 新手卡点：没做出开山镐就出境只提示不硬锁
        if (fromCamp && toWild && !pickaxeCraftedRef.current) {
          pushSystemMsg('⛏️ 出境前先回营地工作台做出开山镐吧（8木+6石，采石效率+60%），野外才好混！');
        }
        setCurrentMapId(mapId);
        setLootPanel(null); // 切图关箱
        // 切图 splash：预览图 bridge（2.4s），所见即所得的心理锚点
        window.clearTimeout(splashTimer.current);
        setZoneSplash({ mapId, nonce: Date.now() });
        splashTimer.current = window.setTimeout(() => setZoneSplash(null), 2400);
      },
      onOpenRaidModal: (doorBuilding: BuildingEntity) => {
        setRaidDoor(doorBuilding);
      },
      onPlayerSyncNeeded: (pState) => {
        if (netManagerRef.current && netManagerRef.current.isConnected) {
          netManagerRef.current.syncPlayerState({
            ...pState,
            level: playerStats.level,
          });
        }
      },
      onPlayerDeathDrop: (mapId) => {
        const cur = [...hotbarSlotsRef.current];
        const r = calcDeathDrop(cur, mapId);
        if (r.clearReserveAmmo && engineRef.current) engineRef.current.player.reserveAmmo = 0;
        for (const i of r.droppedIndexes) cur[i] = null;
        setHotbarSlots(cur);
      },
    });

    engineRef.current = engine;
    if (selfId) {
      engine.localPlayerId = selfId;
    }
    engine.start();

    // Sync state interval (60ms)
    const syncInterval = setInterval(() => {
      if (!engineRef.current) return;
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
      if (!movedRef.current && Math.hypot(eng.player.x, eng.player.y) > 2.5) {
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
    }, 60);

    return () => {
      clearInterval(syncInterval);
      engine.stop();
    };
  }, [showBoot]);

  const handleSelectSlot = useCallback((slotIdx: number) => {
    setActiveSlot(slotIdx);
    if (engineRef.current) {
      engineRef.current.activeSlot = slotIdx;
    }
  }, []);

  // 使用物品：按类别生效，不再写死槽位
  const handleUseItem = useCallback((slotIdx: number) => {
    const cur = [...hotbarSlotsRef.current];
    const item = cur[slotIdx];
    if (!item || item.count <= 0 || !engineRef.current) return;
    const eng = engineRef.current;

    if (item.category === 'food') {
      const fv = FOOD_VALUE[item.id] ?? { satiety: 35, heal: 0 };
      eng.player.satiety = Math.min(eng.player.maxSatiety, eng.player.satiety + fv.satiety);
      eng.player.stamina = Math.min(eng.player.maxStamina, eng.player.stamina + 20);
      if (fv.heal > 0) eng.player.hp = Math.min(eng.player.maxHp, eng.player.hp + fv.heal);
      soundManager.playUseMedical();
      eng.addTextParticle(eng.player.x, eng.player.y - 1.4, `+${fv.satiety} 饱食${fv.heal > 0 ? ` +${fv.heal}生命` : ''}`, '#fb923c');
      setAteFood(true);
    } else if (item.category === 'medical') {
      const heal = MED_HEAL[item.id] ?? (item.name.includes('绷带') ? 30 : 60);
      eng.player.hp = Math.min(eng.player.maxHp, eng.player.hp + heal);
      if (item.id === 'med_painkiller') eng.player.stamina = Math.min(eng.player.maxStamina, eng.player.stamina + 20);
      soundManager.playUseMedical();
      eng.addTextParticle(eng.player.x, eng.player.y - 1.4, `+${heal} 生命`, '#4ade80');
    } else {
      return;
    }

    item.count -= 1;
    cur[slotIdx] = item.count <= 0 ? null : { ...item };
    setHotbarSlots(cur);
  }, []);

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

  const handleSelectMapZone = useCallback((zoneId: MapZoneId) => {
    setCurrentMapId(zoneId as MapZoneId);
    if (engineRef.current) {
      engineRef.current.warpToMap(zoneId, 0, 0, '战术折跃');
    }
    setActiveModal(null);
  }, []);

  const handleGoHome = useCallback(() => {
    if (!selfId) return;
    const hid = homeMapIdFor(selfId) as MapZoneId;
    setCurrentMapId(hid);
    if (engineRef.current) engineRef.current.warpToMap(hid, 0, 9, '回家·个人营地');
    netManagerRef.current?.goHome(selfId);
  }, [selfId]);

  const handleVisitHome = useCallback((targetId: string, targetName: string) => {
    const hid = homeMapIdFor(targetId) as MapZoneId;
    setCurrentMapId(hid);
    if (engineRef.current) engineRef.current.warpToMap(hid, 0, 9, `突袭·${targetName}的营地`);
    netManagerRef.current?.visitHome(targetId);
    pushSystemMsg(`⚠️ 已潜入 [${targetName}] 的个人营地实例，只能破拆不能建造，祝好运。`);
  }, [pushSystemMsg]);

  // 黑市买入：先扣钱后发货，发货失败（背包满）则不扣钱
  const handleBuyMarketItem = useCallback((item: MarketItem, quantity: number): boolean => {
    const cost = item.buyPrice * quantity;
    if (playerStatsRef.current.credits < cost) return false;
    const eng = engineRef.current;
    let ok = true;
    if (item.id === 'scrap') {
      setPlayerScrap((prev) => prev + 10 * quantity);
    } else if (item.id === 'ammo_box') {
      if (eng) {
        eng.player.reserveAmmo += 60 * quantity;
        eng.addTextParticle(eng.player.x, eng.player.y - 1.2, `+${60 * quantity} 备弹（R装填）`, '#38bdf8');
      }
    } else if (item.id === 'medkit') {
      ok = addItemToHotbar({
        id: 'med_纳米医疗包', name: '纳米医疗包', category: 'medical', icon: '💉',
        count: 1 * quantity, maxCount: 10, desc: '点击使用，恢复60点生命。', rarity: 4,
      });
    } else if (item.id === 'food_ration') {
      ok = addItemToHotbar({
        id: 'food_战术肉排', name: '战术肉排', category: 'food', icon: '🥩',
        count: 10 * quantity, maxCount: 99, desc: '点击食用，恢复35点饱食。', rarity: 2,
      });
    } else if (item.id === 'rift_shard') {
      setPlayerStats((prev) => ({ ...prev, shards: prev.shards + 1 * quantity }));
    } else {
      // 新增通用商品（种子/铜矿/配件/房卡/藏品/手术包/手雷/星果酒）
      const def = (() => { try { return getItemDef(item.id); } catch { return null; } })();
      if (def) {
        if (def.category === 'food' || def.category === 'medical' || def.category === 'material' || def.category === 'tool') {
          ok = addItemToHotbar({ id: def.id, name: def.name, category: def.category === 'material' && (def.id.startsWith('att_') || def.id.startsWith('key_') || def.id.startsWith('collect_') || def.id.startsWith('ore_') || def.id.startsWith('seed_')) ? 'material' : def.category, icon: def.icon, count: def.id.startsWith('seed_') ? 2 * quantity : def.id === 'ore_copper' ? 5 * quantity : def.id === 'throw_frag' ? 2 * quantity : 1 * quantity, maxCount: def.maxCount, desc: def.desc, rarity: def.rarity });
        } else if (def.category === 'weapon' || def.category === 'armor') {
          ok = addItemToHotbar({ id: def.id, name: def.name, category: def.category, icon: def.icon, count: 1, maxCount: 1, desc: def.desc, rarity: def.rarity });
        }
      }
    }
    if (!ok) {
      pushSystemMsg('背包满了，本次购买未扣钱。按 I 整理后再来。');
      return false;
    }
    setPlayerStats((prev) => ({ ...prev, credits: prev.credits - cost }));
    soundManager.playLoot();
    return true;
  }, [addItemToHotbar, pushSystemMsg]);

  // 黑市卖出：必须真有货，扣货加钱
  const handleSellMarketItem = useCallback((item: MarketItem, quantity: number): boolean => {
    const revenue = item.sellPrice * quantity;
    const eng = engineRef.current;
    const deny = (text: string) => {
      pushSystemMsg(text);
      if (eng) eng.addTextParticle(eng.player.x, eng.player.y - 1.4, '货物不足，出售失败', '#f87171');
      soundManager.playClick();
    };
    if (item.id === 'scrap') {
      if (playerScrapRef.current < 10 * quantity) { deny('废铁不足10个，无法出售。'); return false; }
      setPlayerScrap((prev) => Math.max(0, prev - 10 * quantity));
    } else if (item.id === 'ammo_box') {
      if (!eng || eng.player.reserveAmmo < 60 * quantity) { deny('备弹不足60发，无法出售。'); return false; }
      eng.player.reserveAmmo -= 60 * quantity;
    } else if (item.id === 'medkit') {
      const cur = [...hotbarSlotsRef.current];
      const idx = cur.findIndex((s) => s && s.category === 'medical' && s.count > 0);
      if (idx < 0 || !cur[idx]) { deny('没有医疗包可卖。'); return false; }
      const s = cur[idx]!;
      cur[idx] = s.count - 1 <= 0 ? null : { ...s, count: s.count - 1 };
      setHotbarSlots(cur);
    } else if (item.id === 'food_ration') {
      const cur = [...hotbarSlotsRef.current];
      let need = 10 * quantity;
      for (let i = 0; i < cur.length && need > 0; i++) {
        const s = cur[i];
        if (s && s.category === 'food' && s.count > 0) {
          const take = Math.min(need, s.count);
          need -= take;
          cur[i] = s.count - take <= 0 ? null : { ...s, count: s.count - take };
        }
      }
      if (need > 0) { deny('食物不足10份，无法出售。'); return false; }
      setHotbarSlots(cur);
    } else if (item.id === 'rift_shard') {
      if (playerStatsRef.current.shards < 1 * quantity) { deny('没有紫晶可卖。'); return false; }
      setPlayerStats((prev) => ({ ...prev, shards: prev.shards - 1 * quantity }));
    } else {
      const sdef = (() => { try { return getItemDef(item.id); } catch { return null; } })();
      if (sdef) {
        const cur = [...hotbarSlotsRef.current];
        let need = quantity;
        for (let i = 0; i < cur.length && need > 0; i++) {
          const s = cur[i];
          if (s && s.id === item.id && s.count > 0) {
            const take = Math.min(need, s.count);
            need -= take;
            cur[i] = s.count - take <= 0 ? null : { ...s, count: s.count - take };
          }
        }
        if (need > 0) { deny(`没有足够的${sdef.name}可卖。`); return false; }
        setHotbarSlots(cur);
        setPlayerStats((prev) => ({ ...prev, credits: prev.credits + item.sellPrice * quantity }));
        soundManager.playLoot();
        return true;
      }
    }
    setPlayerStats((prev) => ({ ...prev, credits: prev.credits + revenue }));
    soundManager.playLoot();
    return true;
  }, [pushSystemMsg]);

  // 制造结算：按配方真实扣料，成品进背包
  const handleCraftSuccess = useCallback(
    (order: CraftOrder) => {
      const eng = engineRef.current;
      if (!eng) return;

      const grantItem = (item: Item): boolean => addItemToHotbar(item);

      const applyResult = (): boolean => {
        switch (order.id) {
          case 'stone_pickaxe':
            return grantItem({
              id: 'pickaxe_stone',
              name: '开山镐',
              category: 'tool',
              icon: '⛏️',
              count: 1,
              maxCount: 1,
              desc: '采矿专用：采石效率+60%， crystal 通用，近战22伤害。',
            });
          case 'stone_axe':
            return grantItem({
              id: 'axe_stone',
              name: '石斧',
              category: 'tool',
              icon: '🪓',
              count: 1,
              maxCount: 1,
              desc: '伐木专用：砍树效率+60%，近战22伤害。',
            });
          case 'rod_basic':
            return grantItem({
              id: 'rod_basic',
              name: '简易钓竿',
              category: 'tool',
              icon: '🎣',
              count: 1,
              maxCount: 1,
              desc: '钓鱼专用：一次钓两条。',
            });
          case 'crude_gun':
            return grantItem({
              id: 'crude_gun',
              name: '土铳',
              category: 'weapon',
              icon: '🔫',
              count: 1,
              maxCount: 1,
              desc: '单发55伤害，装填步枪弹药（R）。',
            });
          case 'bandage':
            return grantItem(makeItem('med_bandage', 2));
          case 'dried_fish':
            return grantItem({
              id: 'food_烤肉干',
              name: '烤肉干',
              category: 'food',
              icon: '🍖',
              count: 2,
              maxCount: 99,
              desc: '点击食用，恢复35点饱食。',
            });
          case 'ammo_pack':
            eng.player.reserveAmmo += 30;
            eng.addTextParticle(eng.player.x, eng.player.y - 1.2, '+30 步枪弹药（按R装填）', '#38bdf8');
            return true;
          case 'nano_medkit':
            return grantItem({
              id: 'med_纳米医疗包',
              name: '纳米医疗包',
              category: 'medical',
              icon: '💉',
              count: 1,
              maxCount: 10,
              desc: '点击使用，恢复60点生命。',
            });
          case 'armor_plate':
            return grantItem({
              id: 'armor_vest',
              name: '军用防弹背心',
              category: 'armor',
              icon: '🦺',
              count: 1,
              maxCount: 1,
              desc: '护盾上限+50，受伤减免15%。',
            });
          case 'cloth_armor':
            return grantItem({
              id: 'armor_cloth',
              name: '粗布护甲',
              category: 'armor',
              icon: '🧥',
              count: 1,
              maxCount: 1,
              desc: '护盾上限+25。',
            });
          case 'pack_canvas':
            return grantItem({
              id: 'pack_canvas',
              name: '帆布背包',
              category: 'pack',
              icon: '🎒',
              count: 1,
              maxCount: 1,
              desc: '背包格 +2。',
            });
          case 'pack_tactical':
            return grantItem({
              id: 'pack_tactical',
              name: '战术携行具',
              category: 'pack',
              icon: '🧳',
              count: 1,
              maxCount: 1,
              desc: '背包格 +4。',
            });
          case 'grow_parsnip':
            return grantItem(makeItem('crop_parsnip', 4));
          case 'grow_potato':
            return grantItem(makeItem('crop_potato', 4));
          case 'grow_corn':
            return grantItem(makeItem('crop_corn', 4));
          case 'grow_pumpkin':
            return grantItem(makeItem('crop_pumpkin', 3));
          case 'grow_starfruit':
            return grantItem(makeItem('crop_starfruit', 2));
          case 'jam_pot':
            return grantItem(makeItem('jam_berry', 2));
          case 'cook_pot':
            return grantItem(makeItem('cook_fishsoup', 2));
          case 'copper_pickaxe':
            return grantItem({ id: 'pickaxe_copper', name: '铜镐', category: 'tool', icon: '⛏️', count: 1, maxCount: 1, desc: '采矿效率+120%，采石专用。', rarity: 3 });
          case 'surgery_craft':
            return grantItem(makeItem('med_surgery', 1));
          case 'star_wine':
            return grantItem(makeItem('wine_starfruit', 1));
          case 'gun_upgrade_m4':
            return grantItem(makeItem('wp_m4a1', 1));
          case 'pickle_pot':
            return grantItem(makeItem('pickle_veg', 2));
          case 'cheese_press':
            return grantItem(makeItem('cheese_goat', 1));
          case 'stirfry_pan':
            return grantItem(makeItem('cook_stirfry', 2));
          case 'energy_mix':
            return grantItem(makeItem('cook_energybar', 2));
          case 'ammo_reload':
            eng.player.reserveAmmo += 30;
            eng.addTextParticle(eng.player.x, eng.player.y - 1.2, '+30 复装弹药（按R装填）', '#38bdf8');
            return true;
          default:
            return true;
        }
      };

      if (!applyResult()) return; // 背包满：不扣料
      if (order.cost.wood > 0) setPlayerWood((prev) => Math.max(0, prev - order.cost.wood));
      if (order.cost.stone > 0) setPlayerStone((prev) => Math.max(0, prev - order.cost.stone));
      if (order.cost.scrap > 0) setPlayerScrap((prev) => Math.max(0, prev - order.cost.scrap));
      if (order.cost.parts > 0) setPlayerParts((prev) => Math.max(0, prev - order.cost.parts));
      for (const e of order.cost.extra ?? []) {
        setHotbarSlots((prev) => {
          const next = [...prev];
          let need = e.count;
          for (let i = 0; i < next.length && need > 0; i++) {
            const s = next[i];
            if (s && s.id === e.itemId) {
              const take = Math.min(s.count, need);
              need -= take;
              const left = s.count - take;
              next[i] = left <= 0 ? null : { ...s, count: left };
            }
          }
          return next;
        });
      }
      if (order.id === 'stone_pickaxe') setPickaxeCrafted(true);
      grantXp(30);
      soundManager.playCraft();
      eng.addTextParticle(
        eng.player.x,
        eng.player.y - 1.2,
        '制造完成！',
        '#38bdf8'
      );
    },
    [addItemToHotbar, grantXp]
  );

  const handleExecuteRaid = useCallback((supplyId: string, supplyName: string) => {
    if (!raidDoor) return;
    // 突袭消耗1个破拆物（C4/铝热剂共用背包里的C4；没有则本次免单，提示去搜）
    const cur = [...hotbarSlotsRef.current];
    const c4Idx = cur.findIndex((s) => s && (s.id === 'c4_explosive' || s.id === 'thermite_charge'));
    if (c4Idx >= 0 && cur[c4Idx]) {
      const c = cur[c4Idx]!;
      c.count -= 1;
      cur[c4Idx] = c.count <= 0 ? null : { ...c };
      setHotbarSlots(cur);
    } else if (engineRef.current) {
      engineRef.current.addTextParticle(
        engineRef.current.player.x, engineRef.current.player.y - 1.5,
        '破拆物不足！去搜弹药箱/采石炸药库', '#f87171'
      );
    }
    if (netManagerRef.current && netManagerRef.current.isConnected) {
      netManagerRef.current.attemptRaid(raidDoor.id, supplyId, supplyName);
    } else {
      // Local calculation fallback if server is reconnecting
      const dmg = 850;
      const isCrit = Math.random() < 0.3;
      const actualDmg = isCrit ? dmg * 2 : dmg;
      if (engineRef.current) {
        raidDoor.hp = Math.max(0, raidDoor.hp - actualDmg);
        if (raidDoor.hp <= 0) {
          raidDoor.isOpen = true;
          raidDoor.isLocked = false;
        }
        engineRef.current.addTextParticle(
          raidDoor.x,
          raidDoor.y - 1.2,
          `-${actualDmg}! ${isCrit ? '暴击破拆!' : ''}`,
          isCrit ? '#facc15' : '#f87171'
        );
      }
      setRaidDoor({ ...raidDoor });
    }
  }, [raidDoor]);

  const handleClaimRaidLoot = useCallback((spoils: { name: string; count: number; icon: string }[]) => {
    setPlayerStats((prev) => ({
      ...prev,
      credits: prev.credits + 2500,
      shards: prev.shards + 18,
      xp: prev.xp + 500,
    }));
    setHotbarSlots((prev) =>
      prev.map((slot, idx) => {
        if (idx === 5 && slot) {
          return { ...slot, count: slot.count + 80 };
        }
        return slot;
      })
    );
    if (engineRef.current) {
      engineRef.current.player.reserveAmmo += 120;
      engineRef.current.addTextParticle(
        engineRef.current.player.x,
        engineRef.current.player.y - 1.5,
        '🎉 成功掠夺大量战利品与晶石！',
        '#10b981'
      );
    }
    soundManager.playLoot();
    setTimeout(() => {
      setRaidDoor(null);
    }, 1200);
  }, []);

  const handleResetGame = useCallback(() => {
    if (engineRef.current) {
      engineRef.current.player.x = 0;
      engineRef.current.player.y = 0;
      engineRef.current.player.hp = engineRef.current.player.maxHp;
      engineRef.current.player.shield = engineRef.current.player.maxShield;
    }
    setActiveModal(null);
  }, []);

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

  // 三幕18步：Act1新手8 + Act2领地6 + Act3领主4
  const questRewardText = (id: string): string | undefined => {
    const r = ALL_QUESTS.find((q) => q.id === id)?.reward;
    if (!r) return undefined;
    return `+${r.xp}经验${r.credits > 0 ? ` +${r.credits}币` : ''}`;
  };
  const questSteps: QuestStep[] = [
    {
      id: 'move',
      title: '走出第一步',
      desc: 'WASD/方向键或右键点地移动，离开出生点。',
      progressText: movedFar ? '1/1' : '0/1',
      done: movedFar,
      rewardText: questRewardText('move'),
    },
    {
      id: 'wood',
      title: '野外伐木 ×10',
      desc: '去黑松伐木场/商业街枯树/渔港白杨按 E 砍伐（营地不产物资，每棵树有采集上限）。',
      progressText: `${Math.min(totalWood, 10)}/10`,
      done: totalWood >= 10,
      rewardText: questRewardText('wood'),
    },
    {
      id: 'stone',
      title: '野外采石 ×10',
      desc: '去北岭采石场/渔港滩涂岩按 E 开采（节点采空要等恢复）。',
      progressText: `${Math.min(totalStone, 10)}/10`,
      done: totalStone >= 10,
      rewardText: questRewardText('stone'),
    },
    {
      id: 'scrap',
      title: '搜刮废铁 ×10',
      desc: '去加油站/商业街拆事故车/翻货架，工作台和枪都靠它。',
      progressText: `${Math.min(totalScrap, 10)}/10`,
      done: totalScrap >= 10,
      rewardText: questRewardText('scrap'),
    },
    {
      id: 'workbench',
      title: '建造工作台',
      desc: '[B]进入建造→设施→工作台（8废铁+1零件），放下去。',
      progressText: workbenchBuilt ? '1/1' : '0/1',
      done: workbenchBuilt,
      rewardText: questRewardText('workbench'),
    },
    {
      id: 'pickaxe',
      title: '制造开山镐',
      desc: '靠近工作台按 F：8木+6石，采石效率+60%（砍树要另做石斧）。',
      progressText: pickaxeCrafted ? '1/1' : '0/1',
      done: pickaxeCrafted,
      rewardText: questRewardText('pickaxe'),
    },
    {
      id: 'eat',
      title: '吃一顿好的',
      desc: '钓鱼/烤肉干，点击快捷栏进食回饱食。饿到0会掉血！',
      progressText: ateFood ? '1/1' : '0/1',
      done: ateFood,
      rewardText: questRewardText('eat'),
    },
    {
      id: 'kill',
      title: '首杀蚀体',
      desc: '做把土铳+弹药，去公路/密林外围猎杀1只。死了会被救回营地，物品保留。',
      progressText: `${Math.min(killCount, 1)}/1`,
      done: killCount >= 1,
      rewardText: questRewardText('kill'),
    },
    {
      id: 'claim',
      title: '圈一块野外地',
      desc: '点“回家”进入你的 home_ 独立营地（从零开始，只有一座残核），站上去即认领。',
      progressText: claimedPlot ? '1/1' : '0/1',
      done: claimedPlot,
    },
    {
      id: 'safedoor',
      title: '立起防爆安全门',
      desc: '在自家营地内[B]建造→安全门（10石+20废铁+4零件），访客只能破拆。',
      progressText: safeDoorBuilt ? '1/1' : '0/1',
      done: safeDoorBuilt,
    },
    {
      id: 'rifle',
      title: '造出战术步枪',
      desc: '工作台+搜刮攒出步枪（rifle），土铳不算毕业。',
      progressText: rifleOwned ? '1/1' : '0/1',
      done: rifleOwned,
    },
    {
      id: 'raid_npc',
      title: '首次突袭NPC据点',
      desc: '带C4对废墟/深林NPC安全门造成任意伤害。',
      progressText: raidHit ? '1/1' : '0/1',
      done: raidHit,
    },
    {
      id: 'elite',
      title: '猎杀精英蚀体',
      desc: '击杀1只≥550HP精英（恶瘴魑/巨熊/工厂精英）。',
      progressText: eliteKilled ? '1/1' : '0/1',
      done: eliteKilled,
    },
    {
      id: 'turret',
      title: '架起防御塔',
      desc: '[B]建造→电击塔（15废铁+2零件）。',
      progressText: turretBuilt ? '1/1' : '0/1',
      done: turretBuilt,
    },
    {
      id: 'boss1',
      title: '直面深渊霸主',
      desc: '去裂隙前线击杀深渊霸主（1600HP），组队更稳。',
      progressText: bossKilled ? '1/1' : '0/1',
      done: bossKilled,
    },
    {
      id: 'darkcore',
      title: '带回暗物质晶核',
      desc: '开深渊箱/破门缴获，晶石≥12。',
      progressText: darkCoreGot ? '1/1' : '0/1',
      done: darkCoreGot,
    },
    {
      id: 'level10',
      title: '成长为Lv.10行者',
      desc: '野外练级+交任务升到10级。',
      progressText: `Lv.${playerStats.level}/10`,
      done: playerStats.level >= 10,
    },
    {
      id: 'fortress',
      title: '要塞守住一夜',
      desc: '自家营地内同时拥有安全门+防御塔+精英击杀，即毕业。',
      progressText: safeDoorBuilt && turretBuilt && eliteKilled ? '1/1' : '0/1',
      done: safeDoorBuilt && turretBuilt && eliteKilled,
    },
  ];

  // 任务完成自动发奖（xp/币以 quests.ts QuestDef.reward 为准，道具/称号为额外添头）
  useEffect(() => {
    const questRewardOf = (id: string) => ALL_QUESTS.find((q) => q.id === id)?.reward;
    const grantQuestReward = (id: string) => {
      const r = questRewardOf(id);
      if (!r) return;
      grantXp(r.xp);
      if (r.credits > 0) setPlayerStats((p) => ({ ...p, credits: p.credits + r.credits }));
    };
    const rewards: Record<string, () => void> = {
      move: () => grantQuestReward('move'),
      wood: () => grantQuestReward('wood'),
      stone: () => grantQuestReward('stone'),
      scrap: () => {
        grantQuestReward('scrap');
        addItemToHotbar({
          id: 'med_亚麻绷带', name: '亚麻绷带', category: 'medical', icon: '🩹',
          count: 1, maxCount: 10, desc: '点击使用，恢复30点生命。',
        });
      },
      workbench: () => {
        grantQuestReward('workbench');
        addItemToHotbar({
          id: 'food_烤肉干', name: '烤肉干', category: 'food', icon: '🍖',
          count: 2, maxCount: 99, desc: '点击食用，恢复35点饱食。',
        });
      },
      pickaxe: () => grantQuestReward('pickaxe'),
      eat: () => grantQuestReward('eat'),
      kill: () => {
        grantQuestReward('kill');
        addItemToHotbar({
          id: 'med_纳米医疗包', name: '纳米医疗包', category: 'medical', icon: '💉',
          count: 1, maxCount: 10, desc: '点击使用，恢复60点生命。',
        });
        setPlayerStats((p) => (p.title === '废土流浪者' ? { ...p, title: '见习拾荒者' } : p));
      },
      claim: () => grantXp(60),
      safedoor: () => { grantXp(120); setPlayerStats((p) => ({ ...p, credits: p.credits + 200 })); },
      rifle: () => grantXp(120),
      raid_npc: () => { grantXp(150); setPlayerStats((p) => ({ ...p, shards: p.shards + 3 })); },
      elite: () => { grantXp(200); setPlayerStats((p) => ({ ...p, credits: p.credits + 300 })); },
      turret: () => grantXp(120),
      boss1: () => { grantXp(500); setPlayerStats((p) => ({ ...p, credits: p.credits + 1000, shards: p.shards + 6 })); },
      darkcore: () => grantXp(300),
      level10: () => { grantXp(300); setPlayerStats((p) => ({ ...p, title: '裂隙行者' })); },
      fortress: () => { grantXp(500); pushSystemMsg('🎓 三幕毕业！你是真正的裂隙领主，深渊裂口等你常驻。'); },
    };
    for (const step of questSteps) {
      if (step.done && !grantedQuestsRef.current.has(step.id)) {
        grantedQuestsRef.current.add(step.id);
        rewards[step.id]?.();
        soundManager.playLoot();
        if (engineRef.current) {
          engineRef.current.addTextParticle(
            engineRef.current.player.x,
            engineRef.current.player.y - 1.8,
            `✓ 引路完成：${step.title}`,
            '#4ade80'
          );
        }
        pushSystemMsg(`✓ 新手引路完成：${step.title}，奖励已发放！`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movedFar, totalWood, totalStone, totalScrap, workbenchBuilt, pickaxeCrafted, ateFood, killCount, safeDoorBuilt, turretBuilt, rifleOwned, raidHit, eliteKilled, bossKilled, darkCoreGot, claimedPlot, playerStats.level]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 2.5D Isometric Canvas Engine */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-crosshair" />

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
      <div hidden={showBoot}>
      {/* Top Menu Bar with Weather Widget, Online Ping & Roster Button */}
      <TopMenuBar
        onOpenModal={(modal) => setActiveModal(modal)}
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

        {/* Building Bar Toggle & Structure Selection */}
        <BuildingBar
          isBuildMode={isBuildMode}
          selectedType={selectedBuildType}
          onSelectType={handleSelectBuildType}
          onToggleBuildMode={handleToggleBuildMode}
          playerScrap={playerScrap}
          playerParts={playerParts}
        />

        {/* 6-Slot Hotbar */}
        <Hotbar
          slots={hotbarSlots}
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
        hasExtra={(itemId, count) => {
          let have = 0;
          for (const s of hotbarSlotsRef.current) if (s && s.id === itemId) have += s.count;
          if (itemId === 'water') have += 999; // 水感：水井/餐馆易得，首版免校验只收废铁木料，防卡死
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
        hasReward={true}
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
        target={lootPanel}
        onTake={handleTakeLoot}
        onTakeAll={handleTakeAllLoot}
        onClose={() => setLootPanel(null)}
      />

      <SettingsModal
        isOpen={activeModal === 'settings'}
        onClose={() => setActiveModal(null)}
        onResetGame={handleResetGame}
        isGM={isGM}
        onGMLogin={handleGMLogin}
        onGMLogout={handleGMLogout}
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
