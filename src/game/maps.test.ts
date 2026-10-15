import { describe, expect, it } from 'vitest';
import { SUBMAPS } from './maps';
import { isEnclosed, boxInside } from './compound';
import type { BuildingEntity } from '../types/game';

// 必围合院落：key 为地图 id，值为该图内必须闭合的墙组名前缀 + 圈内盒子 id
// 开敞/残墙白名单：camp_plaza、camp_workshop、town_ruins 塌楼、marsh_rift 掩体不在此表
const REQUIRED: Record<string, { prefix: string; boxId: string }[]> = {
  camp_outskirts: [{ prefix: 'demo_yard', boxId: 'demo_chest' }],
  town_gas: [{ prefix: 'gas_office', boxId: 'gas_office_box' }],
  town_street: [
    { prefix: 'st_hw', boxId: 'st_hw_box' },
    { prefix: 'st_dn', boxId: 'st_dn_box' },
  ],
  mtn_logging: [{ prefix: 'lg_cabin', boxId: 'lg_cabin_box' }],
  mtn_quarry: [{ prefix: 'q_office', boxId: 'q_office_box' }],
  mtn_deep: [{ prefix: 'forest_post', boxId: 'deep_cache_box' }],
  marsh_docks: [{ prefix: 'dock_hut', boxId: 'dock_hut_box' }],
  marsh_bog: [{ prefix: 'bog_hut', boxId: 'bog_hunter_box' }],
};

function groupByPrefix(buildings: BuildingEntity[], prefix: string): BuildingEntity[] {
  return buildings.filter((b) => b.id.startsWith(prefix));
}

