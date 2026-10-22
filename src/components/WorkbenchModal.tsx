import React, { useState } from 'react';
import { X, Wrench, Hammer, ShieldCheck } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import { getItemDef } from '../game/items';
import { recipeFacility } from '../game/crafting';

import { CRAFT_RECIPES as RECIPES, type Recipe, type CraftCost, type CraftOrder } from '../game/crafting';
export type { CraftCost, CraftOrder } from '../game/crafting';

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
              <p className="text-xs text-slate-400">工具可随身制作；进阶制造需靠近工作台。种植与加工请使用营地设施。</p>
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
          {RECIPES.filter(r => !recipeFacility(r)).map((r) => {
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
            制造消耗配方材料，成品进入背包；结果以服务器确认为准
          </span>
          <span className="font-mono text-cyan-400">自建工作台 [B]建造→设施</span>
        </div>
      </div>
    </div>
  );
};
