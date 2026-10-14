import React from 'react';
import { X, User, Award, Shield, Target, Compass, Sparkles, Axe, Mountain, Fish } from 'lucide-react';
import { PlayerStats } from '../types/game';
import { soundManager } from '../audio/soundManager';
import { skillNext } from '../game/maps';

export interface SkillState {
  wood: number;
  stone: number;
  fish: number;
}

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  stats: PlayerStats;
  killCount: number;
  scavengeCount: number;
  skills: SkillState;
}

const SKILL_META = [
  { key: 'wood' as const, name: '伐木', icon: <Axe className="w-4 h-4 text-emerald-400 mx-auto mb-1" />, color: 'from-emerald-500 to-green-400' },
  { key: 'stone' as const, name: '采矿', icon: <Mountain className="w-4 h-4 text-slate-300 mx-auto mb-1" />, color: 'from-slate-400 to-slate-200' },
  { key: 'fish' as const, name: '垂钓', icon: <Fish className="w-4 h-4 text-sky-400 mx-auto mb-1" />, color: 'from-sky-500 to-cyan-300' },
];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  stats,
  killCount,
  scavengeCount,
  skills,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-amber-500/50 shadow-[0_0_40px_rgba(245,158,11,0.3)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-amber-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/40">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                行者个人档案与战术徽章 <span className="text-xs font-mono text-amber-400 font-normal">Operative Dossier</span>
              </h2>
              <p className="text-xs text-slate-400">军衔评定 · 击杀记录 · 生存资质证书</p>
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
          <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="w-16 h-16 rounded-xl bg-slate-900 border-2 border-amber-500/50 flex items-center justify-center text-3xl shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.3)]">
              🪖
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-100">先锋先遣号 荒野行者</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 font-mono">
                  玩家保护中
                </span>
              </div>
              <div className="text-xs text-cyan-400 font-mono mt-0.5">等级: Lv.{stats.level} (经验值: {stats.xp}/{stats.maxXp})</div>
              <div className="w-full h-1.5 bg-slate-950 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400"
                  style={{ width: `${(stats.xp / stats.maxXp) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <Target className="w-4 h-4 text-rose-400 mx-auto mb-1" />
              <div className="text-[10px] text-slate-400">击杀蚀体</div>
              <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">{killCount} 只</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <Compass className="w-4 h-4 text-amber-400 mx-auto mb-1" />
              <div className="text-[10px] text-slate-400">搜刮废墟</div>
              <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">{scavengeCount} 次</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <Sparkles className="w-4 h-4 text-purple-400 mx-auto mb-1" />
              <div className="text-[10px] text-slate-400">结界共鸣</div>
              <div className="text-lg font-bold font-mono text-slate-100 mt-0.5">S 阶契约</div>
            </div>
          </div>

          {/* 采集技能（星露谷式）：每级产量 +8% */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
            <div className="text-xs font-bold text-slate-200">⛏️ 采集技能 <span className="text-[10px] text-slate-500 font-normal">每级产量+8%</span></div>
            {SKILL_META.map((s) => {
              const info = skillNext(skills[s.key]);
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <div className="w-10 text-center shrink-0">
                    {s.icon}
                    <div className="text-[10px] text-slate-400">{s.name}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-[10px] font-mono mb-0.5">
                      <span className="text-amber-300 font-bold">Lv.{info.lvl}</span>
                      <span className="text-slate-500">{info.cur}/{info.need}</span>
                    </div>
                    <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${s.color}`}
                        style={{ width: `${Math.min(100, (info.cur / info.need) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
