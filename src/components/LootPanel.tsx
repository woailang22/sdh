import React from 'react';
import { X, PackageOpen, Hand, PackageCheck } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import { RARITY, RARITY_COLOR, ITEM_ICON } from '../game/maps';
import { ItemIcon } from './ItemIcon';
import { RarityFrame } from './RarityFrame';
import { COLLECT_DEFS } from '../game/collection';

export interface LootEntry {
  itemId: string;
  name: string;
  count: number;
  taken: boolean;
}

interface LootPanelProps {
  target: { id: string; name: string; items: LootEntry[] } | null;
  onTake: (itemId: string) => void;
  onTakeAll: () => void;
  onClose: () => void;
}

export const LootPanel: React.FC<LootPanelProps> = ({ target, onTake, onTakeAll, onClose }) => {
  if (!target) return null;

  const remaining = target.items.filter((i) => !i.taken);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4 select-none pointer-events-none">
      <div className="pointer-events-auto relative w-full max-w-sm rounded-2xl bg-slate-900 border border-emerald-500/50 shadow-[0_0_40px_rgba(16,185,129,0.25)] overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/80 border-b border-emerald-500/30">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <PackageOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">🔍 {target.name}</h2>
              <p className="text-[10px] text-slate-400">背包6格有限，挑值钱的拿（金＞紫＞蓝＞绿＞白）</p>
            </div>
          </div>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {target.items.map((it) => {
            const r = RARITY[it.itemId] ?? 1;
            const color = RARITY_COLOR[r] ?? '#94a3b8';
            const isMythic = !!COLLECT_DEFS[it.itemId] && (COLLECT_DEFS[it.itemId].tier === 'mythic' || COLLECT_DEFS[it.itemId].tier === 'heirloom');
            return (
              <div
                key={it.itemId}
                className={`flex items-center gap-2.5 p-2 rounded-xl bg-slate-950/60 border transition-all${isMythic ? ' ring-2 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.5)]' : ''}`}
                style={{ borderColor: it.taken ? '#1e293b' : color + '66', opacity: it.taken ? 0.45 : 1 }}
              >
                <div
                  className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-2xl shrink-0 border"
                  style={{ borderColor: color + '88' }}
                >
                  <RarityFrame rarity={r} size={36}>
                    <ItemIcon id={it.itemId} emoji={ITEM_ICON[it.itemId] ?? '📦'} size={24} />
                  </RarityFrame>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-100 truncate">{it.name} ×{it.count}</span>
                    {r >= 4 && <span className="text-[10px] text-amber-300">★高价值</span>}
                  </div>
                  <div className="text-[10px] font-mono" style={{ color }}>
                    {['普通', '优秀', '稀有', '史诗', '传说'][r - 1]}
                  </div>
                </div>
                {it.taken ? (
                  <span className="text-[11px] text-slate-500 font-bold shrink-0">已拿走</span>
                ) : (
                  <button
                    onClick={() => onTake(it.itemId)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold transition-colors"
                  >
                    <Hand className="w-3 h-3" />拿取
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="px-3 py-2.5 bg-slate-950/90 border-t border-slate-800 flex items-center gap-2">
          <button
            onClick={onTakeAll}
            disabled={remaining.length === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold transition-colors"
          >
            <PackageCheck className="w-4 h-4" />全部拿走{remaining.length > 0 ? ` (${remaining.length}样)` : ''}
          </button>
        </div>
      </div>
    </div>
  );
};
