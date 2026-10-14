import React, { useState } from 'react';
import { X, Wrench, Hammer, ShieldCheck } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

export interface CraftCost {
  wood: number;
  stone: number;
  scrap: number;
  parts: number;
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
];

function costText(cost: CraftCost): string {
  const parts: string[] = [];
  if (cost.wood > 0) parts.push(`原木x${cost.wood}`);
  if (cost.stone > 0) parts.push(`条石x${cost.stone}`);
  if (cost.scrap > 0) parts.push(`废铁x${cost.scrap}`);
  if (cost.parts > 0) parts.push(`零件x${cost.parts}`);
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
}) => {
  const [craftingId, setCraftingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const canAfford = (cost: CraftCost) =>
    playerWood >= cost.wood &&
    playerStone >= cost.stone &&
    playerScrap >= cost.scrap &&
    playerParts >= cost.parts;

  const handleStartCraft = (recipe: Recipe) => {
    if (!canAfford(recipe.cost) || craftingId) return;

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
            const affordable = canAfford(r.cost);
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
