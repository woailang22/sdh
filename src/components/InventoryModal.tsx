import React from 'react';
import { X, Backpack, Sword, Shirt, Wrench, ArrowDownToLine, Trash2, Hand, Briefcase } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import { Item, Equipment } from '../types/game';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotbar: (Item | null)[];
  equipment: Equipment;
  materials: { wood: number; stone: number; scrap: number; parts: number };
  onUseItem: (idx: number) => void;
  onEquip: (idx: number) => void;
  onUnequip: (slot: 'weapon' | 'armor' | 'tool' | 'pack') => void;
  onDrop: (idx: number) => void;
}

const EQUIP_META: Record<'weapon' | 'armor' | 'tool' | 'pack', { name: string; icon: React.ReactNode; bonus: (it: Item | null) => string }> = {
  weapon: {
    name: '武器',
    icon: <Sword className="w-4 h-4 text-rose-400" />,
    bonus: (it) => (!it ? '无：左键为徒手近战' : it.id === 'crude_gun' ? '土铳 · 单发55' : '步枪 · 单发124'),
  },
  armor: {
    name: '护甲',
    icon: <Shirt className="w-4 h-4 text-sky-400" />,
    bonus: (it) => (!it ? '无：只有基础护盾' : it.id === 'armor_vest' ? '防弹背心 · 护盾+50/减伤15%' : '粗布护甲 · 护盾+25'),
  },
  tool: {
    name: '工具',
    icon: <Wrench className="w-4 h-4 text-amber-400" />,
    bonus: (it) => (!it ? '无：徒手采集' : '石镐 · 采集+60%/近战22'),
  },
  pack: {
    name: '背包',
    icon: <Briefcase className="w-4 h-4 text-violet-400" />,
    bonus: (it) => (!it ? '基础6格' : it.id === 'pack_tactical' ? '战术携行具 · 共10格' : '帆布背包 · 共8格'),
  },
};

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  hotbar,
  equipment,
  materials,
  onUseItem,
  onEquip,
  onUnequip,
  onDrop,
}: InventoryModalProps) => {
  if (!isOpen) return null;

  const canUse = (it: Item) => it.category === 'food' || it.category === 'medical';
  const canEquip = (it: Item) => it.category === 'weapon' || it.category === 'armor' || it.category === 'tool' || it.category === 'pack';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.25)] overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/80 border-b border-amber-500/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <Backpack className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">背包与装备 <span className="text-xs font-mono text-amber-400 font-normal">[I]</span></h2>
              <p className="text-xs text-slate-400">战斗属性只看装备栏，背包只管存东西</p>
            </div>
          </div>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Equipment */}
          <div>
            <div className="text-xs font-bold text-slate-300 mb-2">个人装备</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(Object.keys(EQUIP_META) as ('weapon' | 'armor' | 'tool' | 'pack')[]).map((slot) => {
                const it = equipment[slot];
                const meta = EQUIP_META[slot];
                return (
                  <div
                    key={slot}
                    className={`rounded-xl border p-2.5 flex flex-col items-center gap-1.5 ${
                      it ? 'bg-emerald-950/40 border-emerald-500/50' : 'bg-slate-950/60 border-slate-800 border-dashed'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                      {meta.icon}
                      <span>{meta.name}</span>
                    </div>
                    <div className="h-12 flex items-center justify-center text-3xl">
                      {it ? it.icon : <span className="text-slate-700 text-xl">空</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 text-center leading-tight min-h-7">
                      {it ? it.name : '—'}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-300/90 text-center leading-tight">
                      {meta.bonus(it)}
                    </div>
                    {it && (
                      <button
                        onClick={() => onUnequip(slot)}
                        className="mt-0.5 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-colors"
                      >
                        <ArrowDownToLine className="w-3 h-3" />
                        卸下
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Backpack grid */}
          <div>
            <div className="text-xs font-bold text-slate-300 mb-2">背包（{hotbar.length}格）</div>
            <div className="grid grid-cols-2 gap-2">
              {hotbar.map((it, idx) => (
                <div
                  key={idx}
                  className={`rounded-xl border p-2 flex items-center gap-2 ${
                    it ? 'bg-slate-950/60 border-slate-700' : 'bg-slate-950/30 border-slate-800/60 border-dashed'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl shrink-0">
                    {it ? it.icon : <span className="text-slate-700 text-sm">{idx + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">
                      {it ? `${it.name}${it.count > 1 ? ` ×${it.count}` : ''}` : '空格'}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{it?.desc || ''}</div>
                    {it && (
                      <div className="flex items-center gap-1 mt-1">
                        {canUse(it) && (
                          <button
                            onClick={() => onUseItem(idx)}
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[10px] font-bold"
                          >
                            <Hand className="w-3 h-3" />使用
                          </button>
                        )}
                        {canEquip(it) && (
                          <button
                            onClick={() => onEquip(idx)}
                            className="px-1.5 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-bold"
                          >
                            装备
                          </button>
                        )}
                        <button
                          onClick={() => onDrop(idx)}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-rose-900 text-slate-400 hover:text-rose-300 text-[10px]"
                        >
                          <Trash2 className="w-3 h-3" />丢弃
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Materials */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] font-mono text-slate-300">
            <span className="text-slate-500">材料：</span>
            <span>🪵 {materials.wood}</span>
            <span>🪨 {materials.stone}</span>
            <span>⚙️ {materials.scrap}</span>
            <span>🔧 {materials.parts}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
