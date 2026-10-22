/** 个人营地实例：mapId = `home_<ownerPlayerId>`；模板为 `home_base`（SUBMAPS占位，不直接进入） */

/** 入口与出口共用南侧外围落点，距边界四格。 */
export function campExitPosition(size = 64): { x: number; y: number } {
  return { x: 0, y: size / 2 - 4 };
}

export function homeMapIdFor(playerId: string): string {
  return `home_${playerId}`;
}

export function isHomeMap(mapId: string): boolean {
  if (mapId === 'home_base') return false;
  return mapId.startsWith('home_') && mapId.length > 5;
}

/** 解析实例归属，模板与野外返回 null */
export function parseHomeOwner(mapId: string): string | null {
  if (!isHomeMap(mapId)) return null;
  const owner = mapId.slice(5);
  return owner.length > 0 ? owner : null;
}

/** 建造权限：个人营地内只有主人能建；野外/营地保持原规则（返回 true，具体配额由 App/Engine 再判） */
export function canBuildInHome(viewerId: string, mapId: string): boolean {
  const owner = parseHomeOwner(mapId);
  if (!owner) return true;
  return viewerId === owner;
}

/** 突袭权限：个人营地内访客可突袭主人建筑，主人不可突袭自己；野外沿用旧规则（返回 true） */
export function canRaidInHome(viewerId: string, mapId: string, targetOwnerId: string | undefined): boolean {
  const owner = parseHomeOwner(mapId);
  if (!owner) return true;
  if (!targetOwnerId) return false;
  if (viewerId === targetOwnerId) return false;
  return targetOwnerId === owner;
}
