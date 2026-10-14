import React, { useState } from 'react';
import { Hammer, Shield, DoorClosed, Zap, Archive, Flame, X, Grid, Eye, Wrench, Sparkles, Layers } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import { BuildableType } from '../types/game';

export interface BuildableStructure {
  type: BuildableType;
  category: 'floor' | 'wall' | 'utility';
  name: string;
  icon: React.ReactNode;
  costScrap: number;
  costWood?: number;
  costStone?: number;
  costParts: number;
  hp: number;
  desc: string;
}

interface BuildingBarProps {
  isBuildMode: boolean;
  selectedType: string;
  onSelectType: (type: string) => void;
  onToggleBuildMode: () => void;
  playerScrap: number;
  playerParts: number;
}

export const BuildingBar: React.FC<BuildingBarProps> = ({
  isBuildMode,
  selectedType,
  onSelectType,
  onToggleBuildMode,
  playerScrap,
  playerParts,
}) => {
  const [activeCategory, setActiveCategory] = useState<'floor' | 'wall' | 'utility'>('floor');

  const structures: BuildableStructure[] = [
    // 1. 地板系列 (Floors)
    {
      type: 'wood_floor',
      category: 'floor',
      name: '原木板材地板',
      icon: <Grid className="w-4 h-4 text-amber-500" />,
      costScrap: 2,
      costWood: 4,
      costParts: 0,
      hp: 300,
      desc: '铺设营地木质地板，平整地面，扩展可活动领地空间',
    },
    {
      type: 'stone_floor',
      category: 'floor',
      name: '石质防爆地砖',
      icon: <Layers className="w-4 h-4 text-slate-300" />,
      costScrap: 4,
      costStone: 6,
      costParts: 0,
      hp: 550,
      desc: '厚重坚固的花岗石板路面，防蚀体钻地突袭，防爆破',
    },
    {
      type: 'iron_floor',
      category: 'floor',
      name: '铁制网纹格栅',
      icon: <Grid className="w-4 h-4 text-cyan-400" />,
      costScrap: 6,
      costParts: 0,
      hp: 800,
      desc: '工业级合金防滑网纹地板，重装防御工事首选',
    },

    // 2. 墙体与门系列 (Walls & Doors)
    {
      type: 'wood_wall',
      category: 'wall',
      name: '加固原木围墙',
      icon: <Shield className="w-4 h-4 text-amber-600" />,
      costScrap: 3,
      costWood: 6,
      costParts: 0,
      hp: 350,
      desc: '快速搭建的原木防线，阻隔野外幼体漫游',
    },
    {
      type: 'stone_wall',
      category: 'wall',
      name: '厚重条石防护墙',
      icon: <Shield className="w-4 h-4 text-slate-400" />,
      costScrap: 4,
      costStone: 8,
      costParts: 0,
      hp: 600,
      desc: '开采花岗岩砌筑的坚实石墙，耐蚀体物理撞击',
    },
    {
      type: 'iron_wall',
      category: 'wall',
      name: '战术重合金铁墙',
      icon: <Shield className="w-4 h-4 text-cyan-400" />,
      costScrap: 6,
      costParts: 0,
      hp: 850,
      desc: '重型装甲钢板拼焊墙体，阻挡高危恶瘴魑冲击',
    },
    {
      type: 'glass_wall',
      category: 'wall',
      name: '钢化玻璃观察墙',
      icon: <Eye className="w-4 h-4 text-sky-300" />,
      costScrap: 5,
      costParts: 1,
      hp: 400,
      desc: '装有高强度钢化防弹玻璃，防冲击同时提供开阔警戒视野',
    },
    {
      type: 'door',
      category: 'wall',
      name: '自动防卫电控门',
      icon: <DoorClosed className="w-4 h-4 text-emerald-400" />,
      costScrap: 8,
      costParts: 1,
      hp: 650,
      desc: '按 [F] 键随时开关门，闭锁时阻断外部一切侵扰',
    },
    {
      type: 'safe_door',
      category: 'wall',
      name: '高耐久重装防爆安全门',
      icon: <Shield className="w-4 h-4 text-red-400" />,
      costScrap: 20,
      costParts: 4,
      hp: 5000,
      desc: '领地核心安全大门！5000超高耐久，其他玩家可使用破拆物资(C4/铝热剂/EMP)突袭攻门！',
    },

    // 3. 领地与城防设施 (Utilities & Defense)
    {
      type: 'storage_box',
      category: 'utility',
      name: '战术领地储物箱',
      icon: <Archive className="w-4 h-4 text-emerald-400" />,
      costScrap: 5,
      costParts: 0,
      hp: 400,
      desc: '领地专属安全储物容器，靠近按 [F] 存取各种战利品与物资',
    },
    {
      type: 'workbench',
      category: 'utility',
      name: '机械工程工作台',
      icon: <Wrench className="w-4 h-4 text-blue-400" />,
      costScrap: 8,
      costParts: 1,
      hp: 500,
      desc: '野战军工工作台，靠近按 [F] 制造步枪子弹、医疗包与工具',
    },
    {
      type: 'electric_core',
      category: 'utility',
      name: '电磁防卫核心',
      icon: <Sparkles className="w-4 h-4 text-cyan-300" />,
      costScrap: 12,
      costParts: 2,
      hp: 600,
      desc: '安装在领地防线，对 5 格范围内接近的蚀体自动释放高压电浆',
    },
    {
      type: 'flame_core',
      category: 'utility',
      name: '聚能烈焰燃芯',
      icon: <Flame className="w-4 h-4 text-orange-400" />,
      costScrap: 12,
      costParts: 2,
      hp: 600,
      desc: '装载旧时代聚能燃芯，对周围接近的怪兽喷吐炽热烈焰',
    },
    {
      type: 'turret',
      category: 'utility',
      name: '自律防御电击塔',
      icon: <Zap className="w-4 h-4 text-amber-400" />,
      costScrap: 15,
      costParts: 2,
      hp: 750,
      desc: '全自动索敌哨塔，向靠近的恶瘴魑发射密集破甲电浆',
    },
    {
      type: 'spikes',
      category: 'utility',
      name: '拒马铁刺穿刺陷阱',
      icon: <Flame className="w-4 h-4 text-rose-400" />,
      costScrap: 4,
      costParts: 0,
      hp: 300,
      desc: '铺设于地面必经之路，造成持续穿刺伤害并大幅减速敌人',
    },
  ];

  const currentStructures = structures.filter((s) => s.category === activeCategory);
  const currentSelected = structures.find((s) => s.type === selectedType) || structures[0];

  if (!isBuildMode) {
    return (
      <button
        onClick={() => {
          soundManager.playClick();
          onToggleBuildMode();
        }}
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-cyan-500/60 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all font-mono text-xs font-bold hover:scale-105 active:scale-95"
      >
        <Hammer className="w-4 h-4 text-cyan-400" />
        <span>建造工坊 [B]</span>
        <span className="text-[10px] text-amber-400/90 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/30">
          铺地板 / 造墙 / 设核心
        </span>
      </button>
    );
  }

  return (
    <div className="flex flex-col items-center select-none bg-slate-950/95 backdrop-blur-md p-2.5 rounded-2xl border border-cyan-500/60 shadow-[0_10px_35px_rgba(0,0,0,0.8)] animate-in fade-in slide-in-from-bottom-2 max-w-xl">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between w-full px-2 mb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-cyan-300 flex items-center gap-1.5">
            <Hammer className="w-4 h-4 text-cyan-400" />
            <span>领地与地表建造模式</span>
          </span>
          <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
            废铁: <strong className="text-amber-400">{playerScrap}</strong> · 零件: <strong className="text-cyan-400">{playerParts}</strong>
          </span>
        </div>

        <button
          onClick={() => {
            soundManager.playClick();
            onToggleBuildMode();
          }}
          className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded transition-colors"
          title="退出建造模式 [B]"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category Tabs: 地板 / 墙体 / 设施 */}
      <div className="flex items-center gap-1.5 w-full mb-2 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
        <button
          onClick={() => {
            soundManager.playClick();
            setActiveCategory('floor');
            onSelectType('wood_floor');
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg text-xs font-bold transition-all ${
            activeCategory === 'floor'
              ? 'bg-amber-500/20 text-amber-300 border border-amber-400/60 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Grid className="w-3.5 h-3.5" />
          <span>铺设地板 (木/石/铁)</span>
        </button>

        <button
          onClick={() => {
            soundManager.playClick();
            setActiveCategory('wall');
            onSelectType('iron_wall');
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg text-xs font-bold transition-all ${
            activeCategory === 'wall'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/60 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>墙体与门窗</span>
        </button>

        <button
          onClick={() => {
            soundManager.playClick();
            setActiveCategory('utility');
            onSelectType('storage_box');
          }}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg text-xs font-bold transition-all ${
            activeCategory === 'utility'
              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/60 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          <span>储物·制造·城防核心</span>
        </button>
      </div>

      {/* Structure Items Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5 w-full">
        {currentStructures.map((s) => {
          const isSelected = selectedType === s.type;
          const canAfford = playerScrap >= s.costScrap && playerParts >= s.costParts;

          return (
            <button
              key={s.type}
              onClick={() => {
                soundManager.playClick();
                onSelectType(s.type);
              }}
              className={`flex flex-col items-center p-2 rounded-xl border text-center transition-all ${
                isSelected
                  ? 'bg-cyan-950/80 border-cyan-400 text-white shadow-[0_0_15px_rgba(6,182,212,0.5)] scale-105'
                  : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:border-slate-700 hover:bg-slate-800/60'
              } ${!canAfford ? 'opacity-60' : ''}`}
            >
              <div className="mb-1 p-1 rounded-lg bg-slate-950/80 border border-slate-800">
                {s.icon}
              </div>
              <span className="text-[11px] font-bold line-clamp-1 leading-tight">{s.name}</span>
              <div className="flex items-center gap-1 text-[9px] font-mono mt-1 text-slate-400">
                <span className={playerScrap < s.costScrap ? 'text-rose-400' : 'text-amber-400'}>
                  铁:{s.costScrap}
                </span>
                {s.costParts > 0 && (
                  <span className={playerParts < s.costParts ? 'text-rose-400' : 'text-cyan-400'}>
                    件:{s.costParts}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Item Info Footnote */}
      <div className="flex items-center justify-between w-full px-2 mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 font-mono">
        <span className="text-slate-300">
          选中: <strong className="text-cyan-300">{currentSelected.name}</strong> (生命值 {currentSelected.hp})
        </span>
        <span className="text-amber-300/90">{currentSelected.desc}</span>
        <span className="text-slate-500">点击地面摆放 · [B] 退出</span>
      </div>
    </div>
  );
};
