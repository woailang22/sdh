import React, { useEffect, useRef, useState } from 'react';
import { X, Map as MapIcon, Download, Upload, RotateCcw, MousePointerClick, CloudSun } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import type { IsometricEngine } from '../game/IsometricEngine';
import type { InteractableEntity } from '../types/game';

interface MapEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  getEngine: () => IsometricEngine | null;
  mapName: string;
  onSetWeather: (weather: string, label: string) => void;
}

const ITEM_PALETTE: { type: InteractableEntity['type']; icon: string; label: string }[] = [
  { type: 'tree', icon: '🌲', label: '树木' },
  { type: 'boulder', icon: '🪨', label: '岩石' },
  { type: 'scrap', icon: '⚙️', label: '废品堆' },
  { type: 'car', icon: '🚗', label: '车辆残骸' },
  { type: 'van', icon: '🚚', label: '货车残骸' },
  { type: 'shelves', icon: '🗄️', label: '货架' },
  { type: 'med_cabinet', icon: '💊', label: '医疗柜' },
  { type: 'ammo_crate', icon: '🎯', label: '弹药箱' },
  { type: 'box', icon: '📦', label: '箱子' },
  { type: 'workbench', icon: '🛠️', label: '工作台' },
  { type: 'campfire', icon: '🔥', label: '篝火' },
  { type: 'pond', icon: '🎣', label: '钓点' },
  { type: 'crystal', icon: '💎', label: '晶簇' },
];

const BUILD_PALETTE: { type: string; icon: string; label: string }[] = [
  { type: 'wood_wall', icon: '🪵', label: '原木墙' },
  { type: 'stone_wall', icon: '🧱', label: '条石墙' },
  { type: 'iron_wall', icon: '🛡️', label: '合金墙' },
  { type: 'glass_wall', icon: '🪟', label: '观察墙' },
  { type: 'door', icon: '🚪', label: '电控门' },
  { type: 'safe_door', icon: '🔒', label: '安全门' },
  { type: 'storage_box', icon: '🗃️', label: '储物箱(含物资)' },
  { type: 'turret', icon: '🗼', label: '防卫塔' },
  { type: 'spikes', icon: '🦔', label: '铁刺陷阱' },
];

const WEATHERS = [
  { id: 'clear', icon: '☀️', label: '晴朗' },
  { id: 'rain', icon: '🌧️', label: '骤雨' },
  { id: 'thunder', icon: '⚡', label: '雷暴' },
  { id: 'fog', icon: '🌫️', label: '浓雾' },
  { id: 'acid_rain', icon: '🧪', label: '酸雨' },
];

