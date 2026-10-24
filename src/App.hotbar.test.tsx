import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { Hotbar } from './components/Hotbar';
import { InventoryModal } from './components/InventoryModal';
import { createMemoryDb } from '../server/db';
import { GameWorld, type WorldRules } from '../server/worldState';
import { makeItem } from './game/items';

// Exercise real App callbacks and server transactions, not browser layout or transport timing.
const hooks = vi.hoisted(() => ({ states: [] as any[], refs: [] as any[], effects: [] as (() => unknown)[], stateCursor: 0, refCursor: 0 }));
const net = vi.hoisted(() => ({ callbacks: null as any, manager: null as any, sent: [] as any[], sequence: 0 }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState(initial: any) { const index = hooks.stateCursor++; if (!(index in hooks.states)) hooks.states[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks.states[index], (next: any) => { hooks.states[index] = typeof next === 'function' ? next(hooks.states[index]) : next; }]; },
  useRef(initial: any) { const index = hooks.refCursor++; return hooks.refs[index] ??= { current: initial }; },
  useCallback: (callback: any) => callback,
  useEffect: (callback: () => unknown) => { hooks.effects.push(callback); },
}));
vi.mock('./audio/soundManager', () => ({ soundManager: new Proxy({}, { get: () => () => {} }) }));
vi.mock('./game/NetworkManager', () => ({ NetworkManager: class {
  isConnected = true;
  constructor(callbacks: any) { net.callbacks = callbacks; net.manager = this; }
  connect() {} disconnect() {}
  gameAction(action: string, payload: any) { const requestId = `unit-${++net.sequence}`; net.sent.push({ ...payload, action, requestId }); return requestId; }
} }));

function find(node: React.ReactNode, type: unknown): React.ReactElement<any> | undefined {
  if (Array.isArray(node)) return node.map(n => find(n, type)).find(Boolean);
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return;
  return node.type === type ? node : find(node.props.children, type);
}
function setup(initialPosition?: { x: number; y: number }, stateBeforeEngine = false) {
  let now = 1000;
  const tree = { id: 'unit-tree', name: '树', type: 'tree' as const, x: 1, y: 1, available: true, radius: 3, prompt: '', stock: 3, maxStock: 3 };
  const rock = { ...tree, id: 'unit-rock', name: '石', type: 'boulder' as const };
  const rules: WorldRules = { nodeAt: id => id === tree.id ? tree : id === rock.id ? rock : undefined,
    nodesNear: () => [tree, rock], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => true,
    migrate: (_mapId, x, y) => ({ mapId: 'world', x, y }) };
  const db = createMemoryDb(), game = new GameWorld(db, rules, () => now); game.connect('unit-owner', '测试');
  const player = game.state.players['unit-owner']; player.equipment.tool = makeItem('axe_stone', 1);
  if (initialPosition) Object.assign(player, initialPosition);
  player.inventory[0] = makeItem('water', 3); player.inventory[2] = makeItem('pickaxe_stone', 1); player.satiety = 20; game.persist();
  const engine: any = { inputBlocked: false, activeSlot: 1, currentMapId: 'world', buildings: [], player: {}, getMapName: () => '测试地图', setAuthoritativeAmmo() {},
    setAuthoritativeBuildings(buildings: unknown[]) { this.buildings = buildings; }, setResourceStates() {}, setAuthoritativeMonsters() {}, setAuthoritativeDrops() {} };
  engine.warpToMap = vi.fn((mapId: string, x: number, y: number) => { engine.currentMapId = mapId; Object.assign(engine.player, { x, y }); });
  const render = () => { hooks.stateCursor = hooks.refCursor = 0; hooks.effects = []; return App(); };
  render(); if (!stateBeforeEngine) hooks.refs[1].current = engine; // App's existing engine ref; no engine/frame loop is started.
  const networkEffect = hooks.effects.find(effect => effect.toString().includes('onGameState:'));
  expect(networkEffect, 'run the real App network registration effect').toBeDefined(); networkEffect!();
  net.callbacks.onConnectionChange(true, 0); net.callbacks.onGameState(game.snapshot(player.id));
  if (stateBeforeEngine) { hooks.refs[1].current = engine; net.callbacks.onGameState({ ...game.snapshot(player.id), correction: true }); }
  const hotbar = () => find(render(), Hotbar)!.props;
  const deliver = (state: ReturnType<GameWorld['snapshot']>) => { net.callbacks.onGameState(state); };
  const flush = (index = net.sent.length - 1) => { now += 2000; const state = game.action(player.id, net.sent[index]); deliver(state); return state; };
  return { db, game, player, engine, render, hotbar, deliver, flush, advance: () => { now += 2000; } };
}

