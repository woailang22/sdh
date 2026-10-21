import React, { useEffect, useRef, useState } from 'react';
import type { BuildingEntity, Equipment, Item } from '../types/game';
import { ShieldAlert, Bomb, X } from 'lucide-react';

interface RaidModalProps {
  door: BuildingEntity;
  onClose: () => void;
  onRaidAttempt: (supplyId: string, supplyName: string) => void;
  onClaimLoot?: (loot: { name: string; count: number; icon: string }[]) => void;
  resources?: { c4?: number; ammo?: number };
  inventory?: (Item | null)[];
  equipment?: Equipment;
}

export function RaidModal({ door, onClose, onRaidAttempt, resources, inventory = [] }: RaidModalProps) {
  const [pending, setPending] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const supplies = [
    { id: 'c4_explosive', name: '高爆C4塑胶炸药', icon: '💣', count: resources?.c4 ?? 0 },
    { id: 'thermite_charge', name: '微型铝热熔切弹', icon: '🔥', count: inventory.reduce((count, item) => count + (item?.id === 'thermite_charge' ? item.count : 0), 0) },
  ];
  const breached = door.hp <= 0;
  const hpPercent = door.maxHp > 0 ? Math.max(0, Math.min(100, door.hp / door.maxHp * 100)) : 0;
  const attack = (supply: typeof supplies[number]) => {
    if (pending || timer.current || breached || supply.count <= 0) return;
    setPending(true);
    timer.current = setTimeout(() => { timer.current = null; setPending(false); }, 1050);
    onRaidAttempt(supply.id, supply.name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div role="dialog" aria-modal="true" aria-label="营地破拆" className="w-full max-w-xl bg-slate-900 border border-red-500/40 rounded-xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-red-500/30 flex items-center justify-between bg-red-950/30">
          <div className="flex items-center gap-3"><ShieldAlert className="w-6 h-6 text-red-400" /><div><h2 className="font-bold text-slate-100">营地破拆</h2><p className="text-xs text-slate-400">所属：{door.ownerName || '未知行者'}</p></div></div>
          <button onClick={onClose} aria-label="关闭破拆" className="p-2 text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
            <div className="flex justify-between gap-3 text-sm"><strong className="text-slate-200">{door.name}</strong><span className="text-cyan-300 font-mono">{door.hp} / {door.maxHp}</span></div>
            <div className="h-2 rounded bg-slate-800 overflow-hidden"><div className="h-full bg-red-500 transition-all" style={{ width: `${hpPercent}%` }} /></div>
          </div>
          {breached ? <div className="rounded-lg bg-emerald-950/30 border border-emerald-700/50 p-4 text-sm text-emerald-200">建筑已被攻破。进入营地寻找真实储物箱，靠近后搜查并取出其中物资；破门本身不会产生战利品。</div> : <>
            <p className="text-xs text-slate-400">靠近目标后使用携带的破拆物资。每次消耗 1 份，耐久与扣除结果以服务器同步为准。</p>
            <div className="space-y-2">{supplies.map(supply => <button key={supply.id} disabled={pending || supply.count <= 0} onClick={() => attack(supply)} className="w-full flex items-center justify-between gap-3 rounded-lg border border-red-800/50 bg-red-950/30 px-4 py-3 text-left text-sm text-slate-100 hover:bg-red-900/40 disabled:opacity-40 disabled:cursor-not-allowed">
              <span>{supply.icon} {supply.name}<span className="block mt-1 text-xs text-slate-400">携带：{supply.count}</span></span><span className="flex items-center gap-1 text-red-300"><Bomb className="w-4 h-4" />{pending ? '等待同步' : '使用 1 份'}</span>
            </button>)}</div>
            {supplies.every(supply => supply.count <= 0) && <p className="text-xs text-amber-300">没有可用破拆物资，请先搜刮或制造。</p>}
          </>}
          <button onClick={onClose} className="w-full rounded-lg bg-slate-800 py-2 text-sm text-slate-200 hover:bg-slate-700">返回营地</button>
        </div>
      </div>
    </div>
  );
}
