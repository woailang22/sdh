import { describe, expect, it } from 'vitest';
import { isHostile, canOperateDoor, canDamageBuilding, isCampMap } from './diplomacy';

describe('diplomacy hostile core', () => {
  it('same player is never hostile', () => {
    expect(isHostile('player_a', 'player_a', 'town_ruins')).toBe(false);
  });
  it('different players are hostile in wild, neutral in camp', () => {
    expect(isHostile('player_a', 'player_b', 'town_ruins')).toBe(true);
    expect(isHostile('player_a', 'player_b', 'camp_plaza')).toBe(false);
    expect(isHostile('player_a', 'player_b', 'camp_workshop')).toBe(false);
    expect(isHostile('player_a', 'player_b', 'camp_outskirts')).toBe(false);
  });
  it('system and ruins are never hostile (neutral props)', () => {
    expect(isHostile('player_a', 'system', 'town_ruins')).toBe(false);
    expect(isHostile('player_a', '废土遗迹', 'town_ruins')).toBe(false);
    expect(isHostile('player_a', undefined, 'town_ruins')).toBe(false);
  });
  it('npc factions are hostile to everyone in wild', () => {
    expect(isHostile('player_a', 'npc_raider_boss', 'town_ruins')).toBe(true);
    expect(isHostile('player_a', 'npc_forest_syndicate', 'mtn_deep')).toBe(true);
  });
  it('door operate: owner or neutral only', () => {
    expect(canOperateDoor('player_a', { ownerId: 'player_a', type: 'safe_door' })).toBe(true);
    expect(canOperateDoor('player_a', { ownerId: 'player_b', type: 'safe_door' })).toBe(false);
    expect(canOperateDoor('player_a', { ownerId: 'system', type: 'door' })).toBe(false);
  });
  it('damage: camp never, wild enemy yes, self no', () => {
    expect(canDamageBuilding('player_a', 'player_b', 'town_ruins')).toBe(true);
    expect(canDamageBuilding('player_a', 'player_b', 'camp_plaza')).toBe(false);
    expect(canDamageBuilding('player_a', 'player_a', 'town_ruins')).toBe(false);
    expect(canDamageBuilding('player_a', 'system', 'town_ruins')).toBe(false);
  });
  it('camp map set is exactly 3 maps', () => {
    expect(isCampMap('camp_plaza')).toBe(true);
    expect(isCampMap('camp_workshop')).toBe(true);
    expect(isCampMap('camp_outskirts')).toBe(true);
    expect(isCampMap('town_ruins')).toBe(false);
    expect(isCampMap('marsh_rift')).toBe(false);
  });
});