beforeEach(() => { hooks.states = []; hooks.refs = []; hooks.effects = []; hooks.stateCursor = hooks.refCursor = 0; net.callbacks = net.manager = null; net.sent = []; net.sequence = 0; });

describe('first authoritative view initialization', () => {
  it.each([false, true])('loads the first same-world position once, including a state received before the engine (%s)', early => {
    const f = setup({ x: -60, y: -298.94 }, early);
    expect(f.engine.warpToMap).toHaveBeenCalledExactlyOnceWith('world', -60, -298.94);
    f.deliver(f.game.snapshot(f.player.id));
    f.player.x += 1; f.deliver({ ...f.game.snapshot(f.player.id), correction: true });
    expect(f.engine.warpToMap).toHaveBeenCalledTimes(1);
    expect(f.engine.player.x).toBe(-59); expect(f.engine.player.y).toBe(-298.94);
  });
  it('initializes a replacement engine from the existing authoritative snapshot without treating it as a new server state', () => {
    const f = setup({ x: -60, y: -298.94 });
    const replacement = { ...f.engine, player: {}, warpToMap: vi.fn() };
    hooks.refs[1].current = replacement;
    f.deliver({ ...f.game.snapshot(f.player.id), correction: true });
    expect(replacement.warpToMap).toHaveBeenCalledExactlyOnceWith('world', -60, -298.94);
  });
});

