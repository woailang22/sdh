import React, { useEffect, useState } from 'react';
import { X, MapPin, Skull, Eye, EyeOff, Navigation } from 'lucide-react';
import { MapZoneId, MonsterEntity, RegionId } from '../types/game';
import { REGIONS, SUBMAPS, MAP_IDS, mapsOfRegion, regionOf, displayName } from '../game/maps';
import { themeAccent as themeAccentVisual } from '../game/visualTheme';
import { soundManager } from '../audio/soundManager';

interface WorldMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMapId?: MapZoneId;
  playerPos: { x: number; y: number; angle?: number };
  teammates?: { x: number; y: number; name: string }[];
  monsters?: MonsterEntity[];
  waypoints?: { x: number; y: number; name: string; targetMap: string; icon?: string }[];
  onFastTravel?: (targetX: number, targetY: number) => void;
  onSelectMapZone?: (zoneId: MapZoneId, targetX?: number, targetY?: number) => void;
}

const RISK_STYLE: Record<string, string> = {
  SAFE: 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40',
  LOW: 'bg-sky-950/70 text-sky-300 border-sky-500/40',
  HIGH: 'bg-amber-950/70 text-amber-300 border-amber-500/40',
  EXTREME: 'bg-rose-950/70 text-rose-300 border-rose-500/40',
};

const THEME_COLOR: Record<string, string> = {
  camp: themeAccentVisual('camp'), plaza: themeAccentVisual('plaza'), field: themeAccentVisual('field'),
  urban: themeAccentVisual('urban'), ruins: themeAccentVisual('ruins'),
  forest: themeAccentVisual('forest'), quarry: themeAccentVisual('quarry'),
  lake: themeAccentVisual('lake'), marsh: themeAccentVisual('marsh'), rift: themeAccentVisual('rift'),
};

