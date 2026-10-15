import React, { useState } from 'react';
import { X, Wrench, Hammer, ShieldCheck } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import { getItemDef } from '../game/items';

export interface CraftCost {
  wood: number;
  stone: number;
  scrap: number;
  parts: number;
  extra?: { itemId: string; count: number }[];
}

export interface CraftOrder {
  id: string;
  cost: CraftCost;
}

interface WorkbenchModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerWood: number;
  playerStone: number;
  playerScrap: number;
  playerParts: number;
  onCraftSuccess: (order: CraftOrder) => void;
  hasExtra?: (itemId: string, count: number) => boolean;
}

interface Recipe {
  id: string;
  name: string;
  resultName: string;
  icon: string;
  category: string;
  desc: string;
  cost: CraftCost;
}

const RECIPES: Recipe[] = [
  {
    id: 'stone_pickaxe',
    name: '开山镐',
    resultName: '开山镐',
    icon: '⛏️',
    category: '工具打造',
    desc: '采矿专用！采石效率+60%，砍树无加成。先做镐再做斧。',
    cost: { wood: 8, stone: 6, scrap: 0, parts: 0 },
  },
  {
    id: 'stone_axe',
    name: '石斧',
    resultName: '石斧',
    icon: '🪓',
    category: '工具打造',
    desc: '伐木专用！砍树效率+60%，采矿无加成。',
    cost: { wood: 10, stone: 4, scrap: 0, parts: 0 },
  },
  {
    id: 'rod_basic',
    name: '简易钓竿',
    resultName: '简易钓竿',
    icon: '🎣',
    category: '工具打造',
    desc: '钓鱼专用！一次钓两条，饱食无忧。',
    cost: { wood: 8, stone: 0, scrap: 4, parts: 0 },
  },
  {
    id: 'crude_gun',
    name: '土铳（粗制火枪）',
    resultName: '土铳',
    icon: '🔫',
    category: '武器打造',
    desc: '第一把枪！装填步枪弹药，单发55伤害。先有它再谈打怪。',
    cost: { wood: 12, stone: 0, scrap: 10, parts: 1 },
  },
  {
    id: 'bandage',
    name: '亚麻绷带 ×2',
    resultName: '亚麻绷带',
    icon: '🩹',
    category: '医疗合成',
    desc: '每个恢复30点生命，穷人的救命稻草。',
    cost: { wood: 0, stone: 0, scrap: 6, parts: 0 },
  },
  {
    id: 'dried_fish',
    name: '篝火烤肉干 ×2',
    resultName: '烤肉干',
    icon: '🍖',
    category: '食物加工',
    desc: '每个恢复35点饱食。别等饿到掉血才想起吃饭。',
    cost: { wood: 6, stone: 0, scrap: 0, parts: 0 },
  },
  {
    id: 'ammo_pack',
    name: '步枪弹药 ×30',
    resultName: '步枪弹药',
    icon: '🎯',
    category: '弹药制造',
    desc: '有枪没弹等于烧火棍，记得按 R 装填。',
    cost: { wood: 0, stone: 0, scrap: 15, parts: 1 },
  },
  {
    id: 'nano_medkit',
    name: '纳米医疗包 ×1',
    resultName: '纳米医疗包',
    icon: '💉',
    category: '医疗合成',
    desc: '恢复60点生命，红区攻坚必备。',
    cost: { wood: 0, stone: 0, scrap: 10, parts: 1 },
  },
  {
    id: 'cloth_armor',
    name: '粗布护甲',
    resultName: '粗布护甲',
    icon: '🧥',
    category: '护甲打造',
    desc: '护盾上限+25，废土独行第一件护具，进背包后记得穿上。',
    cost: { wood: 4, stone: 0, scrap: 8, parts: 0 },
  },
  {
    id: 'pack_canvas',
    name: '帆布背包',
    resultName: '帆布背包',
    icon: '🎒',
    category: '背包打造',
    desc: '背包格 +2（共8格）。东西不够装的第一解。',
    cost: { wood: 6, stone: 0, scrap: 12, parts: 0 },
  },
  {
    id: 'pack_tactical',
    name: '战术携行具',
    resultName: '战术携行具',
    icon: '🧳',
    category: '背包打造',
    desc: '背包格 +4（共10格）。搜刮流毕业装。',
    cost: { wood: 0, stone: 0, scrap: 25, parts: 3 },
  },
  {
    id: 'armor_plate',
    name: '军用防弹背心',
    resultName: '军用防弹背心',
    icon: '🦺',
    category: '护甲打造',
    desc: '护盾上限+50，受伤减免15%。穿上它再去红区。',
    cost: { wood: 0, stone: 0, scrap: 20, parts: 2 },
  },
  { id: 'grow_parsnip', name: '种植：防风草 ×4', resultName: '防风草', icon: '🥕', category: '农圩种植', desc: '种子×1农圩种植，工作台浓缩为12秒。', cost: { wood: 2, stone: 0, scrap: 0, parts: 0, extra: [{ itemId: 'seed_parsnip', count: 1 }] } },
  { id: 'grow_potato', name: '种植：土豆 ×4', resultName: '土豆', icon: '🥔', category: '农圩种植', desc: '种子×1，量大管饱。', cost: { wood: 2, stone: 0, scrap: 2, parts: 0, extra: [{ itemId: 'seed_potato', count: 1 }] } },
  { id: 'grow_corn', name: '种植：玉米 ×4', resultName: '玉米', icon: '🌽', category: '农圩种植', desc: '种子×1，鱼汤原料。', cost: { wood: 4, stone: 0, scrap: 2, parts: 0, extra: [{ itemId: 'seed_corn', count: 1 }] } },
  { id: 'grow_pumpkin', name: '种植：南瓜 ×3', resultName: '南瓜', icon: '🎃', category: '农圩种植', desc: '种子×1，腌菜原料。', cost: { wood: 4, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'seed_pumpkin', count: 1 }] } },
  { id: 'grow_starfruit', name: '种植：星果 ×2', resultName: '星果', icon: '🌟', category: '农圩种植', desc: '种子×1，酿酒暴利。', cost: { wood: 6, stone: 0, scrap: 6, parts: 1, extra: [{ itemId: 'seed_starfruit', count: 1 }] } },
  { id: 'jam_pot', name: '蓝莓果酱 ×2', resultName: '蓝莓果酱', icon: '🫙', category: '食物加工', desc: '蓝莓×3→果酱×2，售价翻倍。', cost: { wood: 4, stone: 0, scrap: 6, parts: 0, extra: [{ itemId: 'crop_blueberry', count: 3 }] } },
  { id: 'cook_pot', name: '鱼汤 ×2', resultName: '鱼汤', icon: '🍲', category: '食物加工', desc: '鲈鱼×2+水感废料，恢复60饱食。', cost: { wood: 6, stone: 0, scrap: 4, parts: 0, extra: [{ itemId: 'fish_bass', count: 2 }] } },
  { id: 'copper_pickaxe', name: '铜镐', resultName: '铜镐', icon: '⛏️', category: '工具打造', desc: '铜矿×8，采矿效率+120%。', cost: { wood: 6, stone: 0, scrap: 8, parts: 0, extra: [{ itemId: 'ore_copper', count: 8 }] } },
  { id: 'ammo_reload', name: '复装弹药 ×30', resultName: '复装弹药', icon: '🎯', category: '弹药制造', desc: '废铁×10+零件×1，通用备弹+30。', cost: { wood: 0, stone: 0, scrap: 10, parts: 1 } },
  { id: 'surgery_craft', name: '野战手术包 ×1', resultName: '野战手术包', icon: '💉', category: '医疗合成', desc: '血袋感+零件，恢复100生命。', cost: { wood: 0, stone: 0, scrap: 14, parts: 1, extra: [{ itemId: 'med_bandage', count: 2 }] } },
  { id: 'star_wine', name: '星果酒 ×1', resultName: '星果酒', icon: '🍷', category: '食物加工', desc: '星果×3陈酿，毕业暴利。', cost: { wood: 10, stone: 0, scrap: 8, parts: 1, extra: [{ itemId: 'crop_starfruit', count: 3 }] } },
  { id: 'gun_upgrade_m4', name: '改装：M4A1（耗扩容匣）', resultName: 'M4A1', icon: '🔫', category: '武器打造', desc: 'AKM+扩容弹匣→M4A1（110伤）。', cost: { wood: 0, stone: 0, scrap: 15, parts: 2, extra: [{ itemId: 'att_extmag', count: 1 }] } },
];

