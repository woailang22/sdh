export interface QuestReward {
  xp: number;
  credits: number;
  itemId?: string;
  count?: number;
}

export interface QuestDef {
  id: string;
  act: 1 | 2 | 3;
  title: string;
  desc: string;
  hint: string;
  reward: QuestReward;
}

/** 第一幕：沿用 App 现有8步，一字不改（保证存量兼容） */
export const ACT1_QUESTS: QuestDef[] = [
  { id: 'move', act: 1, title: '走出第一步', desc: 'WASD/方向键或右键点地移动，离开出生点。', hint: '离开出生点2.5格', reward: { xp: 10, credits: 20 } },
  { id: 'wood', act: 1, title: '野外伐木 ×10', desc: '去黑松伐木场/商业街枯树/渔港白杨按 E 砍伐。', hint: '累计10木', reward: { xp: 20, credits: 30 } },
  { id: 'stone', act: 1, title: '野外采石 ×10', desc: '去北岭采石场/渔港滩涂岩按 E 开采。', hint: '累计10石', reward: { xp: 20, credits: 30 } },
  { id: 'scrap', act: 1, title: '搜刮废铁 ×10', desc: '去加油站/商业街拆事故车/翻货架。', hint: '累计10废铁', reward: { xp: 20, credits: 30 } },
  { id: 'workbench', act: 1, title: '建造工作台', desc: '[B]进入建造→设施→工作台，放下去。', hint: '放下工作台', reward: { xp: 40, credits: 80 } },
  { id: 'pickaxe', act: 1, title: '制造开山镐', desc: '靠近工作台按 F：8木+6石。', hint: '做出开山镐', reward: { xp: 40, credits: 50, itemId: 'pickaxe', count: 1 } },
  { id: 'eat', act: 1, title: '吃一顿好的', desc: '钓鱼/烤肉干，点击快捷栏进食。', hint: '进食1次', reward: { xp: 15, credits: 20 } },
  { id: 'kill', act: 1, title: '首杀蚀体', desc: '做把土铳+弹药，猎杀1只。', hint: '击杀1', reward: { xp: 50, credits: 100 } },
];

/** 第二幕：领地（解决“共用基地”：必须去野外自建自守） */
export const ACT2_QUESTS: QuestDef[] = [
  { id: 'claim', act: 2, title: '圈一块野外地', desc: '去任务指引的8大地块任选一块，打开建造模式站上去。', hint: '到达任意BASE_PLOTS 3格内', reward: { xp: 60, credits: 0 } },
  { id: 'safedoor', act: 2, title: '立起防爆安全门', desc: '建造→防爆安全门（10石+20废铁+4零件），你的基地从此可被突袭也可防守。', hint: '放置safe_door 1扇', reward: { xp: 120, credits: 200 } },
  { id: 'rifle', act: 2, title: '造出战术步枪', desc: '工作台制造土铳→搜刮/交易攒出步枪，野外才有话语权。', hint: '获得rifle', reward: { xp: 120, credits: 0 } },
  { id: 'raid_npc', act: 2, title: '首次突袭NPC据点', desc: '带C4去废墟居民区/黑松深林，对NPC安全门造成任意伤害。', hint: 'raid_attempt 1次', reward: { xp: 150, credits: 0 } },
  { id: 'elite', act: 2, title: '猎杀精英蚀体', desc: '击杀1只 maxHp≥550 的精英（恶瘴魑/巨熊）。', hint: '精英击杀1', reward: { xp: 200, credits: 300 } },
  { id: 'turret', act: 2, title: '架起防御塔', desc: '建造→电击塔（15废铁+2零件），基地首次拥有自动火力。', hint: '放置turret 1座', reward: { xp: 120, credits: 0 } },
];

/** 第三幕：裂隙领主（长流程收束，Boss链） */
export const ACT3_QUESTS: QuestDef[] = [
  { id: 'boss1', act: 3, title: '直面深渊霸主', desc: '去裂隙前线击杀深渊霸主·恶瘴巨兽（1600HP）。', hint: '击杀领主BOSS', reward: { xp: 500, credits: 1000 } },
  { id: 'darkcore', act: 3, title: '带回暗物质晶核', desc: '开启遗落先锋宝箱或破门缴获，获得12暗物质晶核。', hint: 'dark_core×12', reward: { xp: 300, credits: 0 } },
  { id: 'level10', act: 3, title: '成长为Lv.10行者', desc: '野外练级+交任务，升到10级（+90生命/+45护盾）。', hint: 'Lv≥10', reward: { xp: 300, credits: 0 } },
  { id: 'fortress', act: 3, title: '要塞守住一夜', desc: '基地拥有安全门+4墙+1塔且HP全满，即毕业。', hint: '基地完整度100%', reward: { xp: 500, credits: 0 } },
];

export const ALL_QUESTS: QuestDef[] = [...ACT1_QUESTS, ...ACT2_QUESTS, ...ACT3_QUESTS];

export function questDoneCount(done: Set<string>): number {
  let n = 0;
  for (const q of ALL_QUESTS) if (done.has(q.id)) n++;
  return n;
}

export function nextQuestId(done: Set<string>): string | null {
  for (const q of ALL_QUESTS) if (!done.has(q.id)) return q.id;
  return null;
}
