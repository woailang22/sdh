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
describe('stardew crops/seeds/ores', () => {
  it('has 5 seeds, 6 crops, 4 ores with correct categories', async () => {
    const { ITEM_DEFS } = await import('./items');
    for (const id of ['seed_parsnip','seed_potato','seed_corn','seed_pumpkin','seed_starfruit']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('material');
    }
    expect(ITEM_DEFS['seed_parsnip'].rarity).toBe(1);
    expect(ITEM_DEFS['seed_potato'].rarity).toBe(1);
    expect(ITEM_DEFS['seed_corn'].rarity).toBe(2);
    expect(ITEM_DEFS['seed_pumpkin'].rarity).toBe(2);
    expect(ITEM_DEFS['seed_starfruit'].rarity).toBe(4);
    for (const id of ['crop_parsnip','crop_potato','crop_corn','crop_pumpkin','crop_starfruit','crop_blueberry']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('food');
    }
    for (const id of ['ore_copper','ore_silver','ore_gold','ore_iridium']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('material');
    }
    expect(ITEM_DEFS['ore_iridium'].rarity).toBe(5);
    expect(ITEM_DEFS['crop_starfruit'].sellPrice).toBeGreaterThan(ITEM_DEFS['crop_parsnip'].sellPrice);
  });
  it('seed loot maps to seed resource, crops to food, ores to parts', async () => {
    const { lootResourceOfNew } = await import('./items');
    expect(lootResourceOfNew('seed_parsnip')).toBe('seed');
    expect(lootResourceOfNew('crop_corn')).toBe('food');
    expect(lootResourceOfNew('ore_copper')).toBe('parts');
    expect(lootResourceOfNew('ore_iridium')).toBe('parts');
  });
  it('every seed has a workbench grow path (usefulness lock, no decoration seeds)', async () => {
    const { SEED_GROW, ITEM_DEFS } = await import('./items');
    for (const seed of ['seed_parsnip','seed_potato','seed_corn','seed_pumpkin','seed_starfruit']) {
      const g = SEED_GROW[seed];
      expect(g, `${seed} grow missing`).toBeDefined();
      expect(ITEM_DEFS[g.cropId]).toBeDefined();
      expect(ITEM_DEFS[g.cropId].category).toBe('food');
      expect(g.outCount).toBeGreaterThanOrEqual(2);
    }
    expect(SEED_GROW['seed_starfruit'].cropId).toBe('crop_starfruit');
  });
});
describe('stardew fish/artisan/cooking', () => {
  it('has 6 new fish, 5 artisan, 3 cooked with food values', async () => {
    const { ITEM_DEFS, FOOD_VALUE, lootResourceOfNew } = await import('./items');
    for (const id of ['fish_carp','fish_bass','fish_eel','fish_catfish','fish_legend','fish_crimson']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('food');
      expect(FOOD_VALUE[id]).toBeDefined();
    }
    for (const id of ['jam_berry','pickle_veg','cheese_goat','wine_starfruit','honey_wild']) {
      expect(ITEM_DEFS[id]).toBeDefined();
    }
    for (const id of ['cook_stirfry','cook_fishsoup','cook_energybar']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(FOOD_VALUE[id].satiety).toBeGreaterThanOrEqual(35);
    }
    expect(ITEM_DEFS['fish_legend'].rarity).toBe(5);
    expect(ITEM_DEFS['wine_starfruit'].sellPrice).toBeGreaterThan(ITEM_DEFS['crop_starfruit'].sellPrice);
    expect(lootResourceOfNew('fish_legend')).toBe('food');
    expect(lootResourceOfNew('wine_starfruit')).toBe('food');
  });
  it('every cooked/processed item has a material source (no decoration food)', async () => {
    const { COOK_SOURCE, ITEM_DEFS } = await import('./items');
    for (const id of ['cook_stirfry','cook_fishsoup','cook_energybar','jam_berry','pickle_veg','cheese_goat','wine_starfruit']) {
      const s = COOK_SOURCE[id];
      expect(s, `${id} source missing`).toBeDefined();
      expect(s.materials.length).toBeGreaterThanOrEqual(1);
      for (const m of s.materials) expect(ITEM_DEFS[m.itemId], `${id} needs ${m.itemId}`).toBeDefined();
    }
    expect(COOK_SOURCE['cook_fishsoup'].materials.some((m) => m.itemId === 'fish_bass')).toBe(true);
    expect(COOK_SOURCE['wine_starfruit'].materials.some((m) => m.itemId === 'crop_starfruit')).toBe(true);
  });
});
describe('delta ammo and guns', () => {
  it('has 5 ammo calibers and 7 guns with damage ladder', async () => {
    const { ITEM_DEFS, WEAPON_DAMAGE, lootResourceOfNew } = await import('./items');
    for (const id of ['ammo_556','ammo_762','ammo_9mm','ammo_shell','ammo_signal']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(lootResourceOfNew(id)).toBe('ammo');
    }
    expect(WEAPON_DAMAGE['wp_p1911']).toBe(38);
    expect(WEAPON_DAMAGE['wp_mp5']).toBe(52);
    expect(WEAPON_DAMAGE['wp_akm']).toBe(98);
    expect(WEAPON_DAMAGE['wp_m4a1']).toBe(110);
    expect(WEAPON_DAMAGE['wp_m870']).toBe(140);
    expect(WEAPON_DAMAGE['wp_svd']).toBe(220);
    expect(WEAPON_DAMAGE['wp_plasma']).toBe(320);
    expect(ITEM_DEFS['wp_svd'].rarity).toBe(5);
    expect(ITEM_DEFS['wp_p1911'].rarity).toBe(2);
  });
});
describe('delta armor/medical/throwable', () => {
  it('armor bonus ladder, med heal ladder, throw damage ladder', async () => {
    const { ITEM_DEFS, ARMOR_BONUS_TABLE, MED_HEAL, THROW_DAMAGE, lootResourceOfNew } = await import('./items');
    expect(ARMOR_BONUS_TABLE['helmet_t2']).toBe(15);
    expect(ARMOR_BONUS_TABLE['vest_t4']).toBe(80);
    expect(ARMOR_BONUS_TABLE['vest_t5']).toBe(110);
    expect(MED_HEAL['med_surgery']).toBe(100);
    expect(MED_HEAL['med_bloodbag']).toBe(80);
    expect(MED_HEAL['med_painkiller']).toBe(5);
    expect(THROW_DAMAGE['throw_frag']).toBe(300);
    expect(THROW_DAMAGE['throw_molly']).toBe(120);
    expect(ITEM_DEFS['helmet_t4']).toBeDefined();
    expect(ITEM_DEFS['helmet_t4'].category).toBe('armor');
    expect(ITEM_DEFS['med_surgery'].category).toBe('medical');
    expect(ITEM_DEFS['throw_frag'].category).toBe('tool');
    expect(lootResourceOfNew('vest_t4')).toBe('armor');
    expect(lootResourceOfNew('med_surgery')).toBe('medical');
    expect(lootResourceOfNew('throw_frag')).toBe('throwable');
  });
});
describe('delta attachments/keys/valuables', () => {
  it('has 4 attachments, 2 keycards, 4 valuables mapped to valuable', async () => {
    const { ITEM_DEFS, lootResourceOfNew, qualitySellPrice } = await import('./items');
    for (const id of ['att_scope4x','att_suppressor','att_extmag','att_foregrip']) {
      expect(ITEM_DEFS[id]).toBeDefined();
      expect(ITEM_DEFS[id].category).toBe('material');
      expect(lootResourceOfNew(id)).toBe('valuable');
    }
    expect(ITEM_DEFS['key_red']).toBeDefined();
    expect(ITEM_DEFS['key_red'].rarity).toBe(5);
    expect(lootResourceOfNew('key_red')).toBe('valuable');
    expect(lootResourceOfNew('collect_mandel')).toBe('valuable');
    expect(ITEM_DEFS['collect_mandel'].sellPrice).toBe(1500);
    expect(qualitySellPrice('collect_mandel', 0)).toBe(1500);
  });
});
describe('app wiring contract', () => {
  it('every weapon/armor/med/throw has damage/heal/shield entry', async () => {
    const { ITEM_DEFS, WEAPON_DAMAGE, ARMOR_BONUS_TABLE, MED_HEAL, THROW_DAMAGE, FOOD_VALUE } = await import('./items');
    for (const d of Object.values(ITEM_DEFS)) {
      if (d.category === 'weapon') expect(WEAPON_DAMAGE[d.id], d.id).toBeDefined();
      if (d.category === 'armor') expect(ARMOR_BONUS_TABLE[d.id] ?? ARMOR_BONUS_TABLE[d.id.replace('helmet_','helmet_').replace('vest_','vest_')], d.id).toBeDefined();
      if (d.category === 'medical') expect(MED_HEAL[d.id] ?? MED_HEAL[d.id.replace('med_','med_')], d.id).toBeDefined();
      if (d.id.startsWith('throw_')) expect(THROW_DAMAGE[d.id], d.id).toBeDefined();
      if (d.category === 'food') expect(FOOD_VALUE[d.id] ?? FOOD_VALUE[d.id.replace('crop_','crop_')], d.id).toBeDefined();
    }
  });
});
describe('item expansion finale', () => {
  it('registry has 85+ defs, rarities cover 1-5, no empty icons', async () => {
    const { ITEM_DEFS } = await import('./items');
    const ids = Object.keys(ITEM_DEFS);
    expect(ids.length).toBeGreaterThanOrEqual(85);
    const rarities = new Set(Object.values(ITEM_DEFS).map((d) => d.rarity));
    for (const r of [1,2,3,4,5]) expect(rarities.has(r as 1)).toBe(true);
    for (const d of Object.values(ITEM_DEFS)) {
      expect(d.icon.length).toBeGreaterThan(0);
      expect(d.maxCount).toBeGreaterThanOrEqual(1);
    }
  });
});
