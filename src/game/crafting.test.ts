import { describe, expect, it } from 'vitest';
import { CRAFT_RECIPES, craftingRecipe, craftingResult, findCraftingWorkbench, recipeRequiresWorkbench } from './crafting';
import { ITEM_DEFS } from './items';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkbenchModal } from '../components/WorkbenchModal';
import type { BuildingEntity, InteractableEntity } from '../types/game';

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
  it('offers one ammo recipe at the existing lower cost and resolves the legacy ID to that exact definition', () => {
    const ammo = CRAFT_RECIPES.filter(recipe => recipe.resultItemId === 'ammo');
    expect(ammo).toHaveLength(1);
    expect(ammo[0]).toMatchObject({ id: 'ammo_pack', resultCount: 30, cost: { wood: 0, stone: 0, scrap: 10, parts: 1 } });
    expect(craftingRecipe('ammo_reload')).toBe(ammo[0]);
    expect(craftingResult('ammo_reload')).toMatchObject({ id: 'ammo', count: 30 });
    for (const id of ['ammo_free', '__proto__', 'constructor', null, {}, undefined]) expect(craftingRecipe(id)).toBeUndefined();
  });
});

describe('crafting requirements in the interface', () => {
  const render = (hasWorkbench: boolean, blueprints: string[] = [], scrap = 100) => renderToStaticMarkup(React.createElement(WorkbenchModal, {
    isOpen: true, onClose() {}, onCraftSuccess() {}, playerWood: 100, playerStone: 100, playerScrap: scrap, playerParts: 100,
    hasExtra: () => true, hasWorkbench, blueprints,
  }));
  const card = (html: string, id: string) => {
    const recipe = CRAFT_RECIPES.find(recipe => recipe.id === id)!;
    const start = html.indexOf(recipe.name);
    expect(start).toBeGreaterThan(0);
    return html.slice(start, html.indexOf('</button>', start));
  };

  it('shares the bootstrap whitelist while advanced tools and ammo require a workstation', () => {
    for (const id of ['stone_pickaxe', 'stone_axe', 'rod_basic', 'bandage', 'dried_fish', 'cloth_armor']) expect(recipeRequiresWorkbench({ id })).toBe(false);
    for (const id of ['crude_gun', 'ammo_pack', 'ammo_reload', 'copper_pickaxe', 'plasma_rifle']) expect(recipeRequiresWorkbench({ id })).toBe(true);
  });

  it('requires a live same-space permitted bench within three cells, with public nodes usable only in the world', () => {
    const p = { x: 0, y: 0, mapId: 'home_test' };
    const bench = { id: 'bench', type: 'workbench', hp: 100, x: 3, y: 0, mapId: p.mapId } as BuildingEntity;
    const node = { id: 'public-bench', type: 'workbench', x: 0, y: 0 } as InteractableEntity;
    expect(findCraftingWorkbench(p, [bench], () => [node], () => true)).toBe(bench);
    expect(findCraftingWorkbench(p, [bench], () => [node], () => false)).toBeUndefined();
    const changes: Partial<BuildingEntity>[] = [{ hp: 0 }, { x: 3.01 }, { mapId: 'home_other' }];
    for (const change of changes) expect(findCraftingWorkbench(p, [{ ...bench, ...change }], () => [node], () => true)).toBeUndefined();
    expect(findCraftingWorkbench({ ...p, mapId: 'world' }, [], () => [node], () => false)).toBe(node);
  });

  it('keeps hand tools available but explains why affordable advanced crafts cannot start away from a bench', () => {
    const html = render(false);
    expect(card(html, 'stone_pickaxe')).not.toContain('disabled');
    for (const id of ['crude_gun', 'ammo_pack', 'copper_pickaxe']) {
      expect(card(html, id)).toContain('disabled');
      expect(card(html, id)).toContain('需靠近工作台');
    }
  });

  it('allows ordinary crafting at a bench but keeps unlearned plasma research locked', () => {
    const html = render(true);
    expect(card(html, 'crude_gun')).not.toContain('disabled');
    expect(card(html, 'plasma_rifle')).toContain('disabled');
    expect(card(html, 'plasma_rifle')).toContain('需研究蓝图');
  });

  it('allows learned research only when its actual materials are also affordable', () => {
    expect(card(render(true, ['wp_plasma']), 'plasma_rifle')).not.toContain('disabled');
    const lacking = card(render(true, ['wp_plasma'], 0), 'plasma_rifle');
    expect(lacking).toContain('disabled');
    expect(lacking).toContain('材料不足');
  });
  it('shows one ammo choice and makes it affordable with exactly ten scrap and one part', () => {
    const html = render(true, [], 10);
    expect(card(html, 'ammo_pack')).not.toContain('disabled');
    expect(html).not.toContain('复装弹药 ×30');
  });
});
