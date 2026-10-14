import React from 'react';
import { X, Flame, ShieldAlert, Award, Clock } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface RiftModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClaimReward: () => void;
  hasReward: boolean;
}

export const RiftModal: React.FC<RiftModalProps> = ({ isOpen, onClose, onClaimReward, hasReward }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-purple-500/50 shadow-[0_0_40px_rgba(168,85,247,0.3)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-purple-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/40">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                限时深空坍界裂隙活动 <span className="text-xs font-mono text-purple-400 font-normal">Active Event</span>
              </h2>
              <p className="text-xs text-slate-400">空间撕裂指数 88.4% · 蚀体与恶瘴集群高发期</p>
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
          <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/60 flex items-center justify-between">
            <div>
              <div className="text-xs font-mono text-purple-300">当前坍界裂隙倒计时</div>
              <div className="text-2xl font-black font-mono text-amber-400 mt-1 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                02:45:12
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40 font-mono">
                困难难度 · 3倍掉落
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-200">裂隙挑战任务清单：</div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300">击退巡逻中的「蚀体、恶瘴魑」 (已击杀 3/5)</span>
              <span className="text-cyan-400 font-mono">+150 信用点</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300">在暴风雨中搜刮废铁堆 3 次</span>
              <span className="text-amber-400 font-mono">+2 坍界晶石</span>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-300">守卫营火与工作台设施不被破坏</span>
              <span className="text-emerald-400 font-mono">获得战术补给箱</span>
            </div>
          </div>

          {/* Reward claim button */}
          <button
            onClick={() => {
              soundManager.playLoot();
              onClaimReward();
            }}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs font-mono shadow-[0_0_20px_rgba(168,85,247,0.4)] flex items-center justify-center gap-2 transition-all"
          >
            <Award className="w-4 h-4" />
            <span>领取本阶段裂隙清剿奖励 (300信用点 + 50步枪弹药)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
