import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, MapPin, Navigation, Plus, Minus, Home } from 'lucide-react';
import { MapZoneId, MonsterEntity } from '../types/game';
import { REGIONS, SUBMAPS } from '../game/maps';
import { WORLD_LOCATIONS, WORLD_MIN, WORLD_MAX, worldLocationAt, worldThemeAt } from '../game/world';
import { groundBaseColor, themeAccent } from '../game/visualTheme';
import { WORLD_SUPPLY_ROUTES } from '../game/worldRoutes';
import { soundManager } from '../audio/soundManager';

interface CampMarker { id: string; ownerId: string; ownerName: string; x: number; y: number; mapId: string }
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
  onSetWaypoint?: (x: number, y: number, name?: string) => void;
  onGoHome?: () => void;
  camps?: CampMarker[];
  campSize?: number;
}

type SelectedPoint = { id: string; name: string; x: number; y: number; sourceMapId?: MapZoneId; camp?: boolean };
const RISK_LABEL = { SAFE: '安全', LOW: '低风险', HIGH: '高风险', EXTREME: '极高风险' };
const RESOURCE_LABEL: Record<string, string> = {
  camp: '公共工坊 · 营地入口', town: '废铁 · 零件 · 弹药',
  mountain: '原木 · 石料 · 铁矿 · 铜矿', marsh: '鱼获 · 食物 · 晶石',
};
const WORLD_SIZE = WORLD_MAX - WORLD_MIN;

