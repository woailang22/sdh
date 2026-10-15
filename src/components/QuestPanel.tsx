import React, { useState } from 'react';
import { Footprints, ChevronDown, ChevronUp, Gift } from 'lucide-react';

export interface QuestStep {
  id: string;
  title: string;
  desc: string;
  progressText: string;
  done: boolean;
  rewardText?: string;
}

interface QuestPanelProps {
  steps: QuestStep[];
}

export const QuestPanel: React.FC<QuestPanelProps> = ({ steps }) => {
  const [collapsed, setCollapsed] = useState(false);
  const doneCount = steps.filter((s) => s.done).length;
  const currentIdx = steps.findIndex((s) => !s.done);
  const allDone = doneCount === steps.length;

  return (
    <div className="w-64 rounded-xl bg-slate-950/85 backdrop-blur-md border border-amber-500/40 shadow-lg select-none overflow-hidden">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-900/60 transition-colors"
      >
        <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
          <Footprints className="w-4 h-4" />
          新手引路 {allDone ? '· 毕业！' : `· ${doneCount}/${steps.length}`}
        </span>
        {collapsed ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronUp className="w-4 h-4 text-slate-400" />}
      </button>

      {!collapsed && (
        <div className="px-2.5 pb-2.5 flex flex-col gap-1 max-h-72 overflow-y-auto">
          {steps.map((s, idx) => {
            const isCurrent = idx === currentIdx;
            return (
              <div
                key={s.id}
                className={`px-2 py-1.5 rounded-lg border text-[11px] leading-tight transition-all ${
                  s.done
                    ? 'bg-emerald-950/40 border-emerald-600/30 text-emerald-300'
                    : isCurrent
                    ? 'bg-amber-950/50 border-amber-500/60 text-amber-100 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                    : 'bg-slate-900/50 border-slate-800 text-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold truncate">
                    {s.done ? '✓ ' : isCurrent ? '▶ ' : '🔒 '}
                    {s.title}
                  </span>
                  {!s.done && isCurrent && (
                    <span className="font-mono text-[10px] text-amber-300 shrink-0">{s.progressText}</span>
                  )}
                </div>
                {(s.done || isCurrent) && (
                  <div className="mt-0.5 text-[10px] opacity-80">{s.desc}</div>
                )}
                {(s.done || isCurrent) && s.rewardText && (
                  <div className="mt-0.5 text-[10px] font-mono text-emerald-300/90">🎁 {s.rewardText}</div>
                )}
              </div>
            );
          })}
          {allDone && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] text-emerald-300">
              <Gift className="w-3.5 h-3.5" />
              荒野求生入门完成！废土任你行。
            </div>
          )}
        </div>
      )}
    </div>
  );
};
