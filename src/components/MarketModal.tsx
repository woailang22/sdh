import React, { useState } from 'react';
import { MarketItem } from '../types/game';
import { X, ShoppingBag, Coins, TrendingUp } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import { ItemIcon } from './ItemIcon';

interface MarketModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerCredits: number;
  playerShards: number;
  onBuyItem: (item: MarketItem, qty: number) => boolean;
  onSellItem: (item: MarketItem, qty: number) => boolean;
}

export const MarketModal: React.FC<MarketModalProps> = ({
  isOpen,
  onClose,
  playerCredits,
  playerShards,
  onBuyItem,
  onSellItem,
}) => {
  const [items, setItems] = useState<MarketItem[]>([
    {
      id: 'scrap',
      name: '优质精炼废铁',
      category: '物资',
      buyPrice: 15,
      sellPrice: 12,
      icon: '⚙️',
      stock: 350,
      description: '战前载具与重工业残骸切割出的结构钢材，工作台的核心基底材料。',
    },
    {
      id: 'ammo_box',
      name: '7.62mm 步枪弹药盒 (x60)',
      category: '装备',
      buyPrice: 80,
      sellPrice: 65,
      icon: '🎯',
      stock: 45,
      description: '全金属被甲穿透弹，对蚀体与恶瘴外壳具有高穿透与震慑效果。',
    },
    {
      id: 'medkit',
      name: '纳米急救喷雾包',
      category: '裂隙药剂',
      buyPrice: 120,
      sellPrice: 95,
      icon: '💉',
      stock: 20,
      description: '快速止血凝胶与皮下微针，点击使用恢复 60 点生命值。',
    },
    {
      id: 'food_ration',
      name: '战术高热量肉排 (x10)',
      category: '物资',
      buyPrice: 50,
      sellPrice: 40,
      icon: '🥩',
      stock: 80,
      description: '辐射净化真空浓缩军粮，点击食用恢复 35 点饱食。',
    },
    {
      id: 'rift_shard',
      name: '坍界紫晶原石',
      category: '稀有材料',
      buyPrice: 320,
      sellPrice: 280,
      icon: '💎',
      stock: 8,
      description: '从恶瘴魑体内凝结的高能量晶体，用于驱动高阶下锚发生器。',
    },
    { id: 'seed_corn', name: '玉米种子包', category: '物资', buyPrice: 60, sellPrice: 20, icon: '🌱', stock: 60, description: '农圩可种，连续收获，星露谷入门包。' },
    { id: 'ore_copper', name: '铜矿石 ×5', category: '物资', buyPrice: 150, sellPrice: 100, icon: '🟤', stock: 40, description: '铜镐升级材料，工具棚/矿场产出。' },
    { id: 'att_scope4x', name: '4倍战术瞄具', category: '装备', buyPrice: 400, sellPrice: 280, icon: '🔭', stock: 6, description: 'SVD/M4配件，三角洲摸金标配。' },
    { id: 'key_blue', name: '蓝色房卡', category: '稀有材料', buyPrice: 600, sellPrice: 450, icon: '🟦', stock: 3, description: '开加油站办公室/渔港小屋，内有高价值箱。' },
    { id: 'collect_mandel', name: '曼德尔砖', category: '稀有材料', buyPrice: 2000, sellPrice: 1500, icon: '🧱', stock: 1, description: '三角洲头号藏品，红区房卡房限定。' },
    { id: 'med_surgery', name: '野战手术包', category: '裂隙药剂', buyPrice: 300, sellPrice: 220, icon: '💉', stock: 5, description: '恢复100生命，BOSS战救命。' },
    { id: 'throw_frag', name: '破片手雷 ×2', category: '装备', buyPrice: 120, sellPrice: 80, icon: '💣', stock: 12, description: '范围300伤害，清群怪。' },
    { id: 'wine_starfruit', name: '星果酒', category: '稀有材料', buyPrice: 2250, sellPrice: 2250, icon: '🍷', stock: 2, description: '星果陈酿，毕业暴利，食用回40饱食+30生命。' },
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-cyan-500/50 shadow-[0_0_40px_rgba(6,182,212,0.3)] overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-950/80 border-b border-cyan-500/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/40">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                废土自由黑市交易所 <span className="text-xs font-mono text-cyan-400 font-normal">Market v3.2</span>
              </h2>
              <p className="text-xs text-slate-400">实时物资流转 · 全区商贩挂牌撮合交易</p>
            </div>
          </div>

          {/* User Wealth */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-amber-500/30 text-xs font-mono">
              <Coins className="w-4 h-4 text-amber-400" />
              <span className="text-amber-300 font-bold">{playerCredits}</span>
              <span className="text-slate-400">信用点</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-purple-500/30 text-xs font-mono">
              <span className="text-sm">💎</span>
              <span className="text-purple-300 font-bold">{playerShards}</span>
              <span className="text-slate-400">坍界晶石</span>
            </div>
            <button
              onClick={() => { soundManager.playClick(); onClose(); }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 hover:border-cyan-500/40 transition-all"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-slate-900 border border-cyan-500/30 flex items-center justify-center text-2xl shrink-0">
                  <ItemIcon id={item.id} emoji={item.icon} size={32} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-100 truncate">{item.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono">
                      {item.category}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{item.description}</p>
                  <div className="text-[11px] text-slate-500 mt-1 font-mono">
                    商栈库存: {item.stock} 件
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <button
                  onClick={() => {
                    if (playerCredits < item.buyPrice || item.stock <= 0) return;
                    const ok = onBuyItem(item, 1);
                    if (ok) {
                      soundManager.playLoot();
                      setItems((prev) =>
                        prev.map((x) => (x.id === item.id ? { ...x, stock: Math.max(0, x.stock - 1) } : x))
                      );
                    }
                  }}
                  disabled={playerCredits < item.buyPrice || item.stock <= 0}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold font-mono transition-all flex items-center gap-1 ${
                    playerCredits >= item.buyPrice && item.stock > 0
                      ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <span>购买</span>
                  <span>{item.buyPrice}点</span>
                </button>

                <button
                  onClick={() => {
                    onSellItem(item, 1);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 hover:border-amber-500/40 text-xs font-bold font-mono transition-all"
                >
                  出售 {item.sellPrice}点
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Footer Notice */}
        <div className="px-6 py-3 bg-slate-950/90 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            黑市行情指数稳定 · 废铁需求持续上涨 +8.4%
          </span>
          <span className="font-mono text-[11px]">下一轮物资补仓: 14分22秒</span>
        </div>
      </div>
    </div>
  );
};
