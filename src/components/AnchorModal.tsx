import React from 'react';
import { X, Anchor, Shield, Navigation, BatteryCharging } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface AnchorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgradeAnchor: () => void;
}

export const AnchorModal: React.FC<AnchorModalProps> = ({ isOpen, onClose, onUpgradeAnchor }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-xl rounded-2xl bg-slate-900 border border-blue-500/50 shadow-[0_0_40px_rgba(59,130,246,0.3)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-blue-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/40">
              <Anchor className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                坍界下锚发生器控制台 <span className="text-xs font-mono text-blue-400 font-normal">Sanctuary Anchor</span>
              </h2>
              <p className="text-xs text-slate-400">稳定时空坐标 · 阻绝暗影潮涌 · 构筑安全营地庇护所</p>
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
          <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-800/60 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400">当前锚点庇护范围</div>
              <div className="text-xl font-bold font-mono text-cyan-300 mt-0.5">半径 45 米安全场</div>
              <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-mono">
                <Shield className="w-3.5 h-3.5" /> 结界场强度 94% · 蚀体无法在此自然生成
              </div>
            </div>
            <div className="p-3 rounded-xl bg-blue-900/40 border border-blue-500/40 text-blue-300">
              <BatteryCharging className="w-6 h-6 animate-pulse" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="text-slate-400">锚点坐标</div>
              <div className="font-mono text-cyan-400 font-bold mt-1">LAT: 34.2081° / LON: 108.9822°</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
              <div className="text-slate-400">庇护所驻留小队</div>
              <div className="font-mono text-emerald-400 font-bold mt-1">4 人完全联机编制</div>
            </div>
          </div>

          <button
            onClick={() => {
              soundManager.playCraft();
              onUpgradeAnchor();
            }}
            className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs font-mono shadow-[0_0_20px_rgba(59,130,246,0.4)] flex items-center justify-center gap-2 transition-all"
          >
            <Shield className="w-4 h-4" />
            <span>加固锚定核心 (消耗废铁x30 · 扩大防线半径)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