describe('App authoritative hotbar activation', () => {
  it.each(['water', 'bandage'])('keeps normal %s consumption available while equipment is awaiting confirmation', id => {
    const f = setup(); f.player.inventory[0] = makeItem(id, 2); f.player.hp = 40; f.deliver(f.game.snapshot(f.player.id));
    f.hotbar().onSelectSlot(3); expect(f.hotbar().equipPending).toBe(true);
    f.hotbar().onSelectSlot(1); expect(net.sent).toHaveLength(2); expect(net.sent[1]).toMatchObject({ action: 'use_item', index: 0 });
    expect(f.flush(0).error).toBeUndefined(); expect(f.flush(1).error).toBeUndefined();
    expect(f.player.inventory[0]?.count).toBe(1); expect(f.player.equipment.tool?.id).toBe('pickaxe_stone');
    if (id === 'water') expect(f.player.satiety).toBe(35); else expect(f.player.hp).toBe(70);
  });

  it.each(['rifle', 'armor_cloth', 'pack_canvas'])('equips %s through its real category and keeps owned equipment conserved', id => {
    const f = setup(), item = makeItem(id, 1); f.player.inventory[2] = item; f.deliver(f.game.snapshot(f.player.id));
    f.hotbar().onSelectSlot(3); expect(net.sent[0]).toMatchObject({ action: 'equip', slot: item.category, index: 2 });
    expect(f.flush().error).toBeUndefined(); expect(f.player.equipment[item.category as 'weapon' | 'armor' | 'pack']?.id).toBe(id);
    expect(f.player.inventory[2]).toBeNull(); expect(f.player.equipment.tool?.id).toBe('axe_stone');
    if (item.category === 'pack') expect(f.player.inventory).toHaveLength(26);
  });

  it('guards unequip and drop while an exchange is pending, then conserves tools on confirmed unequip', () => {
    const f = setup(); f.hotbar().onSelectSlot(3);
    const inventory = find(f.render(), InventoryModal)!.props;
    inventory.onUnequip('tool'); inventory.onDrop(2); expect(net.sent).toHaveLength(1);
    f.flush(); find(f.render(), InventoryModal)!.props.onUnequip('tool');
    expect(net.sent).toHaveLength(2); expect(net.sent[1]).toMatchObject({ action: 'unequip', slot: 'tool' });
    expect(f.hotbar().equipPending).toBe(true); find(f.render(), InventoryModal)!.props.onEquip(2); expect(net.sent).toHaveLength(2);
    expect(f.flush().error).toBeUndefined(); expect(f.hotbar().equipPending).toBe(false); expect(f.player.equipment.tool).toBeNull();
    expect(f.player.inventory.filter(i => i?.category === 'tool').map(i => i!.id).sort()).toEqual(['axe_stone', 'pickaxe_stone']);
  });

  it('equips through the server, keeps the old tool until ACK, and uses the actual confirmed tool for gathering', () => {
    const f = setup(); f.hotbar().onSelectSlot(3);
    expect(net.sent).toHaveLength(1); expect(net.sent[0]).toMatchObject({ action: 'equip', slot: 'tool', index: 2 });
    expect(f.hotbar().equippedTool.id).toBe('axe_stone'); expect(f.hotbar().equipPending).toBe(true);
    f.hotbar().onSelectSlot(3); expect(net.sent).toHaveLength(1);
    f.deliver(f.game.snapshot(f.player.id, 'unrelated-update'));
    f.hotbar().onSelectSlot(3); expect(net.sent).toHaveLength(1); expect(f.hotbar().equipPending).toBe(true);
    expect(f.flush().error).toBeUndefined(); expect(f.hotbar().equipPending).toBe(false);
    expect(f.hotbar().equippedTool.id).toBe('pickaxe_stone'); expect(f.player.inventory[2]?.id).toBe('axe_stone');
    expect(f.engine.activeSlot).toBe(0);
    f.advance(); expect(f.game.action(f.player.id, { requestId: 'unit-mine', action: 'gather', targetId: 'unit-rock' }).error).toBeUndefined();
    expect(f.player.resources.stone).toBe(3);
    const restored = new GameWorld(f.db, { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], monstersNear: () => [], campSiteAllowed: () => true, migrate: (_mapId, x, y) => ({ mapId: 'world', x, y }) });
    expect(restored.state.players[f.player.id].equipment.tool?.id).toBe('pickaxe_stone');
    expect(restored.state.players[f.player.id].inventory[2]?.id).toBe('axe_stone');
  });

  it('dispatches one consumable action and never activates hidden, empty or material slots', () => {
    const f = setup(); f.player.inventory[1] = makeItem('seed_potato', 1); f.deliver(f.game.snapshot(f.player.id));
    for (const slot of [0, 2, 4, 7, 10, 1.5]) f.hotbar().onSelectSlot(slot);
    expect(net.sent).toEqual([]);
    f.hotbar().onSelectSlot(1); expect(net.sent).toHaveLength(1); expect(net.sent[0]).toMatchObject({ action: 'use_item', index: 0 });
    expect(f.flush().error).toBeUndefined(); expect(f.player.inventory[0]?.count).toBe(2); expect(f.player.satiety).toBe(35);
    f.engine.inputBlocked = true; f.hotbar().onSelectSlot(1); expect(net.sent).toHaveLength(1);
  });

  it('releases only the rejected equip ACK and preserves all assets when a pack downgrade fails', () => {
    const f = setup(); f.player.equipment.pack = makeItem('pack_tactical', 1); f.player.inventory = Array.from({ length: 28 }, () => makeItem('rifle', 1)); f.player.inventory[0] = makeItem('pack_canvas', 1);
    f.deliver(f.game.snapshot(f.player.id)); const before = structuredClone({ inventory: f.player.inventory, equipment: f.player.equipment });
    f.hotbar().onSelectSlot(1); expect(f.hotbar().equipPending).toBe(true);
    expect(f.flush().error).toContain('空间'); expect(f.hotbar().equipPending).toBe(false);
    const current = f.game.state.players[f.player.id];
    expect({ inventory: current.inventory, equipment: current.equipment }).toEqual(before);
    f.hotbar().onSelectSlot(1); expect(net.sent).toHaveLength(2);
  });

  it('shares the pending gate with inventory equipment and clears it on disconnect without optimistic swaps', () => {
    const f = setup(); find(f.render(), InventoryModal)!.props.onEquip(2);
    expect(f.hotbar().equipPending).toBe(true); f.hotbar().onSelectSlot(3); expect(net.sent).toHaveLength(1);
    net.manager.isConnected = false; net.callbacks.onConnectionChange(false, null);
    expect(f.hotbar().equipPending).toBe(false); expect(f.hotbar().disabled).toBe(true);
    expect(f.player.equipment.tool?.id).toBe('axe_stone'); expect(f.player.inventory[2]?.id).toBe('pickaxe_stone');
    f.hotbar().onSelectSlot(3); expect(net.sent).toHaveLength(1);
  });
});
