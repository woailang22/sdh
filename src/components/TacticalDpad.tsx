import React, { useState, useEffect } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Navigation, RefreshCw, MousePointer } from 'lucide-react';
import { soundManager } from '../audio/soundManager';

interface TacticalDpadProps {
  onDirectionChange: (dir: { x: number; y: number }) => void;
  onResetKeys: () => void;
  activeKeys: { [key: string]: boolean };
  currentCoords?: { x: number; y: number };
}

export const TacticalDpad: React.FC<TacticalDpadProps> = ({
  onDirectionChange,
  onResetKeys,
  activeKeys,
  currentCoords = { x: 0, y: 0 },
}) => {
  const [activeDirections, setActiveDirections] = useState<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false,
  });

  const isWActive = Boolean(activeKeys['w'] || activeKeys['keyw'] || activeKeys['arrowup']);
  const isSActive = Boolean(activeKeys['s'] || activeKeys['keys'] || activeKeys['arrowdown']);
  const isAActive = Boolean(activeKeys['a'] || activeKeys['keya'] || activeKeys['arrowleft']);
  const isDActive = Boolean(activeKeys['d'] || activeKeys['keyd'] || activeKeys['arrowright']);

  const handlePointerDown = (dir: 'up' | 'down' | 'left' | 'right') => {
    setActiveDirections((prev) => {
      const next = { ...prev, [dir]: true };
      emitVector(next);
      return next;
    });
    soundManager.playClick();
  };

  const handlePointerUp = (dir: 'up' | 'down' | 'left' | 'right') => {
    setActiveDirections((prev) => {
      const next = { ...prev, [dir]: false };
      emitVector(next);
      return next;
    });
  };

  const emitVector = (dirs: { up: boolean; down: boolean; left: boolean; right: boolean }) => {
    let dx = 0;
    let dy = 0;
    if (dirs.up) dy -= 1;
    if (dirs.down) dy += 1;
    if (dirs.left) dx -= 1;
    if (dirs.right) dx += 1;
    onDirectionChange({ x: dx, y: dy });
  };

  return (
    <div className="flex flex-col items-center select-none pointer-events-auto">
      {/* Tactical Status & Stuck Key Clearer */}
      <div className="flex items-center gap-1.5 mb-1 px-2 py-0.5 rounded bg-slate-950/80 border border-cyan-500/30 text-[10px] font-mono text-cyan-400">
        <Navigation className="w-2.5 h-2.5 text-cyan-300" />
        <span>X:{currentCoords.x.toFixed(1)} Y:{currentCoords.y.toFixed(1)}</span>
        <button
          onClick={() => {
            onResetKeys();
            setActiveDirections({ up: false, down: false, left: false, right: false });
            soundManager.playClick();
          }}
          title="点击解除浏览器或输入法卡键"
          className="ml-1 p-0.5 rounded bg-cyan-950/60 hover:bg-cyan-800/60 text-cyan-200 transition-colors flex items-center gap-0.5 text-[9px]"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          <span>解卡</span>
        </button>
      </div>

      {/* D-Pad Buttons */}
      <div className="relative w-28 h-28 bg-slate-950/70 backdrop-blur-md rounded-full border border-cyan-500/40 p-1 shadow-[0_0_15px_rgba(6,182,212,0.2)]">
        {/* Up [W] */}
        <button
          onPointerDown={() => handlePointerDown('up')}
          onPointerUp={() => handlePointerUp('up')}
          onPointerLeave={() => handlePointerUp('up')}
          className={`absolute top-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-t-lg flex items-center justify-center font-bold text-xs transition-all ${
            isWActive || activeDirections.up
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_#06b6d4]'
              : 'bg-slate-900/90 text-cyan-400 hover:bg-slate-800 border border-cyan-500/30'
          }`}
          title="向前跑动 [W]"
        >
          <ChevronUp className="w-4 h-4" />
        </button>

        {/* Down [S] */}
        <button
          onPointerDown={() => handlePointerDown('down')}
          onPointerUp={() => handlePointerUp('down')}
          onPointerLeave={() => handlePointerUp('down')}
          className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-8 rounded-b-lg flex items-center justify-center font-bold text-xs transition-all ${
            isSActive || activeDirections.down
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_#06b6d4]'
              : 'bg-slate-900/90 text-cyan-400 hover:bg-slate-800 border border-cyan-500/30'
          }`}
          title="向后跑动 [S]"
        >
          <ChevronDown className="w-4 h-4" />
        </button>

        {/* Left [A] */}
        <button
          onPointerDown={() => handlePointerDown('left')}
          onPointerUp={() => handlePointerUp('left')}
          onPointerLeave={() => handlePointerUp('left')}
          className={`absolute top-1/2 left-1 -translate-y-1/2 w-8 h-8 rounded-l-lg flex items-center justify-center font-bold text-xs transition-all ${
            isAActive || activeDirections.left
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_#06b6d4]'
              : 'bg-slate-900/90 text-cyan-400 hover:bg-slate-800 border border-cyan-500/30'
          }`}
          title="向左跑动 [A]"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Right [D] */}
        <button
          onPointerDown={() => handlePointerDown('right')}
          onPointerUp={() => handlePointerUp('right')}
          onPointerLeave={() => handlePointerUp('right')}
          className={`absolute top-1/2 right-1 -translate-y-1/2 w-8 h-8 rounded-r-lg flex items-center justify-center font-bold text-xs transition-all ${
            isDActive || activeDirections.right
              ? 'bg-cyan-500 text-slate-950 shadow-[0_0_10px_#06b6d4]'
              : 'bg-slate-900/90 text-cyan-400 hover:bg-slate-800 border border-cyan-500/30'
          }`}
          title="向右跑动 [D]"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Center Compass Core */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900 border border-cyan-500/60 flex items-center justify-center text-[10px] text-cyan-300 font-bold">
          WASD
        </div>
      </div>

      {/* Mouse Right-click Hint */}
      <div className="mt-1 flex items-center gap-1 text-[9px] font-mono text-slate-400">
        <MousePointer className="w-2.5 h-2.5 text-cyan-400" />
        <span>右键地图任意位置自动寻路</span>
      </div>
    </div>
  );
};
