import { describe, expect, it } from 'vitest';
import { homeMapIdFor, isHomeMap, parseHomeOwner, canBuildInHome, canRaidInHome } from './home';

describe('home instance core', () => {
  it('homeMapIdFor prefixes player id', () => {
    expect(homeMapIdFor('player_abc123')).toBe('home_player_abc123');
  });
  it('isHomeMap detects instance, not template confusion', () => {
    expect(isHomeMap('home_player_abc123')).toBe(true);
    expect(isHomeMap('home_base')).toBe(false);
    expect(isHomeMap('town_ruins')).toBe(false);
    expect(isHomeMap('camp_plaza')).toBe(false);
  });
  it('parseHomeOwner round-trips', () => {
    expect(parseHomeOwner('home_player_abc123')).toBe('player_abc123');
    expect(parseHomeOwner('town_ruins')).toBeNull();
    expect(parseHomeOwner('home_base')).toBeNull();
  });
  it('only owner can build in own home', () => {
    expect(canBuildInHome('player_a', 'home_player_a')).toBe(true);
    expect(canBuildInHome('player_b', 'home_player_a')).toBe(false);
    expect(canBuildInHome('player_a', 'town_ruins')).toBe(true);
  });
  it('visitor must raid, owner never raids own door', () => {
    expect(canRaidInHome('player_a', 'home_player_a', 'player_a')).toBe(false);
    expect(canRaidInHome('player_b', 'home_player_a', 'player_a')).toBe(true);
    expect(canRaidInHome('player_b', 'town_ruins', 'player_a')).toBe(true);
  });
});
