import { describe, expect, it, vi } from 'vitest';
import { StateDecoder, StateEncoder } from './stateSync';
import { GameWorld, type GameStateSnapshot, type WorldRules } from '../../server/worldState';
import { createMemoryDb } from '../../server/db';

function snapshot(): GameStateSnapshot {
  const rules: WorldRules = { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], monstersNear: () => [{ id: 'beast', x: 5, y: 0, hp: 50, maxHp: 50 }], campSiteAllowed: () => true, migrate: (_map, x, y) => ({ mapId: 'world', x, y }) };
  const world = new GameWorld(createMemoryDb(), rules, () => 10000);
  world.connect('owner', '行者');
  const state = world.snapshot('owner');
  state.nodes = [{ id: 'tree', stock: 3, respawnAt: 0 }];
  state.buildings = [{ id: 'door', type: 'door', name: '门', x: 1, y: 0, mapId: 'world', hp: 100, maxHp: 100, level: 1, isOpen: false, ammo: 0, production: undefined }];
  return state;
}
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe('nearby state transport', () => {
  it('acknowledges private player changes without inspecting or serializing shared lists', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    decoder.decode(copy(encoder.encode(state, 0)));
    const live = { player: copy(state.player), correction: false, requestId: 'private-fire', error: undefined, loot: undefined };
    live.player.resources.ammo = 9;
    const fallback = vi.fn(() => { throw Error('Unexpected shared snapshot'); });
    const serialization = vi.spyOn(JSON, 'stringify'); let patch;
    try { patch = encoder.encodePlayer(live, fallback, 120); expect(serialization).not.toHaveBeenCalled(); } finally { serialization.mockRestore(); }
    expect(fallback).not.toHaveBeenCalled(); expect(patch.state).not.toHaveProperty('buildings');
    expect(decoder.decode(copy(patch))).toEqual({ ...state, ...copy(live) });
  });
  it('uses full fallback on missing, expired and changed-map baselines without starving refresh during continuous private replies', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    const live = { player: state.player, correction: true, requestId: 'initial-shot', error: '武器或弹药不足', loot: undefined };
    const fallback = vi.fn(() => ({ ...state, ...live }));
    const first = encoder.encodePlayer(live, fallback, 0);
    expect(first.baseSequence).toBeNull(); expect(decoder.decode(copy(first))).toEqual(copy({ ...state, ...live }));
    for (const now of [1000, 2000, 3000, 4000, 4999]) expect(decoder.decode(copy(encoder.encodePlayer(live, fallback, now)))).toBeDefined();
    expect(fallback).toHaveBeenCalledTimes(1);
    const refreshed = encoder.encodePlayer(live, fallback, 5000);
    expect(refreshed.baseSequence).toBeNull(); expect(fallback).toHaveBeenCalledTimes(2);
    decoder.decode(copy(refreshed));
    live.player = { ...state.player, mapId: 'home_owner' }; live.requestId = 'new-space-shot';
    const newSpace = { ...state, ...live, buildings: [], monsters: [], nodes: [], drops: [], camps: [] };
    const entered = encoder.encodePlayer(live, () => newSpace, 5100);
    expect(entered.baseSequence).toBeNull(); expect(decoder.decode(copy(entered))).toEqual(copy(newSpace));
  });
  it('preserves shared door updates between private replies and clears single-use feedback', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    decoder.decode(copy(encoder.encode(state, 0)));
    const live = { player: state.player, correction: false, requestId: 'rejected-shot', error: '操作过快', loot: undefined };
    decoder.decode(copy(encoder.encodePlayer(live, () => state, 120)));
    state.buildings[0].isOpen = true;
    expect(decoder.decode(copy(encoder.encode(state, 200)))!.buildings[0].isOpen).toBe(true);
    const next = encoder.encodePlayer({ ...live, requestId: undefined, error: undefined }, () => state, 300);
    const reconstructed = decoder.decode(copy(next))!;
    expect(reconstructed.buildings[0].isOpen).toBe(true); expect(reconstructed.error).toBeUndefined(); expect(reconstructed.requestId).toBeUndefined();
    expect(encoder.encode(state, 400).state).not.toHaveProperty('buildings');
  });
  it('does not advance sequences or refresh time when a full fallback fails', () => {
    const encoder = new StateEncoder(), state = snapshot(); encoder.encode(state, 0);
    const live = { player: state.player, correction: false, requestId: 'committed-fire', error: undefined, loot: undefined };
    expect(() => encoder.encodePlayer(live, () => { throw Error('snapshot failed'); }, 5000)).toThrow('snapshot failed');
    const recovered = encoder.encodePlayer(live, () => ({ ...state, ...live }), 5001);
    expect(recovered.sequence).toBe(2); expect(recovered.baseSequence).toBeNull(); expect(recovered.state.requestId).toBe(live.requestId);
  });
  it('sends a full baseline then omits unchanged lists while preserving live player state', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), initial = snapshot();
    const first = encoder.encode(initial, 10000);
    expect(first.baseSequence).toBeNull(); expect(decoder.decode(copy(first))).toEqual(initial);
    const moved = copy(initial); moved.player.x = 1; moved.player.hp = 75; moved.player.lastDamageAt = 10001;
    const patch = encoder.encode(moved, 10200);
    expect(patch.baseSequence).toBe(first.sequence);
    expect(patch.state).not.toHaveProperty('buildings'); expect(patch.state).not.toHaveProperty('nodes');
    expect(decoder.decode(copy(patch))).toEqual(moved);
  });
  it('restores depletion, respawn, doors, ammo, inventory, dropped items and removed entities exactly', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    decoder.decode(copy(encoder.encode(state, 0)));
    state.nodes[0].stock = 0; state.nodes[0].respawnAt = 300000;
    state.buildings[0].isOpen = true; state.buildings[0].hp = 30; state.buildings[0].ammo = 7;
    state.monsters[0].hp = 25; state.monsters[0].state = 'chase'; state.monsters[0].x = 4;
    state.player.resources.wood = 3; state.player.inventory[0] = { id: 'bandage', name: '绷带', icon: '', category: 'medical', count: 2, maxCount: 10 } as any;
    state.drops = [{ id: 'drop', name: '掉落包', mapId: 'world', x: 0, y: 0, expiresAt: 999999 }];
    expect(decoder.decode(copy(encoder.encode(state, 200)))).toEqual(state);
    state.nodes[0].stock = 3; state.nodes[0].respawnAt = 0; state.drops = []; state.buildings = []; state.monsters = [];
    expect(decoder.decode(copy(encoder.encode(state, 400)))).toEqual(state);
  });
  it('clears one-time errors, action IDs and loot instead of replaying them in later updates', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    const action = { ...state, requestId: 'search-1', error: '背包已满', loot: { id: 'box', name: '箱子', items: [{ itemId: 'bandage', name: '绷带', count: 1 }] } };
    expect(decoder.decode(copy(encoder.encode(action, 0)))).toEqual(action);
    const next = decoder.decode(copy(encoder.encode(state, 200)))!;
    expect(next).toEqual(state); expect(next.error).toBeUndefined(); expect(next.loot).toBeUndefined(); expect(next.requestId).toBeUndefined();
  });
  it('sends complete state on map changes and after five seconds without leaking old-space entities', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    decoder.decode(copy(encoder.encode(state, 0)));
    state.player.mapId = 'home_owner'; state.nodes = []; state.buildings = []; state.monsters = []; state.drops = [];
    state.camps = [{ id: 'home_owner', ownerId: 'owner', ownerName: '行者', x: 100, y: 100, mapId: 'home_owner', members: ['friend'] }];
    const entered = encoder.encode(state, 200);
    expect(entered.baseSequence).toBeNull(); expect(decoder.decode(copy(entered))).toEqual(state);
    state.camps[0].members = [];
    expect(decoder.decode(copy(encoder.encode(state, 400)))).toEqual(state);
    expect(encoder.encode(state, 5199).baseSequence).not.toBeNull();
    expect(encoder.encode(state, 5200).baseSequence).toBeNull();
  });
  it('rejects a missing or mismatched baseline and can recover with a later full update', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    const first = encoder.encode(state, 0), missing = encoder.encode(state, 200), third = encoder.encode(state, 400);
    expect(decoder.decode(copy(missing))).toBeUndefined();
    expect(decoder.decode(copy(first))).toEqual(state);
    expect(decoder.decode(copy(third))).toBeUndefined();
    expect(decoder.decode(copy(encoder.encode(state, 5000)))).toEqual(state);
    decoder.reset(); expect(decoder.decode(copy(encoder.encode(state, 5200)))).toBeUndefined();
  });
  it('refuses cross-player or cross-space patches even if the sequence number matches', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    decoder.decode(copy(encoder.encode(state, 0)));
    const patch = copy(encoder.encode(state, 200)); patch.state.player.id = 'intruder';
    expect(decoder.decode(patch)).toBeUndefined();
    patch.state.player.id = 'owner'; patch.state.player.mapId = 'home_intruder';
    expect(decoder.decode(patch)).toBeUndefined();
  });
});
