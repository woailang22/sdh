import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CharacterHUD } from './CharacterHUD';
import type { PlayerStats } from '../types/game';

const stats = (satiety: number, hp = 100, maxSatiety = 100) => ({
  hp, maxHp: 100, shield: 0, maxShield: 50, stamina: 100, maxStamina: 100,
  satiety, maxSatiety, level: 1, title: '废土流浪者',
} as PlayerStats);
const render = (satiety: number, hp = 100, maxSatiety = 100, onOpenInventory?: () => void) =>
  renderToStaticMarkup(<CharacterHUD stats={stats(satiety, hp, maxSatiety)} onOpenInventory={onOpenInventory} />);

describe('food survival guidance beside the vitals', () => {
  it.each([100, 20.001])('keeps sufficient satiety%s free of urgent guidance', satiety => {
    expect(render(satiety)).not.toContain('role="status"');
    expect(render(satiety)).not.toContain('打开背包补给');
  });

  it.each([20, 1])('explains how to replenish at low satiety%s without waiting for tutorial progress', satiety => {
    const html = render(satiety, 100, 100, () => {});
    expect(html).toContain('role="status"');
    expect(html).toContain('饱食不足');
    expect(html).toContain('选中食物');
    expect(html).toContain('使用');
    expect(html).toContain('农舍物资柜');
    expect(html).toContain('打开背包补给');
    expect(html).not.toContain('正在挨饿');
  });

  it('distinguishes actual starvation from the earlier low-food warning', () => {
    const html = render(0, 29, 100, () => {});
    expect(html).toContain('正在挨饿');
    expect(html).toContain('护盾和生命');
    expect(html).toContain('打开背包补给');
  });

  it.each([0, -1])('does not give a dead character an unusable food instruction (HP%s)', hp => {
    expect(render(0, hp, 100, () => {})).not.toContain('role="status"');
    expect(render(0, hp, 100, () => {})).not.toContain('打开背包补给');
  });

  it('retains actionable text but omits a disconnected button when no callback is supplied', () => {
    const html = render(1);
    expect(html).toContain('饱食不足');
    expect(html).toContain('农舍物资柜');
    expect(html).not.toContain('<button');
  });

  it('uses the existing percentage boundary rather than an absolute amount', () => {
    expect(render(10, 100, 50)).toContain('饱食不足');
    expect(render(10.001, 100, 50)).not.toContain('饱食不足');
  });
});
