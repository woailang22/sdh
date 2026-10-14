import React from 'react';
import { MapZoneId } from '../types/game';
import { soundManager } from '../audio/soundManager';
import { Tent, Truck, Fish, Trees, Flame, Compass, MapPin } from 'lucide-react';

interface MapZoneSwitcherProps {
  currentMap: MapZoneId;
  onSelectMap: (mapId: MapZoneId) => void;
  onOpenWorldMap?: () => void;
}

export const MapZoneSwitcher: React.FC<MapZoneSwitcherProps> = ({
  currentMap,
  onSelectMap,
  onOpenWorldMap,
}) => {
  const maps: {
    id: MapZoneId;
    name: string;
    subName: string;
    icon: React.ReactNode;
    color: string;
    terrainDesc: string;
  }[] = [
    {
      id: 'sanctuary',
      name: '恒界营地',
      subName: '领地地坪',
      icon: <Tent className="w-4 h-4 text-cyan-400" />,
      color: 'border-cyan-500/60 text-cyan-300',
      terrainDesc: '平整木板与石砖地坪 · 安全领地',
    },
    {
      id: 'pond',
      name: '缔造者钓场',
      subName: '水塘木栈道',
      icon: <Fish className="w-4 h-4 text-blue-400" />,
      color: 'border-blue-500/60 text-blue-300',
      terrainDesc: '开阔水域与木质钓台码头 · 垂钓',
    },
    {
      id: 'highway',
      name: '废弃省道',
      subName: '沥青公路',
      icon: <Truck className="w-4 h-4 text-amber-400" />,
      color: 'border-amber-500/60 text-amber-300',
      terrainDesc: '双向双车道沥青路与加油站 · 破拆',
    },
    {
      id: 'forest',
      name: '暗影密林',
      subName: '花岗岩采石',
      icon: <Trees className="w-4 h-4 text-emerald-400" />,
      color: 'border-emerald-500/60 text-emerald-300',
      terrainDesc: '采石场石阶与松针林地 · 采伐',
    },
    {
      id: 'rift_core',
      name: '裂隙红区',
      subName: '紫晶虚空',
      icon: <Flame className="w-4 h-4 text-purple-400" />,
      color: 'border-purple-500/60 text-purple-300',
      terrainDesc: '黑曜石与裂隙能量裂谷 · 高危战斗',
    },
  ];

  return (
    <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-950/90 backdrop-blur-md border border-cyan-500/40 shadow-[0_8px_25px_rgba(0,0,0,0.7)] select-none">
      <div className="flex items-center gap-1 px-2 py-0.5 text-xs font-mono font-bold text-cyan-400">
        <Compass className="w-4 h-4 text-cyan-400 animate-spin-slow" />
        <span className="hidden sm:inline">地图体系</span>
      </div>

      <div className="flex items-center gap-1">
        {maps.map((m) => {
          const isActive = currentMap === m.id;

          return (
            <button
              key={m.id}
              onClick={() => {
                soundManager.playClick();
                onSelectMap(m.id);
              }}
              title={`${m.name} (${m.terrainDesc})`}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                isActive
                  ? 'bg-slate-800 text-white border border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.4)] scale-105'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-transparent'
              }`}
            >
              {m.icon}
              <div className="flex flex-col text-left leading-none">
                <span className="font-bold text-[11px]">{m.name}</span>
                <span className="text-[9px] font-mono text-slate-400 hidden md:inline mt-0.5">
                  {m.subName}
                </span>
              </div>
            </button>
          );
        })}

        {onOpenWorldMap && (
          <button
            onClick={() => {
              soundManager.playClick();
              onOpenWorldMap();
            }}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-medium text-amber-400 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/40 hover:border-amber-400 transition-all font-mono ml-1"
            title="查看完整大地图标点 [M]"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span className="font-bold hidden sm:inline">大地图 [M]</span>
          </button>
        )}
      </div>
    </div>
  );
};
