import React from 'react';
import { OnlinePlayer } from '../types/game';
import { Users, Wifi, ShieldCheck, MapPin, Swords, X, UserPlus, Radio } from 'lucide-react';

import { displayName } from '../game/maps';

interface OnlinePlayersModalProps {
  players: OnlinePlayer[];
  selfId: string;
  ping: number;
  isConnected: boolean;
  onClose: () => void;
  onInviteToSquad?: (player: OnlinePlayer) => void;
}

export function OnlinePlayersModal({
  players,
  selfId,
  ping,
  isConnected,
  onClose,
  onInviteToSquad,
}: OnlinePlayersModalProps) {

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-slate-900 border border-cyan-500/30 rounded-xl shadow-2xl shadow-cyan-950/40 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-900 px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/30">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100 tracking-wide">战区在线行者名录</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-cyan-950 text-cyan-300 border border-cyan-700/40 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                  {isConnected ? '实时同步中' : '重连中'}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex items-center gap-3">
                <span>在线探索者: <strong className="text-cyan-300">{players.length}</strong> 人</span>
                <span className="flex items-center gap-1">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" /> 延迟: <strong className="text-emerald-400">{ping}ms</strong>
                </span>
                <span>全双工实时同步节点: <strong className="text-slate-300">Edge-Shard-01</strong></span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Players List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {players.map((p) => {
            const isSelf = p.id === selfId;
            const zoneName = displayName(p.mapId);
            const hpPct = Math.round((p.hp / p.maxHp) * 100);

            return (
              <div
                key={p.id}
                className={`p-3.5 rounded-lg border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                  isSelf
                    ? 'bg-cyan-950/30 border-cyan-500/50 shadow-sm shadow-cyan-950/50'
                    : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                }`}
              >
                {/* Left: Avatar & Identity */}
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm text-white shadow"
                    style={{ backgroundColor: p.color || '#0284c7' }}
                  >
                    Lv.{p.level}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-slate-100">{p.name}</span>
                      {isSelf && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-cyan-900/60 text-cyan-300 border border-cyan-700/40">
                          你自己
                        </span>
                      )}
                      <span className="text-xs text-slate-400">· {p.title || '坍界行者'}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="flex items-center gap-1 text-slate-300">
                        <MapPin className="w-3.5 h-3.5 text-cyan-400" /> {zoneName}
                      </span>
                      <span className="flex items-center gap-1 text-emerald-400 font-mono">
                        <ShieldCheck className="w-3.5 h-3.5" /> 生命: {p.hp}/{p.maxHp}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Status & Actions */}
                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
                  <span className="px-2.5 py-1 text-xs rounded bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5">
                    <Swords className="w-3.5 h-3.5 text-amber-400" />
                    {p.currentAction || '探索中'}
                  </span>

                  {!isSelf && (
                    <button
                      onClick={() => onInviteToSquad?.(p)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center gap-1.5 transition-colors shadow shadow-cyan-950"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      邀请入队
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bg-slate-950 px-6 py-3 border-t border-slate-800 flex justify-between items-center text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <Radio className="w-4 h-4 text-cyan-400 animate-pulse" /> 按 <strong>Tab</strong> 键可随时快速呼出/隐藏战区名录
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            关闭 (ESC)
          </button>
        </div>
      </div>
    </div>
  );
}
