// src/game/death.test.ts
import { describe, expect, it } from 'vitest';
import { calcDeathDrop } from './death';

describe('calcDeathDrop', () => {
  it('wild drops 20 percent slots rounded up, camp keeps gear', () => {
    const slots = [1, 2, 3, 4, 5].map((n) => ({ slot: n }));
    const wild = calcDeathDrop(slots as any, 'town_ruins');
    expect(wild.droppedCount).toBe(1);
    expect(wild.keepEquipment).toBe(true);
    const camp = calcDeathDrop(slots as any, 'camp_plaza');
    expect(camp.droppedCount).toBe(0);
  });
});
