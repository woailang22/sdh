import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Hotbar } from './Hotbar';
import { makeItem } from '../game/items';
import { InventoryModal } from './InventoryModal';
vi.mock('../audio/soundManager', () => ({ soundManager: { playClick() {} } }));
function nodes(node: React.ReactNode): React.ReactElement<any>[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement<{ children?: React.ReactNode }>(node) ? [node, ...nodes(node.props.children)] : [];
}
function text(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement<{ children?: React.ReactNode }>(node) ? text(node.props.children) : typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
const props = () => ({ slots: [makeItem('water', 3), makeItem('pickaxe_stone', 1), makeItem('seed_potato', 1), null, null, null], activeSlotIndex: 0,
  ammo: { current: 0, max: 1, reserve: 0 }, equippedTool: makeItem('axe_stone', 1), equipPending: false, disabled: false, onSelectSlot: vi.fn(), onUseItem: vi.fn() });
describe('hotbar input and confirmed tool feedback', () => {
  it('uses six named buttons and delegates food exactly once to the shared activation callback', () => {
    const p = props(), tree = Hotbar(p as any) as React.ReactElement, buttons = nodes(tree).filter(n => n.type === 'button');
    expect(buttons).toHaveLength(6); expect(buttons[0].props['aria-label']).toContain('使用'); expect(buttons[1].props['aria-label']).toContain('装备');
    buttons[0].props.onClick(); expect(p.onSelectSlot).toHaveBeenCalledExactlyOnceWith(1); expect(p.onUseItem).not.toHaveBeenCalled();
    expect(text(tree)).toContain(p.equippedTool.name);
    const stop = vi.fn(); buttons[0].props.onKeyDown({ key: ' ', stopPropagation: stop }); expect(stop).toHaveBeenCalledOnce();
  });
  it('disables pending equipment but keeps food available and reports only the confirmed tool', () => {
    const p = { ...props(), equipPending: true }, tree = Hotbar(p as any) as React.ReactElement, buttons = nodes(tree).filter(n => n.type === 'button');
    expect(buttons).toHaveLength(6);
    expect(buttons[1].props.disabled).toBe(true); expect(buttons[0].props.disabled).toBe(false);
    expect(text(tree)).toContain('装备确认中'); expect(text(tree)).toContain(p.equippedTool.name);
    const offline = Hotbar({ ...p, disabled: true } as any) as React.ReactElement; expect(nodes(offline).filter(n => n.type === 'button').every(n => n.props.disabled)).toBe(true);
  });
  it('shows the same equipment wait in the backpack without disabling food or closing', () => {
    const p = props();
    const tree = InventoryModal({ isOpen: true, onClose() {}, hotbar: p.slots,
      equipment: { weapon: null, armor: null, tool: p.equippedTool, pack: null }, equipmentPending: true,
      materials: { wood: 0, stone: 0, scrap: 0, parts: 0 }, onUseItem() {}, onEquip() {}, onUnequip() {}, onDrop() {} } as any) as React.ReactElement;
    const buttons = nodes(tree).filter(n => n.type === 'button');
    expect(text(tree)).toContain('装备确认中');
    expect(buttons.filter(n => ['装备', '卸下', '丢弃'].includes(text(n))).every(n => n.props.disabled)).toBe(true);
    expect(buttons.find(n => text(n) === '使用')!.props.disabled).not.toBe(true);
  });
});
