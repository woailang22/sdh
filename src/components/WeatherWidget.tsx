import React from 'react';
import { CloudRain, Zap, CloudFog, Sun, Skull, ShieldCheck } from 'lucide-react';
import { WeatherState, MapZoneId } from '../types/game';
import { regionOf } from '../game/maps';

interface WeatherWidgetProps {
  weather: WeatherState;
  currentMapId: MapZoneId;
}

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({ weather, currentMapId }) => {
  const isSanctuary = regionOf(currentMapId) === 'camp';

  const formatSec = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (isSanctuary) {
    return (
      <div className="flex items-center gap-2 select-none">
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-cyan-500/40 shadow-lg shadow-cyan-950/30">
          <div className="p-1.5 rounded-lg bg-cyan-950/80 border border-cyan-500/30 text-amber-400">
            <Sun className="w-4 h-4" />
          </div>
          <div className="flex flex-col text-left">
            <div className="flex items-center gap-1.5 leading-tight">
              <span className="font-bold text-xs text-slate-100">恒定晴和 · 领地安全区</span>
              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/80 px-1.5 rounded border border-cyan-500/30 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" /> 力场覆盖
              </span>
            </div>
            <span className="text-[9px] font-mono text-emerald-400/90 font-medium">
              全域恒温 · 绝对安全保护 · 0环境侵蚀
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 select-none">
      {/* Wild Dynamic Weather Display */}
      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/90 backdrop-blur-md border border-slate-700/60 shadow-lg shadow-black/40">
        <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-700">
          {weather.current === 'clear' && <Sun className="w-4 h-4 text-amber-400" />}
          {weather.current === 'rain' && <CloudRain className="w-4 h-4 text-cyan-400" />}
          {weather.current === 'thunder' && <Zap className="w-4 h-4 text-yellow-300 animate-pulse" />}
          {weather.current === 'fog' && <CloudFog className="w-4 h-4 text-purple-300" />}
          {weather.current === 'acid_rain' && <Skull className="w-4 h-4 text-emerald-400" />}
        </div>

        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5 leading-tight">
            <span className="font-bold text-xs text-slate-100">{weather.name}</span>
            <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1 rounded border border-amber-500/30">
              {formatSec(weather.durationLeft)}
            </span>
          </div>
          <span className="text-[9px] font-mono text-cyan-300/90 font-medium">
            {weather.effectLabel}
          </span>
        </div>
      </div>
    </div>
  );
};
