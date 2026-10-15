import { describe, expect, it } from 'vitest';
import { ITEM_DEFS, getItemDef, makeItem, qualitySellPrice, WEAPON_DAMAGE, ARMOR_BONUS_TABLE, MED_HEAL } from './items';

const LEGACY_IDS = ['wood','stone','scrap','part','battery','iron_ore','fuel','food','fish','fish2','water','ammo','c4_explosive','thermite_charge','medkit','bandage','antidote','credits','shard','plasma','dark_core','blueprint','rifle','vest','box','pack_canvas','pack_tactical'];

describe('items registry skeleton', () => {
  it('contains all legacy ids with valid shape', () => {
    for (const id of LEGACY_IDS) {
      const d = ITEM_DEFS[id];
      expect(d, `${id} missing`).toBeDefined();
      expect(d.id).toBe(id);
      expect(d.name.length).toBeGreaterThan(1);
      expect(d.icon.length).toBeGreaterThan(0);
      expect(d.rarity).toBeGreaterThanOrEqual(1);
      expect(d.rarity).toBeLessThanOrEqual(5);
      expect(d.maxCount).toBeGreaterThanOrEqual(1);
      expect(d.buyPrice).toBeGreaterThanOrEqual(0);
      expect(d.sellPrice).toBeGreaterThanOrEqual(0);
    }
  });
  it('getItemDef throws on unknown id', () => {
    expect(() => getItemDef('no_such_item_xyz')).toThrow();
  });
  it('makeItem builds hotbar Item with count clamp', () => {
    const it1 = makeItem('bandage', 3);
    expect(it1.category).toBe('medical');
    expect(it1.count).toBe(3);
    expect(it1.maxCount).toBe(10);
    const it2 = makeItem('bandage', 999);
    expect(it2.count).toBe(10);
  });
  it('qualitySellPrice scales 0/1/2/3 = 1x/1.25x/1.5x/2x', () => {
    const base = getItemDef('fish').sellPrice;
    expect(qualitySellPrice('fish', 0)).toBe(base);
    expect(qualitySellPrice('fish', 1)).toBe(Math.floor(base * 1.25));
    expect(qualitySellPrice('fish', 2)).toBe(Math.floor(base * 1.5));
    expect(qualitySellPrice('fish', 3)).toBe(base * 2);
  });
  it('weapon/armor/med tables cover legacy gear', () => {
    expect(WEAPON_DAMAGE['rifle']).toBe(124);
    expect(ARMOR_BONUS_TABLE['armor_vest']).toBe(50);
    expect(ARMOR_BONUS_TABLE['armor_cloth']).toBe(25);
    expect(MED_HEAL['med_bandage']).toBe(30);
    expect(MED_HEAL['med_medkit']).toBe(60);
  });
});
