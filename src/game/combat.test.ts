// src/game/combat.test.ts
import { describe, expect, it } from 'vitest';
import {
  WEAPONS, MELEE, ARMOR_REDUCTION,
  rollCrit, calcRangedDamage, calcMonsterHit, absorbShieldFirst,
  aggroRangeFor, killReward, isEnraged, weatherCritBonus,
} from './combat';

describe('combat weapons', () => {
  it('rifle hits harder and faster than crude_gun', () => {
    expect(WEAPONS['rifle'].damage).toBe(124);
    expect(WEAPONS['crude_gun'].damage).toBe(55);
    expect(WEAPONS['rifle'].fireRate).toBe(0.12);
    expect(WEAPONS['crude_gun'].fireRate).toBe(0.28);
  });
  it('melee constants are locked', () => {
    expect(MELEE.bare).toBe(12);
    expect(MELEE.tool).toBe(22);
    expect(MELEE.range).toBe(1.8);
  });
  it('armor vest reduces 15 percent, cloth reduces 0', () => {
    expect(ARMOR_REDUCTION['armor_vest']).toBe(0.15);
    expect(ARMOR_REDUCTION['armor_cloth']).toBe(0);
  });
});

describe('rollCrit', () => {
  it('returns true when rand is below chance', () => {
    expect(rollCrit(0.25, () => 0.1)).toBe(true);
    expect(rollCrit(0.25, () => 0.3)).toBe(false);
  });
});

describe('calcRangedDamage', () => {
  it('no falloff at point blank', () => {
    expect(calcRangedDamage(124, 1.0, 12.0, false, 1.3)).toBe(124);
  });
  it('halves at max range, floors at 1', () => {
    expect(calcRangedDamage(124, 12.0, 12.0, false, 1.3)).toBe(62);
    expect(calcRangedDamage(124, 12.0, 12.0, true, 1.3)).toBe(80);
  });
  it('beyond range clamps to half', () => {
    expect(calcRangedDamage(55, 30.0, 10.0, false, 1.5)).toBe(27);
  });
});

describe('calcMonsterHit', () => {
  it('vest reduces 26 damage to 22', () => {
    expect(calcMonsterHit(26, 0.15)).toBe(22);
  });
  it('floors at 1', () => {
    expect(calcMonsterHit(1, 0.9)).toBe(1);
  });
});

describe('absorbShieldFirst', () => {
  it('shield soaks first', () => {
    expect(absorbShieldFirst(30, 100, 20)).toEqual({ shield: 10, hp: 100 });
  });
  it('overflow spills to hp', () => {
    expect(absorbShieldFirst(10, 100, 25)).toEqual({ shield: 0, hp: 85 });
  });
  it('no shield passes through', () => {
    expect(absorbShieldFirst(0, 100, 25)).toEqual({ shield: 0, hp: 75 });
  });
});

describe('aggroRangeFor', () => {
  it('high risk aggro is 10, fog shrinks 30 percent', () => {
    expect(aggroRangeFor('HIGH', 'clear')).toBe(10);
    expect(aggroRangeFor('HIGH', 'fog')).toBeCloseTo(7, 0);
  });
  it('safe zone never aggro', () => {
    expect(aggroRangeFor('SAFE', 'clear')).toBe(0);
  });
  it('extreme is 12', () => {
    expect(aggroRangeFor('EXTREME', 'clear')).toBe(12);
  });
});

describe('killReward', () => {
  it('scales with maxHp: 260hp gives xp 52', () => {
    expect(killReward(260)).toEqual({ xp: 52, credits: 26, shards: 1 });
  });
  it('boss 1600hp gives xp 320 credits 160 shards 6', () => {
    expect(killReward(1600)).toEqual({ xp: 320, credits: 160, shards: 6 });
  });
});

describe('isEnraged and weatherCritBonus', () => {
  it('enrages below 30 percent hp', () => {
    expect(isEnraged(29, 100)).toBe(true);
    expect(isEnraged(30, 100)).toBe(false);
  });
  it('thunder adds 0.2 crit', () => {
    expect(weatherCritBonus('thunder')).toBe(0.2);
    expect(weatherCritBonus('clear')).toBe(0);
  });
});

describe('ranged falloff rounding', () => {
  it('rifle at 6 of 12 range deals 93', () => {
    expect(calcRangedDamage(124, 6.0, 12.0, false, 1.3)).toBe(93);
  });
});

describe('melee arc rule task3', () => {
  it('arc is wider than 1 radian so side targets count', () => {
    expect(MELEE.arc).toBeGreaterThan(1);
  });
  it('knockback displaces at least 1 tile', () => {
    expect(MELEE.knockback).toBeGreaterThanOrEqual(1);
  });
});

describe('monster aggro tiers task4', () => {
  it('low aggro 8, extreme 12, fog shrinks', () => {
    expect(aggroRangeFor('LOW', 'clear')).toBe(8);
    expect(aggroRangeFor('EXTREME', 'clear')).toBe(12);
    expect(aggroRangeFor('LOW', 'fog')).toBeCloseTo(5.6, 0);
  });
});
