import React from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { CampPanel } from './CampPanel';

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useEffect() {}, useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  } };
});
function nodes(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement<{ children?: React.ReactNode }>(node) ? [node, ...nodes(node.props.children)] : [];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function setup() {
  const props: Parameters<typeof CampPanel>[0] = { isOpen: true, onClose() {}, onNavigate() {}, onAction: vi.fn(), selfId: 'owner', campId: 'home_owner', currentMapId: 'world', playerPos: { x: 200, y: 100 }, resources: { wood: 20, stone: 10 }, inventory: [], camps: [{ id: 'home_owner', ownerId: 'owner', ownerName: '主人', x: 100, y: 100, mapId: 'world', state: 'active' }] };
  const render = () => { hooks.cursor = 0; return CampPanel(props); };
  const button = (label: string) => nodes(render()).find(node => node.type === 'button' && text(node) === label);
  return { props, render, button };
}
beforeEach(() => { hooks.values = []; hooks.cursor = 0; });

it('requires a second confirmation at the chosen site and sends relocation rather than creating a camp', () => {
  const f = setup(); expect(f.button('在脚下迁移入口')).toBeDefined();
  f.button('在脚下迁移入口')!.props.onClick(); expect(f.props.onAction).not.toHaveBeenCalled();
  expect(text(f.render())).toContain('木材 20 / 石料 10'); expect(text(f.render())).toContain('建筑与物资保留');
  f.button('确认迁移')!.props.onClick();
  expect(f.props.onAction).toHaveBeenCalledWith('relocate_camp', { x: 200, y: 100 });
  expect(f.button('确认迁移')).toBeUndefined();
});

it('rechecks resources and distance after confirmation, and cancellation sends no action', () => {
  const f = setup(); f.button('在脚下迁移入口')!.props.onClick();
  f.props.resources.wood = 19; expect(f.button('确认迁移')!.props.disabled).toBe(true);
  f.props.resources.wood = 20; f.props.playerPos.x = 210; expect(f.button('确认迁移')!.props.disabled).toBe(true);
  f.button('取消')!.props.onClick(); expect(f.props.onAction).not.toHaveBeenCalled(); expect(f.button('确认迁移')).toBeUndefined();
});

it.each(['member', 'inside', 'breached', 'combat'] as const)('does not offer an executable migration for %s', reason => {
  const f = setup();
  if (reason === 'member') { f.props.selfId = 'member'; f.props.campId = null; f.props.camps[0].members = ['member']; }
  if (reason === 'inside') f.props.currentMapId = 'home_owner';
  if (reason === 'breached') f.props.camps[0].state = 'breached';
  if (reason === 'combat') f.props.camps[0].combatUntil = Date.now() + 30_000;
  const button = f.button('在脚下迁移入口'); expect(!button || button.props.disabled).toBe(true);
});
