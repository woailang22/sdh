import React, { useState, useEffect } from 'react';
import { ShoppingCart, Flame, Anchor, User, Settings, Volume2, VolumeX, Wrench } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface TopMenuBarProps {
  onOpenModal: (modal: 'market' | 'rift' | 'anchor' | 'profile' | 'settings' | 'editor') => void;
  activeModal: string | null;
  weatherWidget?: React.ReactNode;
  onlineCount?: number;
  ping?: number;
  onOpenOnlinePlayers?: () => void;
  mapName?: string;
  coords?: { x: number; y: number };
  isGM?: boolean;
  dailyRedDot?: boolean;
}

export const TopMenuBar: React.FC<TopMenuBarProps> = ({
  onOpenModal,
  activeModal,
  weatherWidget,
  onlineCount = 1,
  ping = 24,
  onOpenOnlinePlayers,
  mapName = '恒界营地 · 营地广场',
  coords = { x: 0, y: 0 },
  isGM = false,
  dailyRedDot = false,
}) => {
  const [secondsLeft, setSecondsLeft] = useState(9912); // 02:45:12
  const [isMuted, setIsMuted] = useState(soundManager.getMuted());

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 10800));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatCountdown = (totalSec: number) => {
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleSound = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  return (
    <header className="absolute top-3 inset-x-3 z-30 flex items-center justify-between gap-3 select-none pointer-events-none">
      {/* Top Left Menu Cluster: Brand & Tactical Functions in clean row */}
      <div className="flex items-center gap-2 pointer-events-auto shrink-0">
        {/* Brand Badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]" />
          <div className="flex flex-col leading-none">
            <span className="text-xs font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-300 font-mono">
              坍界行者
            </span>
            <span className="text-[9px] font-mono text-slate-400 tracking-widest uppercase">
              RIFTWALKER
            </span>
          </div>
          {isGM && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-violet-600 text-white text-[9px] font-mono font-bold" title="GM模式已激活">
              GM
            </span>
          )}
        </div>

        {/* Real 80x80 Map World Indicator Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 shadow-lg text-xs font-mono">
          <span className="text-cyan-400 font-bold">🗺️ {mapName}</span>
          <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 text-[10px] text-cyan-300 border border-cyan-500/40">
            80×80 网格大地图 · 6400格
          </span>
          <span className="text-amber-400 font-semibold text-[11px]">
            [{coords.x.toFixed(1)}, {coords.y.toFixed(1)}]
          </span>
        </div>

        {/* Function Quick Buttons in sleek horizontal cluster */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950/85 backdrop-blur-md border border-cyan-500/30 shadow-lg">
          {/* 交易所 Market */}
          <button
            onClick={() => { onOpenModal('market'); soundManager.playClick(); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium ${
              activeModal === 'market'
                ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                : 'bg-slate-900/60 border-transparent text-slate-300 hover:bg-slate-850 hover:text-cyan-300'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>交易所</span>
          </button>

          {/* 裂隙活动 Rift */}
          <button
            onClick={() => { onOpenModal('rift'); soundManager.playClick(); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium ${
              activeModal === 'rift'
                ? 'bg-purple-500/30 border-purple-400 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                : 'bg-slate-900/60 border-transparent text-slate-300 hover:bg-slate-850 hover:text-purple-300'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <span>裂隙</span>
          </button>

          {/* 坍界下锚 Anchor */}
          <button
            onClick={() => { onOpenModal('anchor'); soundManager.playClick(); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium ${
              activeModal === 'anchor'
                ? 'bg-blue-500/30 border-blue-400 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.4)]'
                : 'bg-slate-900/60 border-transparent text-slate-300 hover:bg-slate-850 hover:text-blue-300'
            }`}
          >
            <Anchor className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span>下锚</span>
          </button>

          {/* 战区在线行者名录 Online Roster */}
          <button
            onClick={() => { onOpenOnlinePlayers?.(); soundManager.playClick(); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/40 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 transition-all text-xs font-medium"
            title="查看当前服务器所有在线探索者 (快捷键: Tab)"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>战区: {onlineCount}人</span>
            <span className="text-[10px] text-emerald-400/80 font-mono">({ping}ms)</span>
          </button>

          {/* 我的 Profile */}
          <button
            onClick={() => { onOpenModal('profile'); soundManager.playClick(); }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium ${
              activeModal === 'profile'
                ? 'bg-amber-500/30 border-amber-400 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.4)]'
                : 'bg-slate-900/60 border-transparent text-slate-300 hover:bg-slate-850 hover:text-amber-300'
            }`}
          >
            <User className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>档案</span>
            {dailyRedDot && <span className="ml-1 w-2 h-2 rounded-full bg-red-500" />}
          </button>

          {/* 地图编辑 Editor（仅 GM 可见） */}
          {isGM && (
            <button
              onClick={() => { onOpenModal('editor'); soundManager.playClick(); }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all text-xs font-medium ${
                activeModal === 'editor'
                  ? 'bg-violet-500/30 border-violet-400 text-violet-200 shadow-[0_0_10px_rgba(139,92,246,0.4)]'
                  : 'bg-slate-900/60 border-transparent text-slate-300 hover:bg-slate-850 hover:text-violet-300'
              }`}
              title="GM地图编辑器"
            >
              <Wrench className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span>编辑</span>
            </button>
          )}
        </div>
      </div>

      {/* Top Right Controls & Status: Weather, Countdown, Sound, Settings */}
      <div className="flex items-center gap-2 pointer-events-auto shrink-0 pr-40">
        {/* Weather Widget */}
        {weatherWidget}

        {/* Rift Countdown */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 shadow-lg text-xs font-mono">
          <span className="text-cyan-400 font-semibold">坍界</span>
          <span className="text-amber-400 font-bold tracking-wider">
            {formatCountdown(secondsLeft)}
          </span>
        </div>

        {/* Mute Button */}
        <button
          onClick={toggleSound}
          title={isMuted ? '点击开启音效' : '点击静音'}
          className="p-2 rounded-xl bg-slate-950/90 border border-cyan-500/40 text-cyan-300 hover:bg-slate-900 transition-colors"
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
        </button>

        {/* Settings Button */}
        <button
          onClick={() => { onOpenModal('settings'); soundManager.playClick(); }}
          title="系统设置"
          className="p-2 rounded-xl bg-slate-950/90 border border-cyan-500/40 text-cyan-300 hover:bg-slate-900 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
