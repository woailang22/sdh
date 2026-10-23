import React, { useState } from 'react';
import { X, Settings, Volume2, Keyboard, RotateCcw, ShieldAlert } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResetGame: () => void;
  isGM: boolean;
  onGMLogin: (token: string) => void;
  onGMLogout: () => void;
  onOpenRenderDiagnostics: () => void;
  onOpenFrameDiagnostics: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onResetGame, isGM, onGMLogin, onGMLogout, onOpenRenderDiagnostics, onOpenFrameDiagnostics }) => {
  const [vol, setVol] = useState(soundManager.getVolume() * 100);
  const [gmToken, setGmToken] = useState('');

  if (!isOpen) return null;

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVol(val);
    soundManager.setVolume(val / 100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-cyan-500/50 shadow-[0_0_40px_rgba(6,182,212,0.3)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-cyan-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                系统设置与操作指令指南 <span className="text-xs font-mono text-cyan-400 font-normal">Settings</span>
              </h2>
              <p className="text-xs text-slate-400">音效调节 · 快捷键位速查 · 渲染控制</p>
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
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Audio volume */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-200">
              <span className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                主音量输出大小
              </span>
              <span className="font-mono text-cyan-400">{Math.round(vol)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={vol}
              onChange={handleVolumeChange}
              className="w-full accent-cyan-400 cursor-pointer"
            />
          </div>

          {/* Keybindings Cheat Sheet */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-amber-400" />
              快捷键操作一览表：
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">移动控制</span>
                <span className="text-cyan-300 font-bold">W / A / S / D</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">射击瞄准</span>
                <span className="text-cyan-300 font-bold">鼠标左键 (长按扫射)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">搜刮 / 制造</span>
                <span className="text-cyan-300 font-bold">[F] 键 或 屏幕提示</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">战术冲刺/翻滚</span>
                <span className="text-cyan-300 font-bold">空格键 (Space)</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">换弹 / 吃肉排</span>
                <span className="text-cyan-300 font-bold">[R] 键</span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                <span className="text-slate-400">切换装备栏</span>
                <span className="text-cyan-300 font-bold">数字键 1 - 6</span>
              </div>
            </div>
          </div>

          {/* Reset button */}
          <button onClick={onOpenRenderDiagnostics} className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs text-slate-300">查看最近画面错误</button>
          <button onClick={onOpenFrameDiagnostics} className="w-full rounded-xl border border-slate-700 bg-slate-800 py-2.5 text-xs text-slate-300">查看卡顿记录</button>
          <button
            onClick={() => {
              soundManager.playClick();
              onResetGame();
              onClose();
            }}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs font-mono flex items-center justify-center gap-2 transition-all"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span>重置废土地图与怪物位置 (恢复满血状态)</span>
          </button>

          {/* GM 模式：地图编辑器门禁 */}
          <div className="p-4 rounded-xl bg-violet-950/30 border border-violet-500/30 space-y-2">
            <div className="text-xs font-bold text-violet-300 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" />
              GM 模式 {isGM && <span className="px-1.5 py-0.5 rounded bg-violet-600 text-white text-[10px] font-mono">已激活</span>}
            </div>
            {isGM ? (
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400">顶栏已出现「编辑」入口，可使用地图编辑器（物资/建筑/天气）。服务端天气调度需要 GM 鉴权。</p>
                <button
                  onClick={() => { soundManager.playClick(); onGMLogout(); }}
                  className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 font-bold text-xs transition-all"
                >
                  退出 GM 模式
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={gmToken}
                  onChange={(e) => setGmToken(e.target.value)}
                  placeholder="输入 GM 口令"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-violet-500"
                  onKeyDown={(e) => { if (e.key === 'Enter' && gmToken) { onGMLogin(gmToken); setGmToken(''); } }}
                />
                <button
                  onClick={() => { soundManager.playClick(); if (gmToken) { onGMLogin(gmToken); setGmToken(''); } }}
                  className="px-4 py-2 rounded-xl bg-violet-700 hover:bg-violet-600 text-white font-bold text-xs transition-all"
                >
                  登录
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
