import React from 'react';
import { MarketItem } from '../types/game';
import { X, ShoppingBag, Coins, TrendingUp } from 'lucide-react';
import { soundManager } from '../audio/soundManager';
import { ItemIcon } from './ItemIcon';
import { MARKET_OFFERS, marketItem } from '../game/market';

const items = MARKET_OFFERS.map(marketItem);

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
                    公共补给点交易 · 数量与结算以实际携带物资为准
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <button
                  onClick={() => {
                    if (playerCredits < item.buyPrice || item.stock <= 0) return;
                    onBuyItem(item, 1);
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
            交易需要身处公共补给点，失败原因会显示提示
          </span>
          <span className="font-mono text-[11px]">服务器确认后更新物资</span>
        </div>
      </div>
    </div>
  );
};
