// src/game/death.ts
export interface DeathDrop { droppedIndexes: number[]; droppedCount: number; keepEquipment: boolean; clearReserveAmmo: boolean; }
const CAMP = ['camp_plaza', 'camp_workshop', 'camp_outskirts'];
export function calcDeathDrop(slots: unknown[], mapId: string): DeathDrop {
  if (CAMP.includes(String(mapId))) {
    return { droppedIndexes: [], droppedCount: 0, keepEquipment: true, clearReserveAmmo: false };
  }
  const filled = slots.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
  const n = Math.ceil(filled.length * 0.2);
  const picked = [...filled].sort((a, b) => a - b).slice(0, n);
  return { droppedIndexes: picked, droppedCount: picked.length, keepEquipment: true, clearReserveAmmo: true };
}