export const MapEditorModal: React.FC<MapEditorModalProps> = ({ isOpen, onClose, getEngine, mapName, onSetWeather }) => {
  const [kind, setKind] = useState<'item' | 'building'>('item');
  const [facing, setFacing] = useState<'ew' | 'ns'>('ew');
  const [palette, setPalette] = useState<InteractableEntity['type']>('tree');
  const [buildSel, setBuildSel] = useState('iron_wall');
  const [itemCount, setItemCount] = useState(0);
  const [buildCount, setBuildCount] = useState(0);
  const [hasOverride, setHasOverride] = useState(false);
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const eng = getEngine();
    if (eng) {
      eng.setEditMode(true);
      eng.editorPaletteKind = 'item';
      eng.editorPalette = palette;
      setFacing(eng.editorFacing);
    }
    const t = setInterval(() => {
      const e = getEngine();
      if (e) {
        setItemCount(e.interactables.length);
        setBuildCount(e.buildings.length);
        setHasOverride(e.editorHasOverride());
      }
    }, 600);
    return () => {
      clearInterval(t);
      getEngine()?.setEditMode(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const pickItem = (type: InteractableEntity['type']) => {
    setKind('item');
    setPalette(type);
    const eng = getEngine();
    if (eng) { eng.editorPaletteKind = 'item'; eng.editorPalette = type; }
    soundManager.playClick();
  };

  const pickBuild = (type: string) => {
    setKind('building');
    setBuildSel(type);
    const eng = getEngine();
    if (eng) { eng.editorPaletteKind = 'building'; eng.editorBuilding = type; }
    soundManager.playClick();
  };

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2500);
  };

  const handleExport = () => {
    const eng = getEngine();
    if (!eng) return;
    const blob = new Blob([eng.editorExport()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `map_${eng.currentMapId}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash('已导出当前地图 JSON（含建筑与物资）');
  };

  const handleImportFile = (f: File | undefined) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const eng = getEngine();
      const ok = eng?.editorImportJson(String(reader.result ?? ''));
      flash(ok ? '导入成功，已覆盖本图' : '导入失败：JSON 格式不对');
    };
    reader.readAsText(f);
  };

  const handleReset = () => {
    getEngine()?.editorClearOverride();
    flash('已恢复地图默认数据');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-violet-500/50 shadow-[0_0_40px_rgba(139,92,246,0.3)] overflow-hidden flex flex-col max-h-[88vh]">
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950/80 border-b border-violet-500/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-violet-500/20 text-violet-300 border border-violet-500/40">
              <MapIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                GM地图编辑器
                <span className="px-1.5 py-0.5 rounded bg-violet-600 text-white text-[10px] font-mono">GM</span>
              </h2>
              <p className="text-xs text-slate-400">正在编辑：{mapName} · 物资 {itemCount} / 建筑 {buildCount}{hasOverride ? ' · 已有自定义覆盖' : ''}</p>
            </div>
          </div>
          <button
            onClick={() => { soundManager.playClick(); onClose(); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[11px] text-slate-300 leading-relaxed">
            <MousePointerClick className="w-4 h-4 text-violet-300 shrink-0 mt-0.5" />
            <span>
              地图上 <b className="text-violet-300">左键放置</b>、<b className="text-violet-300">右键删除</b>最近物件；
              储物箱/安全门自带物资包（F 开箱分拣进账）。改动自动存本机，导出 JSON 可分享。
            </span>
          </div>

          {/* Kind tabs */}
          <div className="flex gap-1.5 p-1 rounded-xl bg-slate-950/70 border border-slate-800">
            {(['item', 'building'] as const).map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); soundManager.playClick(); const e = getEngine(); if (e) e.editorPaletteKind = k; }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  kind === k ? 'bg-violet-600/40 text-violet-100 border border-violet-400/60' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {k === 'item' ? '📦 物资/采集点' : '🧱 墙壁/建筑'}
              </button>
            ))}
          </div>

          {kind === 'item' ? (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
              {ITEM_PALETTE.map((p) => (
                <button
                  key={p.type}
                  onClick={() => pickItem(p.type)}
                  className={`flex flex-col items-center py-2 rounded-xl border transition-all ${
                    palette === p.type
                      ? 'bg-violet-950/80 border-violet-400 text-white shadow-[0_0_12px_rgba(139,92,246,0.5)] scale-105'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="text-xl leading-none">{p.icon}</span>
                  <span className="text-[10px] mt-1">{p.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={() => {
                  const next = facing === 'ew' ? 'ns' : 'ew';
                  setFacing(next);
                  const e = getEngine();
                  if (e) e.editorFacing = next;
                  soundManager.playClick();
                }}
                className="w-full py-1.5 rounded-xl bg-slate-950/70 border border-slate-700 text-slate-200 text-xs font-bold hover:border-violet-500/60 transition-all"
                title="按 R 也可旋转"
              >
                墙体朝向：{facing === 'ew' ? '东西 ⟷' : '南北'}（点击旋转 / 按R）
              </button>
              <div className="grid grid-cols-3 gap-1.5">
              {BUILD_PALETTE.map((p) => (
                <button
                  key={p.type}
                  onClick={() => pickBuild(p.type)}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-xl border transition-all ${
                    buildSel === p.type
                      ? 'bg-violet-950/80 border-violet-400 text-white shadow-[0_0_12px_rgba(139,92,246,0.5)] scale-[1.03]'
                      : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  <span className="text-xl leading-none">{p.icon}</span>
                  <span className="text-[11px]">{p.label}</span>
                </button>
              ))}
            </div>
            </div>
          )}

          {/* Weather GM */}
          <div>
            <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
              <CloudSun className="w-4 h-4 text-amber-400" />
              天气调度（在线GM广播全服，离线仅本地预览）
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {WEATHERS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => { soundManager.playClick(); onSetWeather(w.id, w.label); }}
                  className="flex flex-col items-center py-2 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 hover:border-amber-500/60 hover:text-amber-200 transition-all"
                >
                  <span className="text-xl leading-none">{w.icon}</span>
                  <span className="text-[10px] mt-1">{w.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-bold transition-colors"
            >
              <Download className="w-4 h-4" />导出JSON
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold transition-colors"
            >
              <Upload className="w-4 h-4" />导入JSON
            </button>
            <button
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-rose-900 text-slate-300 hover:text-rose-200 text-xs font-bold transition-colors"
            >
              <RotateCcw className="w-4 h-4" />恢复默认
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => { handleImportFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>

          {msg && (
            <div className="px-3 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs text-center">
              {msg}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