export const WorldMapModal: React.FC<WorldMapModalProps> = ({
  isOpen, onClose, currentMapId = 'world', playerPos, teammates = [], waypoints = [],
  onSelectMapZone, onSetWaypoint, onGoHome, camps = [], campSize = 64,
}) => {
  const [view, setView] = useState({ x: WORLD_MIN, y: WORLD_MIN, size: WORLD_SIZE });
  const [selected, setSelected] = useState<SelectedPoint | null>(null);
  const [routeId, setRouteId] = useState('south');
  const drag = useRef<{ x: number; y: number; viewX: number; viewY: number } | null>(null);
  const inCamp = currentMapId.startsWith('home_');
  const location = worldLocationAt(playerPos.x, playerPos.y);
  const selection: SelectedPoint = selected ?? location;
  const selectedLocation = WORLD_LOCATIONS.find(point => point.id === selection.id);
  const selectedRoute = WORLD_SUPPLY_ROUTES.find(route => route.stops.some(point => point.id === selection.id));
  const selectedStop = selectedRoute?.stops.find(point => point.id === selection.id);
  const visibleRoute = selectedRoute ?? WORLD_SUPPLY_ROUTES.find(route => route.id === routeId)!;
  const routeCoordinates = visibleRoute.stops.map(point => point[visibleRoute.axis]);
  const routeMin = Math.min(0, ...routeCoordinates), routeMax = Math.max(0, ...routeCoordinates);
  const scale = view.size / WORLD_SIZE;
  const terrain = useMemo(() => Array.from({ length: 32 * 32 }, (_, index) => {
    const x = WORLD_MIN + (index % 32) * 64;
    const y = WORLD_MIN + Math.floor(index / 32) * 64;
    return { x, y, color: groundBaseColor(worldThemeAt(x + 32, y + 32), x, y) };
  }), []);

  useEffect(() => {
    if (isOpen) { setSelected(null); setRouteId('south'); setView({ x: WORLD_MIN, y: WORLD_MIN, size: WORLD_SIZE }); }
  }, [isOpen, currentMapId]);
  useEffect(() => {
    if (!isOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  const zoom = (factor: number) => setView(previous => {
    const size = Math.max(128, Math.min(WORLD_SIZE, previous.size * factor));
    return { x: previous.x + (previous.size - size) / 2, y: previous.y + (previous.size - size) / 2, size };
  });
  const centerPlayer = () => {
    soundManager.playClick();
    setView(previous => ({ ...previous, x: playerPos.x - previous.size / 2, y: playerPos.y - previous.size / 2 }));
  };
  const markRoute = () => {
    soundManager.playClick();
    if (onSetWaypoint) onSetWaypoint(selection.x, selection.y, selection.name);
    else onSelectMapZone?.('world', selection.x, selection.y);
    onClose();
  };
  const markerKey = (event: React.KeyboardEvent<SVGGElement>, point: SelectedPoint) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(point); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 select-none">
      <div role="dialog" aria-modal="true" aria-label={inCamp ? '独立营地平面图' : '连续世界总览'} className="relative w-full max-w-5xl rounded-2xl bg-[#0d1420] border border-amber-500/40 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-4 py-3 border-b border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-black text-amber-400 tracking-wide">{inCamp ? '独立营地平面图' : '连续世界总览'}</h2>
            <p className="text-[11px] text-slate-400 mt-1">{inCamp ? '当前为独立营地 · 从出口返回公共世界' : `${location.name} · 公共区域连续相连，步行探索`}</p>
            <p className="text-[10px] text-slate-500 font-mono mt-1">{inCamp ? '营地局部坐标' : '世界坐标'} {playerPos.x.toFixed(0)}, {playerPos.y.toFixed(0)}</p>
          </div>
          <div className="flex gap-2 items-center">
            {!inCamp && onGoHome && <button onClick={() => { soundManager.playClick(); onGoHome(); }} className="flex gap-1 items-center px-2 py-1.5 rounded-lg bg-emerald-950 border border-emerald-600/40 text-emerald-200 text-xs"><Home className="w-3.5 h-3.5" />营地导航</button>}
            <button onClick={onClose} aria-label="关闭地图" className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"><X className="w-4 h-4" /></button>
          </div>
        </div>

        {inCamp ? (
          <div className="p-4 overflow-y-auto">
            <svg viewBox={`${-campSize / 2 - 8} ${-campSize / 2 - 8} ${campSize + 16} ${campSize + 16}`} className="w-full h-[48vh] min-h-64 rounded-xl bg-slate-950 border border-slate-700" role="img" aria-label="营地局部位置与出口">
              <defs><pattern id="camp-map-grid" width="8" height="8" patternUnits="userSpaceOnUse"><path d="M 8 0 L 0 0 0 8" fill="none" stroke="#334155" strokeWidth="0.2" /></pattern></defs>
              <rect x={-campSize / 2} y={-campSize / 2} width={campSize} height={campSize} fill="url(#camp-map-grid)" stroke="#64748b" strokeWidth="0.4" />
              <text x="0" y="35" fill="#94a3b8" textAnchor="middle" fontSize="3">南侧营地出口 (0, 28) · 返回公共世界</text>
              <path d="M -3 25 L 0 28 L 3 25" stroke="#34d399" fill="none" strokeWidth="0.8" />
              {waypoints.map((point, index) => <circle key={`${point.name}-${index}`} cx={point.x} cy={point.y} r="1.2" fill="#34d399"><title>{point.name}</title></circle>)}
              <circle cx={playerPos.x} cy={playerPos.y} r="1.4" fill="#38bdf8" stroke="white" strokeWidth="0.5" />
              <text x={playerPos.x + 3} y={playerPos.y + 1} fill="#e2e8f0" fontSize="3">你的位置</text>
            </svg>
            <p className="text-xs text-slate-400 mt-3">营地独立于公共世界。走到南侧出口 (0, 28) 并交互，返回营地入口所在的世界坐标。</p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row min-h-0 overflow-y-auto">
            <div className="relative flex-1 min-w-0 bg-[#172027]">
              <svg viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`} className="w-full h-[48vh] md:h-[58vh] min-h-72 touch-none cursor-grab active:cursor-grabbing" aria-label="连续世界地形与地标" role="img"
                onWheel={event => { event.preventDefault(); zoom(event.deltaY < 0 ? 0.8 : 1.25); }}
                onPointerDown={event => {
                  if ((event.target as Element).closest('[data-map-marker]')) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  drag.current = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
                }}
                onPointerMove={event => {
                  const start = drag.current;
                  if (!start) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const units = view.size / Math.min(rect.width, rect.height);
                  setView(previous => ({ ...previous, x: start.viewX - (event.clientX - start.x) * units, y: start.viewY - (event.clientY - start.y) * units }));
                }}
                onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
                <defs><pattern id="world-map-grid" width="128" height="128" patternUnits="userSpaceOnUse"><path d="M 128 0 L 0 0 0 128" fill="none" stroke="#cbd5e1" strokeOpacity="0.12" strokeWidth="1.5" /></pattern></defs>
                {terrain.map(tile => <rect key={`${tile.x},${tile.y}`} x={tile.x} y={tile.y} width="64" height="64" fill={tile.color} />)}
                <rect x={WORLD_MIN} y={WORLD_MIN} width={WORLD_SIZE} height={WORLD_SIZE} fill="url(#world-map-grid)" stroke="#94a3b8" strokeWidth="3" />
                <g stroke="#d6c39a" strokeOpacity="0.5" strokeWidth="6" fill="none">
                  <path d={`M ${WORLD_MIN} 0 H ${WORLD_MAX} M 0 ${WORLD_MIN} V ${WORLD_MAX}`} />
                  {Array.from({ length: 15 }, (_, i) => (i - 7) * 128).filter(y => y !== 0).map(y => <path key={y} d={`M ${WORLD_MIN} ${y} H ${WORLD_MAX}`} strokeWidth="2" strokeOpacity="0.2" />)}
                  {WORLD_LOCATIONS.map(point => <path key={point.id} d={Math.abs(point.x) < Math.abs(point.y) ? `M 0 ${point.y} H ${point.x}` : `M ${point.x} 0 V ${point.y}`} strokeWidth="4" />)}
                </g>
                {REGIONS.map(region => {
                  const points = WORLD_LOCATIONS.filter(point => point.region === region.id);
                  const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
                  const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
                  return <text key={region.id} x={x - 70} y={y - 120} fill="#e2e8f0" fillOpacity="0.5" fontSize="46" fontWeight="bold" letterSpacing="5">{region.name}</text>;
                })}
                {view.size <= 1024 && <g stroke="#c5ac72" strokeWidth={3 * scale} strokeDasharray={`${8 * scale} ${6 * scale}`} fill="none" opacity="0.65" pointerEvents="none">
                  <path d={visibleRoute.axis === 'x' ? `M ${routeMin} 0 H ${routeMax}` : `M 0 ${routeMin} V ${routeMax}`} />
                  {visibleRoute.stops.map(point => <path key={point.id} d={visibleRoute.axis === 'x' ? `M ${point.x} 0 V ${point.y}` : `M 0 ${point.y} H ${point.x}`} />)}
                </g>}
                {WORLD_LOCATIONS.map(point => <g key={point.id} data-map-marker="true" role="button" tabIndex={0} aria-label={`选择地标：${point.name}`} className="cursor-pointer outline-none focus:stroke-white" onClick={() => setSelected(point)} onKeyDown={event => markerKey(event, point)}>
                  <circle cx={point.x} cy={point.y} r={17 * scale} fill="#0d1420" stroke={selection.id === point.id ? '#fbbf24' : themeAccent(point.theme)} strokeWidth={4 * scale} />
                  <circle cx={point.x} cy={point.y} r={34 * scale} fill="transparent" />
                  <text x={point.x + (point.id === 'camp_plaza' ? -25 : 25) * scale} y={point.y + (point.id === 'camp_workshop' ? -25 : point.id === 'camp_outskirts' ? 48 : 10) * scale} textAnchor={point.id === 'camp_plaza' ? 'end' : 'start'} fill="#f1f5f9" fontSize={38 * scale} paintOrder="stroke" stroke="#172027" strokeWidth={7 * scale} strokeLinejoin="round">{point.name}</text>
                  <title>{`${point.name} · ${RISK_LABEL[point.risk]}`}</title>
                </g>)}
                {view.size <= 1024 && visibleRoute.stops.map(point => <g key={point.id} data-map-marker="true" role="button" tabIndex={0} aria-label={`选择驿点：${point.name}`} className="cursor-pointer outline-none focus:stroke-white" onClick={() => setSelected(point)} onKeyDown={event => markerKey(event, point)}>
                  <rect x={point.x - 13 * scale} y={point.y - 13 * scale} width={26 * scale} height={26 * scale} fill={point.color} stroke={selection.id === point.id ? '#fbbf24' : '#172027'} strokeWidth={3 * scale} />
                  <circle cx={point.x} cy={point.y} r={34 * scale} fill="transparent" />
                  <text x={point.x + (point.labelOffset?.x ?? (point.x < 0 ? -26 : 26)) * scale} y={point.y + (point.labelOffset?.y ?? 10) * scale} textAnchor={(point.labelOffset?.x ?? point.x) < 0 ? 'end' : 'start'} fill="#f1e5ce" fontSize={38 * scale} paintOrder="stroke" stroke="#172027" strokeWidth={7 * scale}>{point.name}</text>
                  <title>{`${point.name} · ${point.supplies}`}</title>
                </g>)}
                {camps.map(camp => <g key={camp.id} data-map-marker="true" role="button" tabIndex={0} aria-label={`选择营地：${camp.ownerName}`} className="cursor-pointer" onClick={() => setSelected({ ...camp, name: `${camp.ownerName}的营地`, camp: true })} onKeyDown={event => markerKey(event, { ...camp, name: `${camp.ownerName}的营地`, camp: true })}>
                  <path d={`M ${camp.x - 15 * scale} ${camp.y + 12 * scale} L ${camp.x} ${camp.y - 18 * scale} L ${camp.x + 15 * scale} ${camp.y + 12 * scale} Z`} fill="#064e3b" stroke="#6ee7b7" strokeWidth={4 * scale} />
                  <title>{`${camp.ownerName}的营地入口`}</title>
                </g>)}
                {teammates.map((mate, index) => <circle key={`${mate.name}-${index}`} cx={mate.x} cy={mate.y} r={9 * scale} fill="#4ade80"><title>{mate.name}</title></circle>)}
                {selected && <circle pointerEvents="none" cx={selected.x} cy={selected.y} r={36 * scale} fill="none" stroke="#fbbf24" strokeWidth={3 * scale} strokeDasharray={`${6 * scale} ${4 * scale}`} />}
                <g aria-label="世界玩家位置"><circle cx={playerPos.x} cy={playerPos.y} r={13 * scale} fill="#38bdf8" stroke="#fff" strokeWidth={4 * scale} /><title>你的位置</title></g>
              </svg>
              <div className="absolute top-3 left-3 text-[10px] text-slate-200 font-mono rounded bg-slate-950/80 px-2 py-1 pointer-events-none">N ↑ · 世界边界 ±1024</div>
              <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-1">
                <button aria-label="放大地图" onClick={() => zoom(0.5)} className="p-2 rounded bg-slate-950/90 border border-slate-600 text-slate-200"><Plus className="w-4 h-4" /></button>
                <button aria-label="缩小地图" onClick={() => zoom(2)} className="p-2 rounded bg-slate-950/90 border border-slate-600 text-slate-200"><Minus className="w-4 h-4" /></button>
                <button onClick={centerPlayer} className="flex items-center gap-1 px-2 rounded bg-slate-950/90 border border-slate-600 text-slate-200 text-xs"><MapPin className="w-3.5 h-3.5" />我的位置</button>
                {WORLD_SUPPLY_ROUTES.map(route => <button key={route.id} onClick={() => { soundManager.playClick(); setRouteId(route.id); setView(route.view); setSelected(route.stops[0]); }} className="px-2 py-2 rounded bg-slate-950/90 border border-amber-700 text-amber-200 text-xs">{route.name}</button>)}
              </div>
            </div>
            <aside className="md:w-60 p-4 border-t md:border-t-0 md:border-l border-slate-800 bg-slate-950/40 flex flex-col gap-3">
              <div className="text-[10px] tracking-widest text-slate-500 font-mono">{selection.camp ? '营地入口' : '地标情报'}</div>
              <h3 className="font-bold text-base text-amber-200">{selection.name}</h3>
              <div className="text-xs font-mono text-slate-400">{selection.x}, {selection.y} · 距离 {Math.round(Math.hypot(selection.x - playerPos.x, selection.y - playerPos.y))} 格</div>
              {selectedLocation && <>
                <span className={`text-xs ${selectedLocation.risk === 'EXTREME' ? 'text-rose-400' : selectedLocation.risk === 'HIGH' ? 'text-amber-400' : 'text-emerald-400'}`}>{RISK_LABEL[selectedLocation.risk]}</span>
                <p className="text-xs text-slate-400 leading-relaxed">{SUBMAPS[selectedLocation.sourceMapId]?.desc}</p>
                <div className="text-xs text-slate-300 leading-relaxed">主要资源<br /><span className="text-slate-400">{RESOURCE_LABEL[selectedLocation.region]}</span></div>
              </>}
              {selectedStop && <>
                <span className="text-xs text-amber-300">{selectedRoute!.name} · {RISK_LABEL[worldLocationAt(selectedStop.x, selectedStop.y).risk]}</span>
                <label className="text-xs text-slate-400">沿途驿点
                  <select aria-label="选择沿途驿点" value={selectedStop.id} onChange={event => setSelected(selectedRoute!.stops.find(point => point.id === event.target.value)!)} className="mt-1 w-full min-h-10 px-2 rounded border border-slate-600 bg-slate-900 text-slate-200">
                    {selectedRoute!.stops.map(point => <option key={point.id} value={point.id}>{point.name}</option>)}
                  </select>
                </label>
                <p className="text-xs text-slate-400 leading-relaxed">{selectedStop.description}</p>
                <div className="text-xs text-slate-300 leading-relaxed">常见物资<br /><span style={{ color: selectedStop.color }}>{selectedStop.supplies}</span></div>
              </>}
              {selection.camp && <p className="text-xs text-slate-400 leading-relaxed">导航至世界中的营地入口，到达后交互进入独立营地。</p>}
              <button onClick={markRoute} className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-amber-500/60 bg-amber-950/50 text-amber-200 font-bold text-xs hover:bg-amber-900/60"><Navigation className="w-4 h-4" />标记路线</button>
              <p className="text-[10px] text-slate-500 leading-relaxed md:mt-auto">拖动平移 · 滚轮或按钮缩放<br />点击地标查看资源与风险<br />虚线为方向参考，行走需绕过建筑。物资可能已被搜取。<br />公共世界无缝相连，营地为独立空间。路线标记用于步行导航。</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
};
