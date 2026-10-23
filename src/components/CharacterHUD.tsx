import React from 'react';
import { PlayerStats } from '../types/game';
import { Shield, Zap, Heart, Award, Drumstick } from 'lucide-react';

interface CharacterHUDProps {
  stats: PlayerStats;
  onOpenInventory?: () => void;
}

export const CharacterHUD: React.FC<CharacterHUDProps> = ({ stats, onOpenInventory }) => {
  const hpRatio = Math.max(0, Math.min(1, stats.hp / stats.maxHp));
  const shieldRatio = Math.max(0, Math.min(1, stats.shield / stats.maxShield));
  const staminaRatio = Math.max(0, Math.min(1, stats.stamina / stats.maxStamina));
  const satietyRatio = Math.max(0, Math.min(1, stats.satiety / stats.maxSatiety));

  return (
    <div className="flex flex-col gap-1.5 select-none">
      {/* Triple Meter Gauges */}
      <div className="flex items-center gap-2.5">
        {/* Circular Tactical Crest */}
        <div className="relative w-11 h-11 rounded-full bg-slate-900 border-2 border-cyan-500/60 shadow-[0_0_12px_rgba(6,182,212,0.4)] flex items-center justify-center shrink-0">
          <div className="w-8 h-8 rounded-full border border-cyan-400/30 flex items-center justify-center">
            <Shield className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border border-slate-950 flex items-center justify-center text-[9px] font-bold text-slate-950">
            {stats.level}
          </div>
        </div>

        {/* The 3 Status Bars */}
        <div className="flex flex-col gap-1 w-44">
          {/* HP Bar */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-mono font-bold text-red-400 w-4">HP</span>
            <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden p-[1px] border border-red-950/60">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-red-400 rounded-full transition-all duration-200"
                style={{ width: `${hpRatio * 100}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-slate-300 w-12 text-right">
              {Math.round(stats.hp)}
            </span>
          </div>

          {/* Shield Bar */}
          <div className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-cyan-400" />
            <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden p-[1px] border border-cyan-950/60">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-sky-400 rounded-full transition-all duration-200"
                style={{ width: `${shieldRatio * 100}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-slate-300 w-12 text-right">
              {Math.round(stats.shield)}
            </span>
          </div>

          {/* Stamina Bar */}
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-amber-400" />
            <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden p-[1px] border border-amber-950/60">
              <div
                className="h-full bg-gradient-to-r from-amber-600 to-yellow-400 rounded-full transition-all duration-100"
                style={{ width: `${staminaRatio * 100}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-slate-300 w-12 text-right">
              {Math.round(stats.stamina)}
            </span>
          </div>

          {/* Satiety Bar（归零会饿掉血） */}
          <div className="flex items-center gap-1.5">
            <Drumstick className="w-3 h-3 text-orange-400" />
            <div className="flex-1 h-1.5 bg-slate-950 rounded-full overflow-hidden p-[1px] border border-orange-950/60">
              <div
                className={`h-full rounded-full transition-all duration-200 ${
                  satietyRatio <= 0.2
                    ? 'bg-gradient-to-r from-red-600 to-orange-500 animate-pulse'
                    : 'bg-gradient-to-r from-orange-600 to-amber-400'
                }`}
                style={{ width: `${satietyRatio * 100}%` }}
              />
            </div>
            <span className="text-[9px] font-mono text-slate-300 w-12 text-right">
              {Math.round(stats.satiety)}
            </span>
          </div>
        </div>
      </div>

      {stats.hp > 0 && satietyRatio <= 0.2 ? (
        <div role="status" className="w-64 max-sm:fixed max-sm:top-14 max-sm:left-3 max-sm:z-30 max-sm:w-[calc(100vw-1.5rem)] rounded-lg border border-orange-500/60 bg-slate-950/95 px-2 py-1.5 text-orange-100">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
            <span>{stats.satiety <= 0 ? '正在挨饿' : '饱食不足'}</span>
            {onOpenInventory && <button type="button" onClick={onOpenInventory} className="min-h-8 rounded border border-orange-400/50 bg-orange-950/70 px-2 text-orange-200 hover:bg-orange-900/70">打开背包补给</button>}
          </div>
          <p className="mt-1 text-[10px] leading-snug">{stats.satiety <= 0 ? '饥饿会消耗护盾和生命。' : ''}选中食物后点“使用”；缺口粮先搜农舍物资柜。</p>
        </div>
      ) : (
      <div className="flex items-center gap-2 pl-1">
        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900/90 border border-cyan-500/40 text-[11px] font-medium text-cyan-300">
          <Award className="w-3 h-3 text-cyan-400" />
          <span>Lv.{stats.level} {stats.title}</span>
        </div>

        <div className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-900/90 border border-emerald-500/40 text-[11px] font-medium text-emerald-400">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span>探索求生</span>
        </div>
      </div>
      )}
    </div>
  );
};
