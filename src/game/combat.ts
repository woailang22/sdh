import type { WeatherType } from '../types/game';

export const RAID_DAMAGE = { c4_explosive: 900, thermite_charge: 750 } as const;

interface DamageSnapshot {
  hp: number; shield: number; maxShield: number; lastDamageAt: number; lastCombatDamageAt?: number;
}

export function authoritativeDamageSince(previous: DamageSnapshot, current: DamageSnapshot): number {
  const before = previous.lastCombatDamageAt ?? previous.lastDamageAt;
  const after = current.lastCombatDamageAt ?? current.lastDamageAt;
  if (after <= before || !(current.hp < previous.hp || current.shield < previous.shield && current.maxShield >= previous.maxShield)) return 0;
  return Math.max(0, previous.hp - current.hp) + Math.max(0, previous.shield - current.shield);
}

export interface WeaponDef {
  id: string;
  name: string;
  damage: number;
  fireRate: number;
  range: number;
  spread: number;
  critChance: number;
  critMult: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  crude_gun: { id: 'crude_gun', name: '土铳', damage: 55, fireRate: 0.28, range: 10, spread: 0.09, critChance: 0.15, critMult: 1.5 },
  rifle: { id: 'rifle', name: '战术突击步枪', damage: 124, fireRate: 0.12, range: 12, spread: 0.03, critChance: 0.25, critMult: 1.3 },
};

export const MELEE = {
  bare: 12,
  tool: 22,
  range: 1.8,
  arc: 1.9,
  cooldown: 0.5,
  stamina: 4,
  knockback: 1.2,
} as const;

export const ARMOR_REDUCTION: Record<string, number> = {
  armor_cloth: 0,
  armor_vest: 0.15,
  vest: 0.15,
  vest_t3: 0.15,
  vest_t4: 0.20,
  vest_t5: 0.25,
};

export function rollCrit(chance: number, rand: () => number = Math.random): boolean {
  return rand() < chance;
}

export function calcRangedDamage(base: number, dist: number, range: number, isCrit: boolean, critMult: number): number {
  if (dist <= 2) return Math.max(1, Math.floor(base * (isCrit ? critMult : 1)));
  const clamped = Math.max(0, Math.min(1, dist / range));
  const falloff = 1 - clamped * 0.5;
  const raw = base * falloff * (isCrit ? critMult : 1);
  return Math.max(1, Math.floor(raw));
}

export function calcMonsterHit(monsterDamage: number, armorReduction: number): number {
  return Math.max(1, Math.floor(monsterDamage * (1 - armorReduction)));
}

export function absorbShieldFirst(shield: number, hp: number, dmg: number): { shield: number; hp: number } {
  const soaked = Math.min(shield, dmg);
  const rest = dmg - soaked;
  return { shield: shield - soaked, hp: hp - rest };
}

type Risk = 'SAFE' | 'LOW' | 'HIGH' | 'EXTREME';

const BASE_AGGRO: Record<Risk, number> = {
  SAFE: 0,
  LOW: 8,
  HIGH: 10,
  EXTREME: 12,
};

export function aggroRangeFor(risk: Risk, weather: WeatherType): number {
  const base = BASE_AGGRO[risk] ?? 8;
  if (base === 0) return 0;
  if (weather === 'fog') return base * 0.7;
  return base;
}

export function killReward(maxHp: number): { xp: number; credits: number; shards: number } {
  const xp = Math.floor(maxHp * 0.2);
  const credits = Math.floor(maxHp * 0.1);
  const shards = maxHp >= 1000 ? 6 : maxHp >= 500 ? 3 : 1;
  return { xp, credits, shards };
}

export function isEnraged(hp: number, maxHp: number): boolean {
  if (maxHp <= 0) return false;
  return hp / maxHp < 0.3;
}

export function weatherCritBonus(w: WeatherType): number {
  return w === 'thunder' ? 0.2 : 0;
}
