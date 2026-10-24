import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuildingBar } from './BuildingBar';

// Exercise the component's real selection callbacks without adding a DOM runtime.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }));
vi.mock('react', async original => {
  const actual = await original<typeof import('react')>();
  return { ...actual, useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = value; }];
  } };
});
vi.mock('../audio/soundManager', () => ({ soundManager: { playClick() {} } }));

function nodes(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return [];
  return [node, ...nodes(node.props.children)];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return text(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function fixture() {
  let selected = 'wood_floor', mode = true;
  const resources = { playerWood: 21, playerStone: 6, playerScrap: 16, playerParts: 4 };
  const render = () => { hooks.cursor = 0; return BuildingBar({ isBuildMode: mode, selectedType: selected,
    onSelectType: value => { selected = value; }, onToggleBuildMode: () => { mode = !mode; }, ...resources }) as React.ReactElement; };
  const button = (tree: React.ReactNode, label: string) => nodes(tree).find(n => n.type === 'button'
    && String(n.props['aria-label'] || text(n) || n.props.title || '').includes(label));
  const utility = () => { button(render(), '储物·生产·防御')!.props.onClick(); };
  return { render, button, utility, resources, selected: () => selected, mode: () => mode };
}

beforeEach(() => { hooks.values = []; hooks.cursor = 0; });
describe('building placement palette', () => {
  it('releases the full palette after selecting an affordable structure while retaining its actual price and build mode', () => {
    const f = fixture(); f.utility();
    f.button(f.render(), '机械工程工作台')!.props.onClick();
    const placing = f.render();
    expect(f.selected()).toBe('workbench'); expect(f.mode()).toBe(true);
    expect(f.button(placing, '选择建筑')).toBeDefined();
    expect(f.button(placing, '储物·生产·防御')).toBeUndefined();
    expect(text(placing)).toContain('机械工程工作台');
    expect(text(placing)).toContain('木 10 · 石 5 · 铁 4 · 件 1');
  });

  it('reopens choices without exiting, then retains the new selection for repeated placements', () => {
    const f = fixture(); f.utility(); f.button(f.render(), '机械工程工作台')!.props.onClick();
    const open = f.button(f.render(), '选择建筑'); expect(open).toBeDefined(); open!.props.onClick();
    expect(f.selected()).toBe('workbench'); expect(f.mode()).toBe(true);
    f.button(f.render(), '战术领地储物箱')!.props.onClick();
    expect(f.selected()).toBe('storage_box');
    expect(text(f.render())).toContain('木 8 · 石 0 · 铁 2 · 件 0');
    expect(f.button(f.render(), '储物·生产·防御')).toBeUndefined();
    expect(f.mode()).toBe(true);
    f.button(f.render(), '退出建造模式')!.props.onClick(); expect(f.mode()).toBe(false);
    expect(f.button(f.render(), '建造工坊')).toBeDefined();
  });

  it('keeps unaffordable choices disabled and reports depleted materials after an actual selection', () => {
    const f = fixture(); f.utility();
    expect(f.button(f.render(), '矿物熔炉')!.props.disabled).toBe(true);
    f.button(f.render(), '机械工程工作台')!.props.onClick();
    f.resources.playerStone = 1;
    expect(text(f.render())).toContain('材料不足');
    expect(f.selected()).toBe('workbench'); expect(f.mode()).toBe(true);
    f.button(f.render(), '选择建筑')!.props.onClick();
    expect(f.button(f.render(), '机械工程工作台')!.props.disabled).toBe(true);
  });
});