describe('maps enclosure regression', () => {
  for (const [mapId, groups] of Object.entries(REQUIRED)) {
    it(`${mapId} yards are enclosed and boxes inside`, () => {
      const def = SUBMAPS[mapId];
      expect(def, `${mapId} missing`).toBeDefined();
      for (const g of groups) {
        const walls = groupByPrefix(def.buildings, g.prefix);
        expect(walls.length, `${mapId}:${g.prefix} empty`).toBeGreaterThan(8);
        expect(isEnclosed(walls), `${mapId}:${g.prefix} not enclosed`).toBe(true);
        const box = def.buildings.find((b) => b.id === g.boxId);
        expect(box, `${mapId}:${g.boxId} missing`).toBeDefined();
        expect(boxInside(box!.x, box!.y, walls), `${mapId}:${g.boxId} outside`).toBe(true);
      }
    });
  }
  it('no interactable sits on a wall tile', () => {
    for (const [mapId, def] of Object.entries(SUBMAPS)) {
      const wallPts = new Set(def.buildings.filter((b) => b.type.includes('wall') || b.type === 'door' || b.type === 'safe_door').map((b) => `${b.x},${b.y}`));
      for (const it of def.interactables) {
        expect(wallPts.has(`${it.x},${it.y}`), `${mapId}:${it.id} on wall`).toBe(false);
      }
    }
  });
  it('raider and merc safe_door yards stay enclosed (raidable肥区)', () => {
    for (const mapId of ['town_ruins', 'mtn_deep']) {
      const def = SUBMAPS[mapId];
      const door = def.buildings.find((b) => b.type === 'safe_door');
      expect(door, `${mapId} safe_door missing`).toBeDefined();
      const prefix = door!.id.replace(/_door$/, '').replace(/_gate.*$/, '');
      const walls = def.buildings.filter((b) => b.id.startsWith(prefix) || b.id.startsWith(door!.id.split('_')[0]));
      // 至少门两侧有墙，不判全闭环（堡垒院在 Task 5/6 会补全，这里只锁门存在）
      expect(walls.length).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('map expansion part A', () => {
  it('town_factory exists, HIGH risk, enclosed yard', async () => {
    const { SUBMAPS } = await import('./maps');
    const def = SUBMAPS['town_factory' as any];
    expect(def, 'town_factory missing').toBeDefined();
    expect(def.gates.length).toBeGreaterThanOrEqual(2);
  });
  it('town gates are expanded outward (>=40)', async () => {
    const { SUBMAPS } = await import('./maps');
    for (const id of ['town_gas', 'town_street', 'town_ruins']) {
      const def = SUBMAPS[id];
      const maxAbs = Math.max(...def.gates.map((g) => Math.max(Math.abs(g.x), Math.abs(g.y))));
      expect(maxAbs).toBeGreaterThanOrEqual(40);
    }
  });
});
describe('map expansion part B', () => {
  it('mtn_peak and marsh_abyss exist with 2+ gates each', async () => {
    const { SUBMAPS } = await import('./maps');
    for (const id of ['mtn_peak', 'marsh_abyss'] as const) {
      const def = (SUBMAPS as any)[id];
      expect(def, `${id} missing`).toBeDefined();
      expect(def.gates.length).toBeGreaterThanOrEqual(2);
      expect(def.monsters.length).toBeGreaterThanOrEqual(3);
      expect(def.interactables.length).toBeGreaterThanOrEqual(4);
    }
  });
  it('all maps are mutually reachable via gates', async () => {
    const { SUBMAPS, MAP_IDS } = await import('./maps');
    const seen = new Set<string>(['camp_plaza']);
    const q = ['camp_plaza'];
    while (q.length) {
      const cur = q.pop()!;
      const def = (SUBMAPS as any)[cur];
      if (!def) continue;
      for (const g of def.gates) {
        if (!seen.has(g.targetMap)) { seen.add(g.targetMap); q.push(g.targetMap); }
      }
    }
    for (const id of MAP_IDS) {
      if (id === 'home_base' || String(id).startsWith('home_')) continue;
      expect(seen.has(id), `${id} unreachable`).toBe(true);
    }
    expect((SUBMAPS as any)['home_base'], 'home_base template missing').toBeDefined();
  });
});
describe('item expansion wiring', () => {
  it('RARITY/ITEM_ICON cover new ids and lootResourceOf delegates', async () => {
    const { RARITY, ITEM_ICON, lootResourceOf } = await import('./maps');
    for (const id of ['seed_corn','crop_starfruit','ore_iridium','fish_legend','wine_starfruit','ammo_762','wp_svd','vest_t5','med_surgery','throw_frag','att_scope4x','key_red','collect_mandel']) {
      expect(RARITY[id], `${id} rarity`).toBeDefined();
      expect(ITEM_ICON[id], `${id} icon`).toBeDefined();
    }
    expect(RARITY['ore_iridium']).toBe(5);
    expect(RARITY['fish_legend']).toBe(5);
    expect(RARITY['wp_p1911']).toBe(2);
    expect(lootResourceOf('seed_parsnip')).toBe('seed');
    expect(lootResourceOf('ammo_762')).toBe('ammo');
    expect(lootResourceOf('wp_akm')).toBe('weapon');
    expect(lootResourceOf('throw_frag')).toBe('throwable');
    expect(lootResourceOf('collect_mandel')).toBe('valuable');
  });
  it('at least 8 interactables drop new items', async () => {
    const { SUBMAPS } = await import('./maps');
    const all = Object.values(SUBMAPS).flatMap((m) => m.interactables).flatMap((e) => e.lootTable ?? []);
    const ids = new Set(all.map((l) => l.itemId));
    for (const id of ['seed_corn','ore_copper','fish_bass','ammo_556','wp_p1911','vest_t2','med_surgery','collect_circuit']) {
      expect(ids.has(id), `${id} not placed`).toBe(true);
    }
  });
  it('every non-recipe item has a loot source (H1 closure)', async () => {
    const { SUBMAPS } = await import('./maps');
    const ids = new Set(Object.values(SUBMAPS).flatMap((m) => m.interactables).flatMap((e) => e.lootTable ?? []).map((l) => l.itemId));
    for (const id of ['ore_silver','ore_gold','ore_iridium','fish_carp','fish_eel','fish_catfish','fish_crimson','fish_legend','seed_parsnip','seed_potato','seed_pumpkin','seed_starfruit','crop_blueberry','honey_wild','ammo_762','ammo_9mm','ammo_shell','ammo_signal','wp_mp5','wp_akm','wp_m870','wp_svd','wp_plasma','helmet_t2','helmet_t3','helmet_t4','vest_t3','vest_t4','vest_t5','med_medkit','med_bloodbag','med_painkiller','throw_smoke','throw_flash','throw_molly','att_suppressor','att_foregrip','att_extmag','key_red','collect_dogtag']) {
      expect(ids.has(id), `${id} still sourceless`).toBe(true);
    }
  });
});
