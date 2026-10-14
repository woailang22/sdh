import React, { useState } from 'react';
import { BuildingEntity, RaidSupply } from '../types/game';
import { soundManager } from '../audio/soundManager';
import { ShieldAlert, Bomb, Flame, Zap, Wrench, Hammer, Trophy, CheckCircle2, AlertTriangle, X } from 'lucide-react';

interface RaidModalProps {
  door: BuildingEntity;
  onClose: () => void;
  onRaidAttempt: (supplyId: string, supplyName: string) => void;
  onClaimLoot: (loot: { name: string; count: number; icon: string }[]) => void;
}

export function RaidModal({ door, onClose, onRaidAttempt, onClaimLoot }: RaidModalProps) {
  const [selectedSupply, setSelectedSupply] = useState<string>('c4_explosive');
  const [isRaiding, setIsRaiding] = useState(false);
  const [raidLog, setRaidLog] = useState<string[]>([]);
  const [lootClaimed, setLootClaimed] = useState(false);

  // Available raid supplies (from scavenged wasteland loot)
  const raidSupplies: RaidSupply[] = [
    {
      id: 'c4_explosive',
      name: '高爆C4塑胶炸药',
      icon: '💣',
      count: 4,
      desc: '军用高聚合塑胶炸药。破坏力惊人，附带震撼爆破声响并拉响战区警报。',
      baseDamage: 900,
      critChance: 0.35,
      critMultiplier: 2.0,
      successRate: 0.88,
      stealthBonus: false,
    },
    {
      id: 'thermite_charge',
      name: '微型铝热熔切弹',
      icon: '🔥',
      count: 6,
      desc: '数千度超高温瞬间熔毁特种合金装甲铰链，穿透力极强。',
      baseDamage: 750,
      critChance: 0.28,
      critMultiplier: 1.85,
      successRate: 0.95,
      stealthBonus: false,
    },
    {
      id: 'emp_breacher',
      name: 'EMP脉冲电子解码器',
      icon: '⚡',
      count: 3,
      desc: '释放定向高能电磁脉冲过载电子锁死系统，具备高几率无声渗透。',
      baseDamage: 600,
      critChance: 0.40,
      critMultiplier: 2.2,
      successRate: 0.80,
      stealthBonus: true,
    },
    {
      id: 'plasma_torch',
      name: '工业等离子割炬',
      icon: '🛠️',
      count: 5,
      desc: '耗费高能电池与氩气，稳定切割钨钢防爆外框。',
      baseDamage: 550,
      critChance: 0.20,
      critMultiplier: 1.5,
      successRate: 0.98,
      stealthBonus: false,
    },
    {
      id: 'sapper_maul',
      name: '重工工兵气动破拆锤',
      icon: '🔨',
      count: 999,
      desc: '重装物理撞击工具。伤害中等，但无需消耗稀有弹药，可无限次攻门。',
      baseDamage: 220,
      critChance: 0.15,
      critMultiplier: 1.6,
      successRate: 1.0,
      stealthBonus: false,
    },
  ];

  const currentSupply = raidSupplies.find((s) => s.id === selectedSupply) || raidSupplies[0];
  const isBreached = door.hp <= 0;
  const hpPercent = Math.max(0, Math.min(100, Math.round((door.hp / door.maxHp) * 100)));

  const handleExecuteRaid = () => {
    if (isBreached || isRaiding) return;
    setIsRaiding(true);
    soundManager.playGunshot();

    setTimeout(() => {
      onRaidAttempt(currentSupply.id, currentSupply.name);
      setIsRaiding(false);
      setRaidLog((prev) => [
        `【${new Date().toLocaleTimeString('zh-CN')}】使用 [${currentSupply.name}] 突袭！装甲遭到重击！`,
        ...prev.slice(0, 4),
      ]);
    }, 450);
  };

  const handleClaim = () => {
    if (lootClaimed) return;
    setLootClaimed(true);
    soundManager.playLoot();
    const spoils = door.storedLoot || [
      { name: '坍界暗物质晶核', count: 18, icon: '💎' },
      { name: '军用钛合金复合装甲板', count: 8, icon: '🛡️' },
      { name: '废土高级信用点', count: 2500, icon: '💰' },
    ];
    onClaimLoot(spoils);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-red-500/40 rounded-xl shadow-2xl shadow-red-950/50 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-950/80 via-slate-900 to-slate-900 px-6 py-4 border-b border-red-500/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-red-500/20 rounded-lg text-red-400 border border-red-500/40">
              <ShieldAlert className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-100 tracking-wide">领地安全门 · 突袭攻防系统</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-900/60 text-red-300 border border-red-700/50">
                  {isBreached ? '已攻破瓦解' : '战术突袭中'}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                目标所有者: <span className="text-cyan-300 font-medium">{door.ownerName || '未知势力'}</span> · 区域: {door.mapId?.toUpperCase()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-5">
          {/* Target Door Status Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="font-semibold text-slate-200 flex items-center gap-2">
                🛡️ {door.name}
              </span>
              <span className="font-mono text-xs text-slate-400">
                剩余耐久: <strong className={isBreached ? 'text-red-400' : 'text-cyan-400'}>{door.hp}</strong> / {door.maxHp}
              </span>
            </div>

            {/* Health Bar */}
            <div className="w-full bg-slate-800/80 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isBreached
                    ? 'bg-red-500'
                    : hpPercent > 50
                    ? 'bg-gradient-to-r from-emerald-500 to-cyan-500'
                    : hpPercent > 20
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-red-500 animate-pulse'
                }`}
                style={{ width: `${hpPercent}%` }}
              />
            </div>

            <div className="flex justify-between text-xs text-slate-400">
              <span>防爆等级: 钨钢复合装甲 II级</span>
              <span>{isBreached ? '安全门防爆结构已完全破损！' : `装甲完整率: ${hpPercent}%`}</span>
            </div>
          </div>

          {/* If Breached: Show Victory Spoils Container */}
          {isBreached ? (
            <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-lg p-5 space-y-4 animate-in zoom-in-95 duration-200">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-base">
                <Trophy className="w-5 h-5" />
                <span>🎉 领地安全门已成功攻破！战利品储藏库已解锁！</span>
              </div>
              <p className="text-xs text-slate-300">
                敌方防卫设施已被彻底摧毁，您发现了领地内部隐藏的保密储物箱物资：
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {(door.storedLoot || [
                  { name: '坍界暗物质晶核', count: 18, icon: '💎' },
                  { name: '军用钛合金装甲板', count: 8, icon: '🛡️' },
                  { name: '高聚合爆破装药', count: 4, icon: '💣' },
                  { name: '废土高级信用点', count: 2500, icon: '💰' },
                ]).map((item, i) => (
                  <div
                    key={i}
                    className="bg-slate-900/90 border border-emerald-500/30 rounded p-2.5 flex items-center gap-2.5"
                  >
                    <span className="text-2xl">{item.icon}</span>
                    <div className="text-xs">
                      <div className="font-semibold text-slate-100">{item.name}</div>
                      <div className="text-emerald-400 font-mono">+{item.count}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  disabled={lootClaimed}
                  onClick={handleClaim}
                  className={`px-6 py-2.5 rounded-lg font-bold text-sm shadow-lg flex items-center gap-2 transition-all ${
                    lootClaimed
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/50'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {lootClaimed ? '已装入行囊' : '掠夺全部战利品并装入背包'}
                </button>
              </div>
            </div>
          ) : (
            /* Choose Raid Supply Tools */
            <div className="space-y-3">
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>选择用于突袭破门的搜刮物资:</span>
                <span className="text-amber-400 text-[11px] flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" /> 存在暴击破损与哑火随机概率
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {raidSupplies.map((supply) => {
                  const isSelected = selectedSupply === supply.id;
                  return (
                    <button
                      key={supply.id}
                      onClick={() => setSelectedSupply(supply.id)}
                      className={`text-left p-3 rounded-lg border transition-all flex flex-col justify-between ${
                        isSelected
                          ? 'bg-red-950/40 border-red-500/80 shadow-md shadow-red-950/50'
                          : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <div className="flex items-center gap-2 font-semibold text-sm text-slate-100">
                          <span className="text-xl">{supply.icon}</span>
                          <span>{supply.name}</span>
                        </div>
                        <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                          存量: {supply.count}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">{supply.desc}</p>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-1.5 w-full font-mono">
                        <span>破坏力: <strong className="text-amber-400">{supply.baseDamage}</strong></span>
                        <span>暴击几率: <strong className="text-rose-400">{(supply.critChance * 100).toFixed(0)}%</strong></span>
                        <span>成功率: <strong className="text-emerald-400">{(supply.successRate * 100).toFixed(0)}%</strong></span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Raid Action Execution */}
          {!isBreached && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                当前破拆方式: <span className="text-red-400 font-semibold">{currentSupply.name}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
                >
                  撤出突袭
                </button>
                <button
                  disabled={isRaiding}
                  onClick={handleExecuteRaid}
                  className={`px-6 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 text-white shadow-lg transition-all ${
                    isRaiding
                      ? 'bg-red-800 opacity-60 cursor-wait'
                      : 'bg-red-600 hover:bg-red-500 shadow-red-950/60 active:scale-95'
                  }`}
                >
                  <Bomb className={`w-4 h-4 ${isRaiding ? 'animate-spin' : ''}`} />
                  {isRaiding ? '正在安放并起爆...' : '执行突袭破拆攻击'}
                </button>
              </div>
            </div>
          )}

          {/* Combat Log */}
          {raidLog.length > 0 && (
            <div className="bg-black/50 border border-slate-800/80 rounded p-2.5 text-[11px] font-mono text-slate-400 space-y-1">
              <div className="text-slate-500 font-bold mb-1">【破拆作战记录】</div>
              {raidLog.map((log, idx) => (
                <div key={idx} className="text-amber-300/90">{log}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
