import React from 'react';
import { Item } from '../types/game';
import { soundManager } from '../audio/soundManager';
import { ItemIcon } from './ItemIcon';
import { RarityFrame } from './RarityFrame';

interface HotbarProps {
  slots: (Item | null)[];
  activeSlotIndex: number;
  ammo: { current: number; max: number; reserve: number };
  onSelectSlot: (index: number) => void;
  onUseItem: (index: number) => void;
}

export const Hotbar: React.FC<HotbarProps> = ({
  slots,
  activeSlotIndex,
  ammo,
  onSelectSlot,
  onUseItem,
}) => {
  return (
    <div className="flex flex-col items-center select-none">
      {/* Top Experience / Ammo Status Gauge */}
      <div className="flex items-center gap-2 mb-1.5 px-2">
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span className="text-cyan-400 font-bold">弹匣 / 备用:</span>
          <span className="text-amber-400 font-bold">
            {ammo.current} <span className="text-slate-500">/</span> {ammo.reserve}
          </span>
        </div>
        <div className="w-56 h-1.5 bg-slate-950 rounded-full overflow-hidden p-[0.5px] border border-cyan-500/40">
          <div
            className="h-full bg-gradient-to-r from-teal-500 via-cyan-400 to-amber-300 rounded-full transition-all duration-300"
            style={{ width: `${(ammo.current / ammo.max) * 100}%` }}
          />
        </div>
        <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[9px] font-mono text-slate-400">
          [R] 快速装填
        </span>
      </div>

      {/* 6-Slot Container */}
      <div className="flex flex-wrap justify-center items-center gap-1.5 p-1.5 rounded-xl bg-slate-950/85 backdrop-blur-md border border-cyan-500/40 shadow-[0_4px_24px_rgba(0,0,0,0.6)] max-w-[430px]">
        {slots.map((item, idx) => {
          const slotNum = idx + 1;
          const isActive = activeSlotIndex === slotNum;

          return (
            <div
              key={idx}
              onClick={() => {
                onSelectSlot(slotNum);
                // 消耗品：任意槽位的食物/药品点一下直接使用
                if (item && (item.category === 'food' || item.category === 'medical')) {
                  onUseItem(idx);
                }
              }}
              title={item ? `${item.name} (${item.desc || ''})` : `快捷槽位 ${slotNum}`}
              className={`relative w-12 h-12 rounded-lg border flex flex-col items-center justify-center cursor-pointer transition-all ${
                isActive
                  ? 'bg-slate-800/90 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)] ring-1 ring-amber-400 scale-105'
                  : 'bg-slate-900/70 border-slate-700/80 hover:border-cyan-500/50 hover:bg-slate-800/50'
              }`}
            >
              {/* Item Graphic Representation */}
              {item ? (
                <div className="flex flex-col items-center justify-center pointer-events-none">
                  <RarityFrame rarity={item.rarity} size={40}>
                    <ItemIcon id={item.id} emoji={item.icon} size={26} />
                  </RarityFrame>

                  {/* Quantity / Ammo count */}
                  {item.category === 'weapon' && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold text-amber-300 leading-none">
                      {ammo.current}
                    </span>
                  )}
                  {item.category === 'food' && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold text-emerald-400 leading-none">
                      x{item.count}
                    </span>
                  )}
                  {item.category === 'material' && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold text-slate-300 leading-none">
                      {item.count}
                    </span>
                  )}
                  {item.category === 'tool' && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold text-cyan-300 leading-none">
                      ∞
                    </span>
                  )}
                  {item.category === 'medical' && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold text-emerald-400 leading-none">
                      x{item.count}
                    </span>
                  )}
                  {item.category === 'armor' && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold text-sky-300 leading-none">
                      🛡
                    </span>
                  )}
                  {item.category === 'pack' && (
                    <span className="absolute bottom-1 right-1 text-[9px] font-mono font-bold text-violet-300 leading-none">
                      {item.id === 'pack_tactical' ? '+4' : '+2'}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-xs text-slate-600 font-mono">-</span>
              )}

              {/* Clean Slot Number Key Badge (1-6) */}
              <div className="absolute top-0.5 left-1 text-[9px] font-mono font-bold text-cyan-400/80">
                {slotNum}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
