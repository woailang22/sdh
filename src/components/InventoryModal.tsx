import React from 'react';
import { X, Backpack, Sword, Shirt, Wrench, ArrowDownToLine, Trash2, Hand, Briefcase } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import { Item, Equipment } from '../types/game';
import { COLLECT_DEFS, COLLECT_SETS, TIER_COLOR, setProgress } from '../game/collection';
import { ItemIcon } from './ItemIcon';
import { RarityFrame } from './RarityFrame';
import { gatheringDescription, inventoryCapacity } from '../game/equipmentRules';
import { RAID_DAMAGE } from '../game/combat';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  hotbar: (Item | null)[];
  equipment: Equipment;
  equipmentPending?: boolean;
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
    bonus: (it) => {
      if (!it) return '无：左键为徒手近战';
      if (it.id === 'crude_gun') return '土铳 · 单发55';
      if (it.id === 'wp_p1911') return 'P1911 · 单发38';
      if (it.id === 'wp_mp5') return 'MP5 · 单发52';
      if (it.id === 'wp_akm') return 'AKM · 单发98';
      if (it.id === 'wp_m4a1') return 'M4A1 · 单发110';
      if (it.id === 'wp_m870') return 'M870 · 单发140';
      if (it.id === 'wp_svd') return 'SVD · 单发220';
      if (it.id === 'wp_plasma') return '等离子 · 单发320';
      return '步枪 · 单发124';
    },
  },
  armor: {
    name: '护甲',
    icon: <Shirt className="w-4 h-4 text-sky-400" />,
    bonus: (it) => {
      if (!it) return '无：只有基础护盾';
      if (it.id === 'armor_vest' || it.id === 'vest' || it.id === 'vest_t3') return '防弹背心 · 护盾+50/减伤15%';
      if (it.id === 'vest_t2') return '轻型背心 · 护盾+25';
      if (it.id === 'vest_t4') return '重型背心 · 护盾+80/减伤20%';
      if (it.id === 'vest_t5') return '钛合金 · 护盾+110/减伤25%';
      if (it.id === 'helmet_t2') return '头盔 · 护盾+15';
      if (it.id === 'helmet_t3') return '头盔 · 护盾+30';
      if (it.id === 'helmet_t4') return '头盔 · 护盾+50';
      return '粗布护甲 · 护盾+25';
    },
  },
  tool: {
    name: '工具',
    icon: <Wrench className="w-4 h-4 text-amber-400" />,
    bonus: (it) => {
      if (!it) return '无：徒手采集';
      if (it.id === 'throw_frag') return '破片 · 范围300';
      if (it.id === 'throw_molly') return '燃烧 · 持续120';
      if (it.id === 'throw_smoke') return '烟雾 · 遮蔽脱战';
      if (it.id === 'throw_flash') return '闪光 · 致盲3秒';
      if (it.id === 'thermite_charge') return `铝热 · 破拆${RAID_DAMAGE.thermite_charge}`;
      if (it.id === 'c4_explosive') return `C4 · 破拆${RAID_DAMAGE.c4_explosive}`;
      return gatheringDescription(it.id) ?? it.desc;
    },
  },
  pack: {
    name: '背包',
    icon: <Briefcase className="w-4 h-4 text-violet-400" />,
    bonus: (it) => !it ? `基础${inventoryCapacity()}格` : `${it.name} · 共${inventoryCapacity(it.id)}格`,
  },
};

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  hotbar,
  equipment,
  equipmentPending = false,
  materials,
  onUseItem,
  onEquip,
  onUnequip,
  onDrop,
}: InventoryModalProps) => {
  if (!isOpen) return null;

  const canUse = (it: Item) => it.category === 'food' || it.category === 'medical';
  const canEquip = (it: Item) => it.category === 'weapon' || it.category === 'armor' || it.category === 'tool' || it.category === 'pack';
  const ownedIds = new Set((hotbar ?? []).filter((x): x is Item => !!x).map((x) => x.id));

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
              {equipmentPending && <p role="status" className="text-xs text-cyan-300">装备确认中… 食物和药品仍可使用</p>}
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
                      {it ? <RarityFrame rarity={it.rarity} size={44}><ItemIcon id={it.id} emoji={it.icon} size={30} /></RarityFrame> : <span className="text-slate-700 text-xl">空</span>}
                    </div>
                    <div className="text-[10px] text-slate-400 text-center leading-tight min-h-7">
                      {it ? it.name : '—'}
                    </div>
                    <div className="text-[10px] font-mono text-emerald-300/90 text-center leading-tight">
                      {meta.bonus(it)}
                    </div>
                    {it && (
                      <button
                        disabled={equipmentPending}
                        onClick={() => onUnequip(slot)}
                        className="mt-0.5 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold transition-colors disabled:opacity-50 disabled:cursor-wait"
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
                    {it ? <RarityFrame rarity={it.rarity} size={38}><ItemIcon id={it.id} emoji={it.icon} size={26} /></RarityFrame> : <span className="text-slate-700 text-sm">{idx + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-200 truncate">
                      {it ? `${it.name}${it.count > 1 ? ` ×${it.count}` : ''}` : '空格'}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{it ? gatheringDescription(it.id) ?? it.desc : ''}</div>
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
                            disabled={equipmentPending}
                            onClick={() => onEquip(idx)}
                            className="px-1.5 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white text-[10px] font-bold disabled:opacity-50 disabled:cursor-wait"
                          >
                            装备
                          </button>
                        )}
                        <button
                          disabled={equipmentPending}
                          onClick={() => onDrop(idx)}
                          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-slate-800 hover:bg-rose-900 text-slate-400 hover:text-rose-300 text-[10px] disabled:opacity-50 disabled:cursor-wait"
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

          <div>
            <div className="text-xs font-bold text-slate-300 mb-2">藏品图鉴（集齐套装黑市领加成）</div>
            <div className="grid grid-cols-4 gap-2">
              {Object.values(COLLECT_DEFS).map((c) => {
                const got = ownedIds.has(c.id);
                return (
                  <div key={c.id} title={c.source} className={`rounded-xl border p-2 flex flex-col items-center gap-1 ${got ? '' : 'opacity-40 grayscale'}`} style={{ borderColor: TIER_COLOR[c.tier] }}>
                    <div className="text-2xl">{got ? c.icon : '❓'}</div>
                    <div className="text-[10px] text-slate-300">{c.name}</div>
                    <div className="text-[10px] font-mono" style={{ color: TIER_COLOR[c.tier] }}>{c.tier}</div>
                  </div>
                );
              })}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-2">
              {Object.values(COLLECT_SETS).map((s) => {
                const p = setProgress(s.id, ownedIds);
                return <div key={s.id}>{s.name} {p.owned}/{p.total} · 集齐+{s.bonusCredits}点{s.title ? `+称号${s.title}` : ''}</div>;
              })}
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
