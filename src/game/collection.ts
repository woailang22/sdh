export type CollectTier = 'memorial' | 'fine' | 'heirloom' | 'mythic';

export interface CollectDef {
  id: string;
  name: string;
  icon: string;
  tier: CollectTier;
  sellPrice: number;
  source: string;
}

export const COLLECT_DEFS: Record<string, CollectDef> = {
  collect_circuit: { id: 'collect_circuit', name: '军用电路板', icon: '💾', tier: 'memorial', sellPrice: 280, source: '无人机堆/汽修铺/工厂配件架掉落，纪念级入门藏品' },
  collect_watch: { id: 'collect_watch', name: '金表', icon: '⌚', tier: 'fine', sellPrice: 340, source: '居民区地下室/餐馆里间掉落，精品级' },
  collect_dogtag: { id: 'collect_dogtag', name: '阵亡者身份牌', icon: '🎖️', tier: 'fine', sellPrice: 380, source: '精英怪/佣兵前哨掉落，精品级' },
  collect_mandel: { id: 'collect_mandel', name: '曼德尔砖', icon: '🧱', tier: 'heirloom', sellPrice: 1500, source: '红房（工厂核心实验室，持红色房卡开启）限定，传家级' },
  key_red: { id: 'key_red', name: '红色房卡', icon: '🟥', tier: 'heirloom', sellPrice: 900, source: '掠夺者前哨/深渊宝箱掉落，传家级钥匙' },
  key_blue: { id: 'key_blue', name: '蓝色房卡', icon: '🟦', tier: 'fine', sellPrice: 450, source: '居民区地下室/加油站办公室掉落' },
  fish_legend: { id: 'fish_legend', name: '传说之鱼', icon: '👑', tier: 'mythic', sellPrice: 2000, source: '翠湖深水+荧光苔，全图唯一，神话级' },
};

export const TIER_COLOR: Record<CollectTier, string> = {
  memorial: '#94a3b8', fine: '#38bdf8', heirloom: '#c084fc', mythic: '#fbbf24',
};

export interface CollectSet {
  id: string;
  name: string;
  members: string[];
  bonusCredits: number;
  title?: string;
}

export const COLLECT_SETS: Record<string, CollectSet> = {
  decent: { id: 'decent', name: '废土体面人', members: ['collect_watch', 'collect_circuit'], bonusCredits: 500 },
  pioneer: { id: 'pioneer', name: '先锋遗落', members: ['collect_dogtag', 'key_blue'], bonusCredits: 1200 },
  mandel: { id: 'mandel', name: '曼德尔传奇', members: ['collect_mandel', 'key_red', 'fish_legend'], bonusCredits: 3000, title: '曼德尔收藏家' },
};

export function collectTierOf(id: string): CollectTier {
  const d = COLLECT_DEFS[id];
  if (!d) throw new Error(`unknown collect: ${id}`);
  return d.tier;
}

export function setProgress(setId: string, owned: Set<string>): { owned: number; total: number } {
  const s = COLLECT_SETS[setId];
  if (!s) throw new Error(`unknown set: ${setId}`);
  const need = new Map<string, number>();
  for (const m of s.members) need.set(m, (need.get(m) ?? 0) + 1);
  const have = new Map<string, number>();
  for (const o of owned) have.set(o, (have.get(o) ?? 0) + 1);
  let done = 0;
  for (const [id, n] of need) done += Math.min(n, have.get(id) ?? 0);
  return { owned: done, total: s.members.length };
}

export function setBonusCredits(setId: string, owned: Set<string>): number {
  const s = COLLECT_SETS[setId];
  if (!s) throw new Error(`unknown set: ${setId}`);
  return setProgress(setId, owned).owned >= s.members.length ? s.bonusCredits : 0;
}
