import type { MapZoneId } from '../types/game';

/** 营地中立3图：永远不敌对、不允许PvP、不允许拆他人建筑 */
const CAMP_MAPS: ReadonlySet<MapZoneId> = new Set(['camp_plaza', 'camp_workshop', 'camp_outskirts']);

export function isCampMap(mapId: MapZoneId): boolean {
  return CAMP_MAPS.has(mapId);
}

/** 无主/系统/遗迹视为中立布景，不敌对 */
function isNeutralOwner(ownerId?: string): boolean {
  if (!ownerId) return true;
  if (ownerId === 'system') return true;
  if (ownerId === '废土遗迹') return true;
  if (ownerId === '恒界开拓团') return true;
  if (ownerId === '遗落先锋') return true;
  return false;
}

/** 野外异ID即敌对；营地永远不敌对；个人营地内只对实例主人敌对；同ID不敌对；中立布景不敌对 */
export function isHostile(viewerId: string, ownerId: string | undefined, mapId: MapZoneId): boolean {
  if (!ownerId) return false;
  if (viewerId === ownerId) return false;
  if (isNeutralOwner(ownerId)) return false;
  if (isCampMap(mapId)) return false;
  const homeOwner = parseHomeOwnerId(String(mapId));
  if (homeOwner) {
    return ownerId === homeOwner;
  }
  return true;
}

/** 门操作：只有 owner 本人能直接开关；其余一律走突袭 */
export function canOperateDoor(viewerId: string, b: { ownerId?: string; type: string }): boolean {
  if (b.type !== 'door' && b.type !== 'safe_door') return false;
  return !!b.ownerId && b.ownerId === viewerId;
}

/** 建筑伤害：公共营地一律不允许；个人营地内只允许打实例主人建筑；野外只允许打敌对；自己/中立不允许 */
export function canDamageBuilding(viewerId: string, ownerId: string | undefined, mapId: MapZoneId): boolean {
  if (isCampMap(mapId)) return false;
  if (!ownerId) return false;
  if (viewerId === ownerId) return false;
  if (isNeutralOwner(ownerId)) return false;
  const homeOwner = parseHomeOwnerId(String(mapId));
  if (homeOwner) {
    return ownerId === homeOwner;
  }
  return true;
}

/** 野箱可搜：无主/遗迹/系统可搜；玩家箱只允许主人搜（敌方箱靠破门后解锁搜） */
export function canLootBox(viewerId: string, ownerId?: string): boolean {
  if (!ownerId) return true;
  if (isNeutralOwner(ownerId)) return true;
  return viewerId === ownerId;
}

/** 个人营地实例归属：`home_<ownerId>` 解析，模板与非实例返回 null */
export function parseHomeOwnerId(mapId: string): string | null {
  if (mapId === 'home_base') return null;
  if (!mapId.startsWith('home_')) return null;
  const owner = mapId.slice(5);
  return owner.length > 0 ? owner : null;
}
