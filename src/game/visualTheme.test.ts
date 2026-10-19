import { describe, expect, it } from 'vitest';
import { groundBaseColor, hash2, withAlpha, healthBarColor, themeAccent } from './visualTheme';

describe('visualTheme', () => {
  it('same tile coordinate is deterministic', () => {
    expect(groundBaseColor('camp', 3, -2)).toBe(groundBaseColor('camp', 3, -2));
  });
  it('checker contrast is subtle (not ugly high-contrast)', () => {
    const a = groundBaseColor('camp', 0, 0);
    const b = groundBaseColor('camp', 1, 0);
    expect(a).not.toBe(b);
    // 两色必须是同色系微差：直接断言我们锁定的色板值（dusty 橄榄，向预览看齐）
    expect([a, b].sort().join(',')).toBe('#6e6e50,#727254');
  });
  it('hash2 is deterministic in [0,1)', () => {
    expect(hash2(3, 7)).toBe(hash2(3, 7));
    expect(hash2(3, 7)).toBeGreaterThanOrEqual(0);
    expect(hash2(3, 7)).toBeLessThan(1);
  });
  it('withAlpha appends alpha correctly', () => {
    expect(withAlpha('#38bdf8', 0.5)).toBe('rgba(56, 189, 248, 0.5)');
  });
  it('health bar color segments', () => {
    expect(healthBarColor(0.8)).toBe('#22c55e');
    expect(healthBarColor(0.45)).toBe('#f59e0b');
    expect(healthBarColor(0.15)).toBe('#ef4444');
  });
  it('theme accent is defined for all themes', () => {
    expect(themeAccent('rift')).toBe('#c026d3');
    expect(themeAccent('lake')).toBe('#38bdf8');
  });
});

describe('ground texture rules', () => {
  it('urban road center uses dusty concrete pair', () => {
    // 约束：urban 主 tile 必须是 dusty 混凝土系，由 groundBaseColor 保证
    expect(groundBaseColor('urban', 0, 0)).toBe('#54534e');
    expect(groundBaseColor('urban', 1, 0)).toBe('#585751');
  });
});

import { outlineFor, shadowRadius } from './visualTheme';
import { pineColors } from './visualTheme';
import { weatherTint } from './visualTheme';
import { radarDotColor } from './visualTheme';
describe('shared model helpers', () => {
  it('outline color for dark and light sprites', () => {
    expect(outlineFor('#180728')).toBe('#e9d5ff');
    expect(outlineFor('#e8e4d8')).toBe('#1c1917');
  });
  it('shadow radius scales with footprint', () => {
    expect(shadowRadius('small')).toBe(18);
    expect(shadowRadius('large')).toBe(32);
  });
});
describe('flora palette', () => {
  it('pine highlight is brighter than base', () => {
    expect(pineColors().highlight).toBe('#4ade80');
    expect(pineColors().base).toBe('#0d381e');
  });
});
describe('character outline rule', () => {
  it('boss fill uses light outline', () => {
    expect(outlineFor('#170624')).toBe('#e9d5ff');
  });
});
describe('building accents', () => {
  it('rift accent stays purple, camp stays green', () => {
    expect(themeAccent('rift')).toBe('#c026d3');
    expect(themeAccent('camp')).toBe('#34d399');
  });
});
describe('lighting rules', () => {
  it('weather tint stays subtle', () => {
    expect(weatherTint('clear')).toBe('rgba(254, 240, 138, 0.06)');
    expect(weatherTint('rain')).toBe('rgba(15, 23, 42, 0.14)');
  });
});
describe('minimap colors', () => {
  it('radar dots use shared palette', () => {
    expect(radarDotColor('monster')).toBe('#ef4444');
    expect(radarDotColor('interactable')).toBe('#f59e0b');
  });
});

import { themeHaze } from './visualTheme';
describe('theme atmosphere', () => {
  it('every theme has a haze veil matching preview mood', () => {
    const themes = ['camp', 'plaza', 'field', 'urban', 'ruins', 'forest', 'quarry', 'lake', 'marsh', 'rift'] as const;
    for (const t of themes) {
      expect(themeHaze(t).startsWith('rgba(')).toBe(true);
    }
    expect(themeHaze('forest')).not.toBe(themeHaze('rift'));
  });
});
