import React, { useEffect, useState } from 'react';
import { Flag, X } from 'lucide-react';
import type { CampSummary } from '../../server/worldState';
import type { BuildingEntity, Item, MapZoneId } from '../types/game';
import { ITEM_DEFS } from '../game/items';
import { CRAFT_RECIPES } from '../game/crafting';

interface CampPanelProps {
  isOpen: boolean;
  onClose: () => void;
  camps: CampSummary[];
  campId: string | null;
  currentMapId: MapZoneId;
  playerPos: { x: number; y: number };
  selfId: string;
  resources: Record<string, number>;
  inventory: (Item | null)[];
  building?: BuildingEntity | null;
  loot?: { id: string; name: string; items: { itemId: string; name: string; count: number }[] } | null;
  reports?: { text: string; timestamp: number }[];
  blueprints?: string[];
  onAction: (action: string, payload?: Record<string, unknown>) => void;
  onNavigate: (x: number, y: number, name: string) => void;
}

const buttonClass = 'rounded border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed';
const resourceItemIds: Record<string, string> = { wood: 'wood', stone: 'stone', scrap: 'scrap', parts: 'part', ammo: 'ammo', c4: 'c4_explosive', credits: 'credits', shard: 'shard' };

export function CampPanel({ isOpen, onClose, camps, campId, currentMapId, playerPos, selfId, resources, inventory, building, loot, reports = [], blueprints = [], onAction, onNavigate }: CampPanelProps) {
  const [confirmSite, setConfirmSite] = useState<{ x: number; y: number } | null>(null);
  const [quantity, setQuantity] = useState<'1' | '10' | 'all'>('1');
  const [memberId, setMemberId] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const job = building?.production;
  useEffect(() => {
    if (!isOpen || !job) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isOpen, job?.readyAt]);
  if (!isOpen) return null;
  const inside = currentMapId.startsWith('home_');
  const ownCamp = camps.find(camp => camp.id === campId || camp.ownerId === selfId);
  const currentCamp = camps.find(camp => camp.id === currentMapId);
  const friendly = !!currentCamp && (currentCamp.ownerId === selfId || currentCamp.members?.includes(selfId));
  const nearby = (target: { x: number; y: number }) => Math.hypot(playerPos.x - target.x, playerPos.y - target.y) <= 3;
  const canExit = inside && nearby({ x: 0, y: 28 });
  const affordable = (resources.wood || 0) >= 20 && (resources.stone || 0) >= 10;
  const ownedBuilding = building?.ownerId === selfId;
  const canUseBuilding = ownedBuilding || friendly && building?.ownerId === currentCamp?.ownerId;
  const buildingNear = !!building && building.mapId === currentMapId && nearby(building);
  const canRepair = buildingNear && canUseBuilding && building.hp < building.maxHp && (resources.wood || 0) >= 2 && (resources.stone || 0) >= 2 && (resources.scrap || 0) >= 1;
  const turretAmmo = (building as (BuildingEntity & { ammo?: number }) | null)?.ammo ?? 0;
  const carried = new Map<string, { itemId: string; name: string; count: number }>();
  Object.entries(resourceItemIds).forEach(([key, itemId]) => {
    if ((resources[key] || 0) > 0) carried.set(itemId, { itemId, name: ITEM_DEFS[itemId]?.name || itemId, count: resources[key] });
  });
  inventory.forEach(item => {
    if (!item || Object.values(resourceItemIds).includes(item.id) || item.id.startsWith('ammo_')) return;
    const previous = carried.get(item.id);
    carried.set(item.id, { itemId: item.id, name: item.name, count: (previous?.count || 0) + item.count });
  });
  const availableRecipes = CRAFT_RECIPES.filter(recipe => building?.type === 'farm_plot' ? recipe.id.startsWith('grow_') : building?.type === 'furnace' ? recipe.id.startsWith('smelt_') : building?.type === 'campfire' && recipe.category === '食物加工');
  const recipe = availableRecipes.find(entry => entry.id === selectedRecipe) || availableRecipes[0];
  const recipeCost = recipe ? [recipe.cost.wood && `木材 ${recipe.cost.wood}`, recipe.cost.stone && `石料 ${recipe.cost.stone}`, recipe.cost.scrap && `废铁 ${recipe.cost.scrap}`, recipe.cost.parts && `零件 ${recipe.cost.parts}`, ...(recipe.cost.extra || []).map(cost => `${ITEM_DEFS[cost.itemId]?.name || cost.itemId} ${cost.count}`)].filter(Boolean).join(' / ') : '';
  const recipeAffordable = !!recipe && ['wood', 'stone', 'scrap', 'parts'].every(key => (resources[key] || 0) >= recipe.cost[key as 'wood' | 'stone' | 'scrap' | 'parts']) && (recipe.cost.extra || []).every(cost => (carried.get(cost.itemId)?.count || 0) >= cost.count);
  const coreOwner = ownedBuilding && building?.type === 'anchor_core' && currentCamp?.ownerId === selfId;
  const level = currentCamp?.level || 1;
  const upgradeCost = level === 1 ? { stone: 60, scrap: 40, parts: 5, size: 96 } : { stone: 120, scrap: 80, parts: 10, size: 128 };
  const canUpgrade = buildingNear && !!building && building.hp > 0 && level < 3 && Object.entries(upgradeCost).filter(([key]) => key !== 'size').every(([key, count]) => (resources[key] || 0) >= count);
  const productionSeconds = job ? Math.max(0, Math.ceil((job.readyAt - now) / 1000)) : 0;
  const canResearch = !blueprints.includes('wp_plasma') && (carried.get('blueprint')?.count || 0) >= 1 && (resources.parts || 0) >= 3 && (resources.scrap || 0) >= 10;
  const transfer = (action: 'deposit' | 'withdraw', targetId: string, itemId: string, available: number) => {
    onAction(action, { targetId, itemId, count: quantity === 'all' ? available : Math.min(Number(quantity), available) });
  };
  const currentLoot = loot && (loot.id === building?.id || loot.id.startsWith('drop_')) ? loot : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3">
      <div role="dialog" aria-modal="true" aria-label="营地管理" className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-amber-700/50 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-amber-950/20 px-5 py-4">
          <div className="flex items-center gap-3"><Flag className="h-6 w-6 text-amber-400" /><div><h2 className="font-bold text-slate-100">营地 · 建设与守备</h2><p className="text-xs text-slate-400">探索采集 → 野外建营 → 建造储物与防御 → 守备和攻营</p></div></div>
          <button onClick={onClose} aria-label="关闭营地面板" className="p-2 text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 overflow-y-auto p-5 text-sm text-slate-300">
          <p className="text-xs text-amber-300">营地全天可被攻击，主人离线时防御仍运行。炮塔必须装入真实弹药；仓库只保存实际存入的物资。</p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400"><span>我的行者 ID：</span><code className="break-all text-cyan-200">{selfId}</code><button className={buttonClass} onClick={() => { void navigator.clipboard?.writeText(selfId); }}>复制 ID</button></div>
          {!inside && !campId && !ownCamp && <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
            <h3 className="font-semibold text-slate-100">尚未建立营地</h3>
            <p className="text-xs text-slate-400">在公共野外选址，花费木材 20、石料 10。避开道路、水域、避难点、地标与其他营地；最终选址由服务器检查。</p>
            <p className="text-xs">携带木材 {resources.wood || 0} / 20 · 石料 {resources.stone || 0} / 10</p>
            {!confirmSite ? <button className={buttonClass} disabled={currentMapId !== 'world' || !affordable} onClick={() => setConfirmSite({ x: Math.round(playerPos.x), y: Math.round(playerPos.y) })}>在脚下插旗建营</button> : <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>确认入口位置 ({confirmSite.x}, {confirmSite.y})，消耗木材 20 / 石料 10？</span>
              <button className={buttonClass} disabled={!affordable || currentMapId !== 'world' || !nearby(confirmSite)} onClick={() => { onAction('create_camp', confirmSite); setConfirmSite(null); }}>确认建立</button>
              <button className={buttonClass} onClick={() => setConfirmSite(null)}>取消</button>
            </div>}
          </section>}
          {inside ? <section className="space-y-2 rounded-lg border border-cyan-800/50 bg-slate-950/60 p-4">
            <h3 className="font-semibold text-slate-100">{currentMapId === campId ? '自己的营地' : '其他行者的营地'}</h3>
            {currentCamp && <p className="text-xs text-slate-400">等级 {currentCamp.level || 1} · 规模 {currentCamp.size || 64} × {currentCamp.size || 64} · {currentCamp.state === 'breached' ? '核心已损坏，等待修复' : '营地运行中'}{friendly && currentCamp.ownerId !== selfId && ' · 你是授权成员'}</p>}
            <p className="text-xs text-slate-400">沿营地内部步行到南侧出口 (0, 28)，靠近 3 格以内才能返回公共野外。</p>
            <div className="flex gap-2"><button className={buttonClass} onClick={() => { onNavigate(0, 28, '营地南侧出口'); onClose(); }}>标记出口</button><button className={buttonClass} disabled={!canExit} onClick={() => onAction('leave_camp')}>离开营地</button></div>
          </section> : <section className="space-y-2">
            <h3 className="font-semibold text-slate-100">{ownCamp ? '营地入口与已发现线索' : '已发现的营地入口'}</h3>
            {camps.length === 0 && <p className="text-xs text-slate-500">附近没有已发现的营地，继续在野外探索。</p>}
            {[...camps].sort((a, b) => Number(b.ownerId === selfId) - Number(a.ownerId === selfId)).map(camp => <div key={camp.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
              <div><strong className="text-slate-200">{camp.ownerId === selfId ? '我的营地' : `${camp.ownerName} 的营地`}</strong><p className="mt-1 text-xs text-slate-400">入口 ({camp.x}, {camp.y}){camp.ownerId !== selfId && !camp.members?.includes(selfId) && ' · 全天可攻营'}</p></div>
              <div className="flex gap-2"><button className={buttonClass} disabled={currentMapId !== 'world'} onClick={() => { onNavigate(camp.x, camp.y, `${camp.ownerName} 的营地`); onClose(); }}>标记入口</button><button className={buttonClass} disabled={currentMapId !== 'world' || !nearby(camp)} onClick={() => onAction('enter_camp', { campId: camp.id })}>{camp.ownerId === selfId || camp.members?.includes(selfId) ? '进入营地' : '进入攻营'}</button></div>
            </div>)}
            <p className="text-xs text-slate-500">先步行抵达入口，再靠近进入。名单不提供传送。</p>
          </section>}
          {inside && building && <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4">
            <div className="flex justify-between gap-2"><h3 className="font-semibold text-slate-100">{building.name}</h3><span className="font-mono text-xs">耐久 {building.hp}/{building.maxHp}</span></div>
            {!buildingNear && <p className="text-xs text-amber-300">请靠近建筑后操作，墙体遮挡由服务器检查。</p>}
            {canUseBuilding && <button className={buttonClass} disabled={!canRepair} onClick={() => onAction('repair', { targetId: building.id })}>修复 +200 · 木材 2 / 石料 2 / 废铁 1</button>}
            {coreOwner && <div className="space-y-3 border-t border-slate-800 pt-3">
              <p className="text-xs">营地规模随核心升级：64 → 96 → 128。修复核心后可继续升级；授权只允许成员使用设施，建造与成员管理由营地主人操作。</p>
              {level < 3 ? <button className={buttonClass} disabled={!canUpgrade} onClick={() => onAction('upgrade_camp')}>升级营地至 {upgradeCost.size} × {upgradeCost.size} · 石料 {upgradeCost.stone} / 废铁 {upgradeCost.scrap} / 零件 {upgradeCost.parts}</button> : <p className="text-xs text-cyan-300">已达到营地最高等级。</p>}
              <label className="block space-y-2 text-xs"><span>授权成员的完整行者 ID</span><input value={memberId} onChange={event => setMemberId(event.target.value)} placeholder="由对方复制并提供完整 ID" className="block w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100" /></label>
              <button className={buttonClass} disabled={!buildingNear || building.hp <= 0 || !memberId.trim() || memberId.trim() === selfId || currentCamp?.members?.includes(memberId.trim()) || (currentCamp?.members?.length || 0) >= 8} onClick={() => { onAction('authorize_member', { playerId: memberId.trim() }); setMemberId(''); }}>授权成员（最多 8 人）</button>
            </div>}
            {building.type === 'bed' && canUseBuilding && <div className="space-y-2"><p className="text-xs text-slate-400">脱离战斗后休息恢复 20 生命，冷却 10 秒。休息不补充饱食，具体状态由服务器检查。</p><button className={buttonClass} disabled={!buildingNear || building.hp <= 0} onClick={() => onAction('rest', { targetId: building.id })}>休息恢复生命</button></div>}
            {availableRecipes.length > 0 && canUseBuilding && <div className="space-y-2 border-t border-slate-800 pt-3">
              {job ? <><p className="text-xs text-cyan-200">{ITEM_DEFS[job.resultItemId]?.name || job.resultItemId} ×{job.resultCount} · {productionSeconds > 0 ? `剩余约 ${productionSeconds} 秒` : '等待领取，完成状态由服务器确认'}</p><button className={buttonClass} disabled={!buildingNear || building.hp <= 0 || productionSeconds > 0} onClick={() => onAction('collect_production', { targetId: building.id })}>领取产物</button></> : <>
                <label className="block space-y-2 text-xs"><span>生产配方</span><select value={recipe?.id || ''} onChange={event => setSelectedRecipe(event.target.value)} className="block w-full rounded border border-slate-700 bg-slate-900 px-3 py-2 text-slate-100">{availableRecipes.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
                <p className="text-xs text-slate-400">消耗：{recipeCost} · 预计 {building.type === 'farm_plot' ? 60 : 20} 秒，开始时扣除材料</p>
                <button className={buttonClass} disabled={!buildingNear || building.hp <= 0 || !recipeAffordable} onClick={() => onAction('start_production', { targetId: building.id, recipeId: recipe.id })}>开始生产</button>
              </>}
            </div>}
            {building.type === 'research_table' && canUseBuilding && <div className="space-y-2"><p className="text-xs text-slate-400">消耗蓝图 1、零件 3、废铁 10，永久解锁等离子步枪配方；在工作台制造时仍需支付配方材料。</p><button className={buttonClass} disabled={!buildingNear || building.hp <= 0 || !canResearch} onClick={() => onAction('research', { targetId: building.id })}>{blueprints.includes('wp_plasma') ? '已解锁等离子步枪' : '研究等离子步枪蓝图'}</button></div>}
            {building.type === 'turret' && <div className="space-y-2"><p className="text-xs">炮塔弹药：{turretAmmo} / 500 · 携带弹药 {resources.ammo || 0}</p>{canUseBuilding && <button className={buttonClass} disabled={!buildingNear || building.hp <= 0 || (resources.ammo || 0) < 10 || turretAmmo > 490} onClick={() => onAction('load_turret', { targetId: building.id, count: 10 })}>装填 10 发</button>}</div>}
            {building.type === 'storage_box' && <>
              <button className={buttonClass} disabled={!buildingNear || !canUseBuilding && building.hp > 0} onClick={() => onAction('search', { targetId: building.id })}>查看仓库物资</button>
              {canUseBuilding && building.hp > 0 && <div className="space-y-2"><p className="text-xs font-semibold">携带物资 · 存入仓库</p>{[...carried.values()].map(item => <div key={item.itemId} className="flex items-center justify-between gap-2 text-xs"><span>{item.name} ×{item.count}</span><button className={buttonClass} disabled={!buildingNear} onClick={() => transfer('deposit', building.id, item.itemId, item.count)}>存入</button></div>)}{carried.size === 0 && <p className="text-xs text-slate-500">没有可存入的物资。</p>}</div>}
            </>}
          </section>}
          {(building?.type === 'storage_box' || currentLoot) && <div className="flex items-center gap-2 text-xs"><span>操作数量</span>{(['1', '10', 'all'] as const).map(value => <button key={value} aria-pressed={quantity === value} className={`${buttonClass} ${quantity === value ? '!border-cyan-500 !text-cyan-200' : ''}`} onClick={() => setQuantity(value)}>{value === 'all' ? '全部' : value}</button>)}</div>}
          {currentLoot && <section className="space-y-2 rounded-lg border border-emerald-800/50 bg-slate-950/60 p-4"><h3 className="font-semibold text-slate-100">{currentLoot.name} · 实存物资</h3>
            {currentLoot.items.length === 0 && <p className="text-xs text-slate-500">容器为空。</p>}
            {currentLoot.items.map(item => <div key={item.itemId} className="flex items-center justify-between gap-2 text-xs"><span>{item.name} ×{item.count}</span><button className={buttonClass} disabled={item.count <= 0 || (currentLoot.id === building?.id && (!buildingNear || !canUseBuilding && building.hp > 0))} onClick={() => currentLoot.id.startsWith('drop_') ? onAction('take_loot', { targetId: currentLoot.id, itemId: item.itemId, count: quantity === 'all' ? item.count : Math.min(Number(quantity), item.count) }) : transfer('withdraw', currentLoot.id, item.itemId, item.count)}>取出</button></div>)}
          </section>}
          {inside && friendly && <section className="space-y-2 border-t border-slate-800 pt-3"><h3 className="font-semibold text-slate-100">营地授权成员</h3>{!currentCamp?.members?.length && <p className="text-xs text-slate-500">尚无授权成员。</p>}{currentCamp?.members?.map(id => <div key={id} className="flex flex-wrap items-center justify-between gap-2 text-xs"><code className="break-all text-cyan-200">{id}</code>{coreOwner && <button className={buttonClass} disabled={!buildingNear || !building || building.hp <= 0} onClick={() => onAction('revoke_member', { playerId: id })}>撤销授权</button>}</div>)}</section>}
          <section className="space-y-2 border-t border-slate-800 pt-3"><h3 className="font-semibold text-slate-100">已解锁蓝图</h3><p className="text-xs text-slate-400">{blueprints.length ? blueprints.map(id => ITEM_DEFS[id]?.name || id).join('、') : '尚无已研究蓝图。'}</p></section>
          <section className="space-y-2 border-t border-slate-800 pt-3"><h3 className="font-semibold text-slate-100">营地战报</h3>{reports.length === 0 ? <p className="text-xs text-slate-500">暂无战报。</p> : reports.map((report, index) => <p key={`${report.timestamp}-${index}`} className="text-xs text-slate-400"><time className="mr-2 text-slate-500">{new Date(report.timestamp).toLocaleString('zh-CN')}</time>{report.text}</p>)}</section>
        </div>
      </div>
    </div>
  );
}
