export const BASE_INVENTORY_SLOTS = 24;

export function inventoryCapacity(packId?: string | null): number {
  return BASE_INVENTORY_SLOTS + (packId === 'pack_tactical' ? 4 : packId === 'pack_canvas' ? 2 : 0);
}

/** Keep quick-slot positions; only move occupied extension slots when shrinking. */
export function resizeInventory<T>(slots: readonly (T | null)[], capacity: number): (T | null)[] | null {
  const result = slots.slice(0, capacity);
  while (result.length < capacity) result.push(null);
  for (const item of slots.slice(capacity)) {
    if (!item) continue;
    const empty = result.findIndex(slot => !slot);
    if (empty < 0) return null;
    result[empty] = item;
  }
  return result;
}

export function gatheringEffects(toolId = '') {
  const canMine = /pickaxe/.test(toolId), canFish = /rod/.test(toolId);
  return {
    wood: toolId === 'axe_stone' || toolId === 'stone_axe' ? 3 : 1,
    stone: canMine ? toolId === 'pickaxe_copper' ? 4 : 3 : 1,
    canMine, canFish,
  };
}

export function gatheringDescription(toolId: string): string | undefined {
  const effect = gatheringEffects(toolId);
  if (effect.canMine) return `每次采石 ${effect.stone}，可开采矿物；伐木无加成。`;
  if (effect.wood > 1) return `每次伐木 ${effect.wood}，采矿无加成。`;
  if (effect.canFish) return '可钓鱼，普通鱼每次 2 条；特殊鱼按水域产出。';
  return undefined;
}