function costText(cost: CraftCost): string {
  const parts: string[] = [];
  if (cost.wood > 0) parts.push(`原木x${cost.wood}`);
  if (cost.stone > 0) parts.push(`条石x${cost.stone}`);
  if (cost.scrap > 0) parts.push(`废铁x${cost.scrap}`);
  if (cost.parts > 0) parts.push(`零件x${cost.parts}`);
  for (const e of cost.extra ?? []) {
    try { parts.push(`${getItemDef(e.itemId).name}x${e.count}`); }
    catch { parts.push(`${e.itemId}x${e.count}`); }
  }
  return parts.join(' · ');
}

export const WorkbenchModal: React.FC<WorkbenchModalProps> = ({
  isOpen,
  onClose,
  playerWood,
  playerStone,
  playerScrap,
  playerParts,
  onCraftSuccess,
  hasExtra,
}) => {
  const [craftingId, setCraftingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const hasExtraFn = hasExtra ?? (() => true);
  const canAfford = (cost: CraftCost, hasExtra: (itemId: string, count: number) => boolean) =>
    playerWood >= cost.wood &&
    playerStone >= cost.stone &&
    playerScrap >= cost.scrap &&
    playerParts >= cost.parts &&
    (cost.extra ?? []).every((e) => hasExtra(e.itemId, e.count));

  const handleStartCraft = (recipe: Recipe) => {
    if (!canAfford(recipe.cost, hasExtraFn) || craftingId) return;

    setCraftingId(recipe.id);
    soundManager.playCraft();

    setTimeout(() => {
      setCraftingId(null);
      soundManager.playLoot();
      onCraftSuccess({ id: recipe.id, cost: recipe.cost });
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-cyan-500/50 shadow-[0_0_40px_rgba(6,182,212,0.3)] overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-cyan-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                求生工作台 <span className="text-xs font-mono text-cyan-400 font-normal">从零开始</span>
              </h2>
              <p className="text-xs text-slate-400">先做镐，再做枪——徒手在废土活不过三天</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-slate-800 text-xs font-mono">
              <span className="text-slate-400">🪵</span>
              <span className="text-amber-300 font-bold">{playerWood}</span>
              <span className="text-slate-400">🪨</span>
              <span className="text-slate-200 font-bold">{playerStone}</span>
              <span className="text-slate-400">⚙️</span>
              <span className="text-cyan-400 font-bold">{playerScrap}</span>
              <span className="text-slate-400">🔧</span>
              <span className="text-amber-400 font-bold">{playerParts}</span>
            </div>
            <button
              onClick={() => { soundManager.playClick(); onClose(); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Recipe List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {RECIPES.map((r) => {
            const affordable = canAfford(r.cost, hasExtraFn);
            const isCrafting = craftingId === r.id;

            return (
              <div
                key={r.id}
                className="flex items-center justify-between p-4 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-cyan-500/40 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-cyan-500/30 flex items-center justify-center text-2xl shrink-0">
                    {r.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100 truncate">{r.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
                        {r.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{r.desc}</p>
                    <div className="mt-1.5 text-xs font-mono text-amber-300/90">
                      {costText(r.cost)}
                    </div>
                  </div>
                </div>

                <div className="shrink-0 ml-4">
                  <button
                    onClick={() => handleStartCraft(r)}
                    disabled={!affordable || isCrafting || craftingId !== null}
                    className={`px-4 py-2 rounded-lg font-bold text-xs font-mono transition-all flex items-center gap-2 ${
                      isCrafting
                        ? 'bg-amber-600 text-white animate-pulse'
                        : affordable && craftingId === null
                        ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Hammer className="w-3.5 h-3.5" />
                    <span>{isCrafting ? '打造中...' : '开始制造'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Info */}
        <div className="px-6 py-3 bg-slate-950/90 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-cyan-400" />
            制造品直接进快捷背包，每次制造获得经验
          </span>
          <span className="font-mono text-cyan-400">自建工作台 [B]建造→设施</span>
        </div>
      </div>
    </div>
  );
};
