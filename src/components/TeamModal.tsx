import React from 'react';
import { X, Users, Crosshair, Search, ShieldCheck } from 'lucide-react';
import { SquadMember } from '../types/game';
import { soundManager } from '../audio/soundManager';

interface TeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: SquadMember[];
  onSetStance: (stance: string) => void;
  currentStance: string;
}

export const TeamModal: React.FC<TeamModalProps> = ({
  isOpen,
  onClose,
  members,
  onSetStance,
  currentStance,
}) => {
  if (!isOpen) return null;

  const stances = [
    { id: 'combat', label: '集火歼灭', desc: '全员进入攻击姿态，主动搜寻击杀附近蚀体', icon: <Crosshair className="w-4 h-4 text-rose-400" /> },
    { id: 'scavenge', label: '协作搜刮', desc: '优先破拆报废车辆与工作台物资，加成拾取收益', icon: <Search className="w-4 h-4 text-amber-400" /> },
    { id: 'defense', label: '据点固守', desc: '围绕营火与工作台构筑防线，提供护盾回充', icon: <ShieldCheck className="w-4 h-4 text-emerald-400" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-teal-500/50 shadow-[0_0_40px_rgba(20,184,166,0.3)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-teal-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-teal-500/20 text-teal-400 border border-teal-500/40">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                废土先遣战术小队指挥台 <span className="text-xs font-mono text-teal-400 font-normal">Team Tactics</span>
              </h2>
              <p className="text-xs text-slate-400">4人战术协同 · 作战战术姿态指令下发</p>
            </div>
          </div>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <div className="text-xs font-bold text-slate-200 mb-2">下发全队战术协同指令：</div>
            <div className="grid grid-cols-3 gap-2">
              {stances.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    soundManager.playClick();
                    onSetStance(s.id);
                  }}
                  className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all ${
                    currentStance === s.id
                      ? 'bg-teal-500/20 border-teal-400 text-teal-200 shadow-[0_0_15px_rgba(20,184,166,0.3)]'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="mb-1.5">{s.icon}</div>
                  <div className="text-xs font-bold">{s.label}</div>
                  <div className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-tight">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-slate-200 mb-2">小队编制名册 (4/4)：</div>
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-teal-300">
                      {m.name.slice(0, 1)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-200">{m.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">状态: {m.status}</div>
                    </div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-emerald-400">生命 {m.hp}/{m.maxHp}</div>
                    <div className="text-sky-400 text-[10px]">护盾 {m.shield}/{m.maxShield}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
