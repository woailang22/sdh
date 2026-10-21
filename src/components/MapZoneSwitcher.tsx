import React from 'react';
import { MapZoneId } from '../types/game';
import { soundManager } from '../audio/soundManager';
import { Compass, MapPin, Tent } from 'lucide-react';
import { worldLocationAt } from '../game/world';

interface MapZoneSwitcherProps {
  currentMap: MapZoneId;
  onSelectMap: (mapId: MapZoneId) => void;
  onOpenWorldMap?: () => void;
  playerPos?: { x: number; y: number };
}

export const MapZoneSwitcher: React.FC<MapZoneSwitcherProps> = ({ currentMap, onOpenWorldMap, playerPos = { x: 0, y: 0 } }) => {
  const inCamp = currentMap.startsWith('home_');
  return (
    <div className="flex items-center gap-2 p-1.5 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 shadow-[0_8px_25px_rgba(0,0,0,0.7)] select-none">
      <div className="flex items-center gap-2 px-2 py-0.5 text-xs text-cyan-300">
        {inCamp ? <Tent className="w-4 h-4" /> : <Compass className="w-4 h-4" />}
        <div className="flex flex-col gap-0.5"><span className="font-bold">{inCamp ? '独立营地' : worldLocationAt(playerPos.x, playerPos.y).name}</span><span className="text-[9px] text-slate-500">{inCamp ? '从出口返回公共世界' : '连续世界 · 自由探索'}</span></div>
      </div>
      {onOpenWorldMap && <button onClick={() => { soundManager.playClick(); onOpenWorldMap(); }} className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40" title="打开地图 [M]"><MapPin className="w-3.5 h-3.5" /><span>打开地图</span><span className="hidden sm:inline text-[10px]">[M]</span></button>}
    </div>
  );
};
