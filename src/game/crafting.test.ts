import { describe, expect, it } from 'vitest';
import { CRAFT_RECIPES, craftingResult } from './crafting';
import { ITEM_DEFS } from './items';

describe('shared crafting definitions', () => {
  it('makes the starter tools usable by the same server and client item definitions', () => {
    expect(craftingResult('stone_pickaxe')).toMatchObject({ id: 'pickaxe_stone', category: 'tool', count: 1 });
    expect(craftingResult('stone_axe')).toMatchObject({ id: 'axe_stone', category: 'tool', count: 1 });
    expect(CRAFT_RECIPES.find(r => r.id === 'stone_pickaxe')?.cost).toEqual({ wood: 8, stone: 6, scrap: 0, parts: 0 });
  });
  it('defines actual results and positive counts for every recipe', () => {
    for (const recipe of CRAFT_RECIPES) {
      expect(ITEM_DEFS[recipe.resultItemId], recipe.id).toBeDefined();
      expect(recipe.resultCount).toBeGreaterThan(0);
      expect(craftingResult(recipe.id)?.count).toBe(recipe.resultCount);
    }
    expect(craftingResult('forged_free_gun')).toBeUndefined();
  });
});
