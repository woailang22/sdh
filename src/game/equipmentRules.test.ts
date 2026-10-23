import { describe, expect, it } from 'vitest';
import { gatheringDescription, gatheringEffects } from './equipmentRules';

describe('gathering tool roles', () => {
  it.each([
    { tool: '', wood: 1, stone: 1, canMine: false, canFish: false },
    { tool: 'axe_stone', wood: 3, stone: 1, canMine: false, canFish: false },
    { tool: 'stone_axe', wood: 3, stone: 1, canMine: false, canFish: false },
    { tool: 'pickaxe_stone', wood: 1, stone: 3, canMine: true, canFish: false },
    { tool: 'pickaxe_copper', wood: 1, stone: 4, canMine: true, canFish: false },
    { tool: 'rod_basic', wood: 1, stone: 1, canMine: false, canFish: true },
  ])('keeps the actual $tool yields consistent with its role', ({ tool, ...expected }) => {
    expect(gatheringEffects(tool)).toEqual(expected);
    if (expected.canMine) expect(gatheringDescription(tool)).toContain('伐木无加成');
  });
});
