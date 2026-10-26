import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GameWorld, type WorldRules } from './worldState';
import { createMemoryDb } from './db';
import { makeItem } from '../src/game/items';
import { RaidModal } from '../src/components/RaidModal';
import { InventoryModal } from '../src/components/InventoryModal';

const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], campSiteAllowed: () => true, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
function setup(supplyId: 'c4_explosive' | 'thermite_charge', count: number) {
  let now = 10_000, sequence = 0;
  const game = new GameWorld(createMemoryDb(), rules, () => now);
  game.connect('owner', '主人'); game.connect('raider', '攻击者');
  const owner = game.state.players.owner; owner.x = 100; owner.resources.wood = 20; owner.resources.stone = 10;
  expect(game.action('owner', { action: 'create_camp', requestId: 'create-fixture', x: 100, y: 0 }).error).toBeUndefined();
  const raider = game.state.players.raider; Object.assign(raider, { mapId: 'home_owner', x: 1, y: 0 });
  if (supplyId === 'c4_explosive') raider.resources.c4 = count; else raider.inventory[0] = makeItem(supplyId, count);
  const target = () => game.state.buildings.home_owner_core;
  const render = () => renderToStaticMarkup(React.createElement(RaidModal, { door: target(), onClose() {}, onRaidAttempt() {}, resources: raider.resources, inventory: raider.inventory }));
  const attack = () => { now += 1100; return game.action('raider', { action: 'raid', requestId: `raid${++sequence}`, targetId: target().id, supplyId }); };
  return { game, raider, target, render, attack };
}
const text = (html: string) => html.replace(/<[^>]*>/g, '');

it.each([['c4_explosive', 900, 300], ['thermite_charge', 750, 450]] as const)('predicts %s charges using actual server damage, then updates after each paid hit', (supply, damage, afterFirst) => {
  const f = setup(supply, 2);
  expect(text(f.render())).toContain(`单份破拆 ${damage}`); expect(text(f.render())).toContain('预计还需 2 份');
  expect(f.attack().error).toBeUndefined(); expect(f.target().hp).toBe(afterFirst);
  expect(text(f.render())).toContain('预计还需 1 份');
  expect(f.attack().error).toBeUndefined(); expect(f.target().hp).toBe(0);
  expect(text(f.render())).toContain('建筑已被攻破');
  expect(f.raider.resources.c4).toBe(0); expect(f.raider.inventory.filter(Boolean)).toEqual([]);
  expect(f.raider.resources.wood).toBe(0); expect(f.raider.resources.credits).toBe(0);
});

it('keeps a single charge usable for a shared breach while showing the material shortfall', () => {
  const f = setup('c4_explosive', 1), html = f.render();
  expect(text(html)).toContain('仍缺 1 份');
  const button = html.match(/<button[^>]*aria-label="使用高爆C4塑胶炸药"[^>]*>/)?.[0];
  expect(button).toBeDefined(); expect(button).not.toMatch(/\sdisabled(?:=|\s|>)/);
  expect(f.attack().error).toBeUndefined(); expect(f.target().hp).toBe(300); expect(f.raider.resources.c4).toBe(0);
});

it('directs empty players to existing demolition caches without promising an unavailable recipe or merchant offer', () => {
  const f = setup('c4_explosive', 0), info = text(f.render());
  expect(info).toContain('采石炸药库'); expect(info).toContain('深林佣兵');
  expect(info).not.toContain('搜刮或制造'); expect(info).not.toContain('购买');
});

it.each([['c4_explosive', 'C4 · 破拆900'], ['thermite_charge', '铝热 · 破拆750']] as const)('keeps equipped %s information consistent with actual breach damage', (id, expected) => {
  const html = renderToStaticMarkup(React.createElement(InventoryModal, { isOpen: true, onClose() {}, hotbar: [], equipment: { weapon: null, armor: null, tool: makeItem(id, 1), pack: null }, materials: { wood: 0, stone: 0, scrap: 0, parts: 0 }, onUseItem() {}, onEquip() {}, onUnequip() {}, onDrop() {} }));
  expect(text(html)).toContain(expected); expect(text(html)).not.toContain('无声');
});
