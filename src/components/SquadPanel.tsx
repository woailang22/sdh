import React from 'react';
import { SquadMember } from '../types/game';

interface SquadPanelProps {
  members: SquadMember[];
  onSelectMember?: (member: SquadMember) => void;
}

export const SquadPanel: React.FC<SquadPanelProps> = ({ members, onSelectMember }) => {
  return (
    <div className="flex flex-col gap-2 p-2 rounded-xl bg-slate-900/80 backdrop-blur-md border border-cyan-500/30 shadow-[0_4px_20px_rgba(0,0,0,0.5)] w-48 select-none">
      <div className="text-[11px] font-mono text-cyan-400 font-semibold px-1 flex items-center justify-between">
        <span>小队成员 (4/4)</span>
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
      </div>

      <div className="flex flex-col gap-2">
        {members.map((m) => {
          const hpRatio = Math.max(0, Math.min(1, m.hp / m.maxHp));
          const shieldRatio = Math.max(0, Math.min(1, m.shield / m.maxShield));

          return (
            <div
              key={m.id}
              onClick={() => onSelectMember && onSelectMember(m)}
              className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-cyan-500/50 transition-all cursor-pointer group"
            >
              {/* Tactical Avatar */}
              <div className="relative w-8 h-8 rounded-md overflow-hidden bg-slate-950 border border-cyan-500/40 shrink-0 flex items-center justify-center font-bold text-xs text-cyan-300">
                {m.avatarSeed === 'player' ? (
                  <span className="text-amber-400">我</span>
                ) : m.avatarSeed === 'drone' ? (
                  <span className="text-sky-400">机</span>
                ) : (
                  <span>{m.name.slice(0, 1)}</span>
                )}
                {m.isPlayer && (
                  <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full border border-slate-900"></span>
                )}
              </div>

              {/* Status Bars */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-[11px] leading-tight mb-1">
                  <span className="font-medium text-slate-200 truncate group-hover:text-cyan-300 transition-colors">
                    {m.name}
                  </span>
                  <span className="text-[9px] text-slate-400 font-mono">
                    {m.hp}/{m.maxHp}
                  </span>
                </div>

                {/* HP Bar */}
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[8px] font-mono font-bold text-cyan-400 leading-none">HP</span>
                  <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden p-[0.5px]">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-all duration-300"
                      style={{ width: `${hpRatio * 100}%` }}
                    />
                  </div>
                </div>

                {/* Shield Bar */}
                <div className="flex items-center gap-1">
                  <span className="text-[8px] font-mono font-bold text-blue-400 leading-none">SH</span>
                  <div className="flex-1 h-1 bg-slate-950 rounded-full overflow-hidden p-[0.5px]">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-sky-400 rounded-full transition-all duration-300"
                      style={{ width: `${shieldRatio * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