const TYPE_ICON: Record<string, string> = {
  tree: '🌲', boulder: '🪨', scrap: '⚙️', car: '🚗', van: '🚚',
  shelves: '🗄️', med_cabinet: '💊', ammo_crate: '🎯', box: '📦',
  workbench: '🛠️', campfire: '🔥', pond: '🎣', crystal: '💎',
};

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  isOpen,
  onClose,
  currentMapId = 'camp_plaza',
  playerPos,
  monsters = [],
  waypoints = [],
  onSelectMapZone,
}) => {
  const [region, setRegion] = useState<RegionId>(regionOf(currentMapId));
  const [hideBoss, setHideBoss] = useState(false);

  useEffect(() => {
    if (isOpen) setRegion(regionOf(currentMapId));
  }, [isOpen, currentMapId]);

  if (!isOpen) return null;

  const jumpToMe = () => {
    setRegion(regionOf(currentMapId));
    soundManager.playClick();
  };

  const travel = (id: MapZoneId) => {
    soundManager.playClick();
    onSelectMapZone?.(id, 0, 0);
    onClose();
  };

  const liveCount = (id: MapZoneId) => (id === currentMapId ? monsters.filter((m) => m.state !== 'dead').length : -1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-4xl rounded-2xl bg-[#0d1420] border border-amber-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header：当前区域 + 坐标 + 操作 */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-lg font-black text-amber-400 tracking-wide">
                地图 · {displayName(currentMapId)}
              </h2>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                你在 {displayName(currentMapId)} · 坐标 {playerPos.x.toFixed(0)}, {playerPos.y.toFixed(0)} ·
                点击地图卡片直接折跃
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={jumpToMe}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <MapPin className="w-3.5 h-3.5 text-amber-400" />标记我的位置
              </button>
              <button
                onClick={() => { setHideBoss((v) => !v); soundManager.playClick(); }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
              >
                {hideBoss ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {hideBoss ? '显示BOSS' : '隐藏BOSS'}
              </button>
              <button
                onClick={() => { soundManager.playClick(); onClose(); }}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
          {/* Region tabs */}
          <div className="flex items-center gap-1.5 mt-3">
            {REGIONS.map((r) => {
              const active = region === r.id;
              const hasPlayer = regionOf(currentMapId) === r.id;
              return (
                <button
                  key={r.id}
                  onClick={() => { setRegion(r.id); soundManager.playClick(); }}
                  title={r.desc}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    active
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-slate-900/70 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  <span className="text-base">{r.icon}</span>
                  <span>{r.name}</span>
                  {hasPlayer && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title="你在这个区域" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Maps grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {mapsOfRegion(region).map((m) => {
              const isHere = m.id === currentMapId;
              const live = liveCount(m.id);
              const counts = new Map<string, number>();
              m.interactables.forEach((it) => counts.set(it.type, (counts.get(it.type) ?? 0) + 1));
              const doors = m.buildings.filter((b) => b.type === 'safe_door').length;
              const hasAnchor = m.buildings.some((b) => b.type === 'anchor_core');
              const boss = m.monsters.find((x) => x.maxHp > 600 || x.name.includes('BOSS') || x.name.includes('领主'));
              const showBoss = boss && !hideBoss;
              return (
                <button
                  key={m.id}
                  onClick={() => travel(m.id)}
                  className={`text-left rounded-xl border p-3 transition-all hover:scale-[1.02] active:scale-[0.99] ${
                    isHere
                      ? 'bg-amber-950/40 border-amber-400 shadow-[0_0_18px_rgba(245,158,11,0.3)]'
                      : 'bg-slate-900/70 border-slate-700/80 hover:border-slate-500'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="w-2.5 h-8 rounded-full shrink-0"
                        style={{ background: THEME_COLOR[m.theme] ?? '#64748b' }}
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-sm text-slate-100 truncate flex items-center gap-1.5">
                          {m.name}
                          {isHere && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-600 text-white font-mono shrink-0">
                              📍你在这里
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">{m.desc}</div>
                      </div>
                    </div>
                    <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${RISK_STYLE[m.risk]}`}>
                      {m.risk}
                    </span>
                  </div>

                  {/* Theme thumbnail strip */}
                  <div className="mt-2 h-8 rounded-lg border border-slate-800 overflow-hidden flex" title={m.theme}>
                    <div className="flex-1" style={{ background: `linear-gradient(135deg, ${THEME_COLOR[m.theme]}55, transparent)` }} />
                    <div className="flex-1 opacity-60" style={{ background: THEME_COLOR[m.theme] ?? '#64748b' }} />
                    <div className="flex-1" style={{ background: `linear-gradient(225deg, ${THEME_COLOR[m.theme]}88, transparent)` }} />
                  </div>

                  {/* POI chips */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {[...counts.entries()].map(([t, n]) => (
                      <span key={t} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-slate-300">
                        {TYPE_ICON[t] ?? '📦'}×{n}
                      </span>
                    ))}
                    {doors > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-950/60 border border-red-500/40 text-red-300">
                        🚪安全门×{doors}
                      </span>
                    )}
                    {hasAnchor && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/40 text-cyan-300">
                        ⚓锚点核心
                      </span>
                    )}
                    {(live >= 0 ? live : m.monsters.length) > 0 && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950/80 border border-slate-700 text-slate-300">
                        👹×{live >= 0 ? live : m.monsters.length}
                      </span>
                    )}
                    {showBoss && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-950/60 border border-purple-500/40 text-purple-300 flex items-center gap-0.5">
                        <Skull className="w-3 h-3" />{boss!.name.split(' ')[0]}
                      </span>
                    )}
                  </div>

                  {/* Gates */}
                  <div className="mt-2 pt-1.5 border-t border-slate-800/70 space-y-0.5">
                    {m.gates.map((g, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px] text-slate-400">
                        <Navigation className="w-3 h-3 text-cyan-500 shrink-0" />
                        <span className="truncate">{g.icon ?? '🚪'} {g.name} → {displayName(g.targetMap)}</span>
                      </div>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 text-[10px] text-slate-500 font-mono">
            {MAP_IDS.length} 张地图 · {REGIONS.length} 大区域 · 点击卡片直接折跃
          </div>
        </div>
      </div>
    </div>
  );
};
