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
  it('retains omitted building references but replaces changed and reset/map baselines', () => {
    const encoder = new StateEncoder(), decoder = new StateDecoder(), state = snapshot();
    const first = decoder.decode(copy(encoder.encode(state, 0)))!;
    const live = { player: copy(state.player), correction: false, requestId: 'paid', error: undefined, loot: undefined };
    live.player.resources.ammo = 7;
    const privateState = decoder.decode(copy(encoder.encodePlayer(live, () => state, 120)))!;
    expect(privateState.buildings).toBe(first.buildings); expect(privateState.player.resources.ammo).toBe(7);
    const sameShared = decoder.decode(copy(encoder.encode({ ...state, player: live.player }, 200)))!;
    expect(sameShared.buildings).toBe(first.buildings); expect(sameShared.requestId).toBeUndefined();
    state.buildings[0].isOpen = true;
    const opened = decoder.decode(copy(encoder.encode(state, 300)))!;
    expect(opened.buildings).not.toBe(first.buildings); expect(opened.buildings[0].isOpen).toBe(true);
    expect(first.buildings[0].isOpen).toBe(false);
    const complete = decoder.decode(copy(encoder.encode(state, 5000)))!;
    expect(complete.buildings).not.toBe(opened.buildings); expect(complete.buildings).toEqual(opened.buildings);
    const entered = decoder.decode(copy(encoder.encode({ ...state, player: { ...state.player, mapId: 'home_other' }, buildings: [] }, 5100)))!;
    expect(entered.buildings).not.toBe(complete.buildings); expect(entered.buildings).toEqual([]);
    decoder.reset(); const replacement = new StateEncoder();
    const reconnected = decoder.decode(copy(replacement.encode(state, 5200)))!;
    expect(reconnected.buildings).not.toBe(complete.buildings); expect(reconnected.buildings).toEqual(complete.buildings);
  });
  it('serializes an encoded full patch without serializing its shared lists again', () => {
    const encoder = new StateEncoder(), state = snapshot(), name = state.buildings[0].name;
    const readName = vi.fn(() => name);
    Object.defineProperty(state.buildings[0], 'name', { enumerable: true, get: readName });
    const patch = encoder.encode(state, 0);
    const expected = copy(patch), serialization = vi.spyOn(JSON, 'stringify');
    readName.mockClear();
    let text: string;
    try {
      text = encoder.serialize(patch);
      expect(readName).not.toHaveBeenCalled();
      for (const list of [state.buildings, state.camps, state.nodes, state.drops, state.monsters, state.reports]) expect(serialization.mock.calls.some(args => args[0] === list)).toBe(false);
    } finally { serialization.mockRestore(); }
    expect(JSON.parse(text!)).toEqual(expected);
  });
  it('keeps each encoded patch bound to its own lists across later changes and map transitions', () => {
    const encoder = new StateEncoder(), firstState = snapshot(), first = encoder.encode(firstState, 0), expected = copy(first);
    const changed = copy(firstState); changed.buildings[0].isOpen = true;
    const second = encoder.encode(changed, 200), secondExpected = copy(second);
    const entered = encoder.encode({ ...copy(changed), player: { ...changed.player, mapId: 'home_other' }, buildings: [] }, 400);
    expect(JSON.parse(encoder.serialize(first))).toEqual(expected);
    expect(JSON.parse(encoder.serialize(second))).toEqual(secondExpected);
    expect(JSON.parse(encoder.serialize(entered))).toEqual(copy(entered));
  });
  it('preserves escaping, undefined omission, null and empty lists exactly', () => {
    const encoder = new StateEncoder(), state = snapshot();
    state.buildings[0].name = '中文"引号\\路径\n新行\u2028';
    state.drops = []; state.reports = []; state.loot = null as any;
    state.error = '错误: },"sequence":999,{ <script> & \\';
    const patch = encoder.encode(state, 0);
    expect(JSON.parse(encoder.serialize(patch))).toEqual(copy(patch));
    expect(JSON.parse(encoder.serialize(patch)).state).not.toHaveProperty('requestId');
  });
  it('does not add old shared lists to private feedback and handles a failed full fallback', () => {
    const encoder = new StateEncoder(), state = snapshot(); encoder.encode(state, 0);
    const live = { player: state.player, correction: false, requestId: 'fire', error: '失败', loot: undefined };
    const privatePatch = encoder.encodePlayer(live, () => state, 100);
    expect(JSON.parse(encoder.serialize(privatePatch))).toEqual(copy(privatePatch));
    expect(JSON.parse(encoder.serialize(privatePatch)).state).not.toHaveProperty('buildings');
    expect(() => encoder.encodePlayer(live, () => { throw Error('view failed'); }, 5000)).toThrow('view failed');
    const recovered = encoder.encodePlayer(live, () => ({ ...state, ...live }), 5001);
    expect(recovered.baseSequence).toBeNull(); expect(JSON.parse(encoder.serialize(recovered))).toEqual(copy(recovered));
  });
  it('falls back for unknown patches and replaced shared-list references', () => {
    const encoder = new StateEncoder(), patch = encoder.encode(snapshot(), 0);
    const unknown = copy(patch); unknown.state.buildings = [];
    expect(JSON.parse(encoder.serialize(unknown))).toEqual(unknown);
    patch.state.buildings = [];
    expect(JSON.parse(encoder.serialize(patch))).toEqual(copy(patch));
  });
  it('spreads eight complete-refresh deadlines across the same five-second cycle without losing state or feedback', () => {
    const state = snapshot(), encoders = Array.from({ length: 8 }, (_, i) => new StateEncoder(i * 600)), decoders = encoders.map(() => new StateDecoder());
    encoders.forEach((e, i) => expect(decoders[i].decode(copy(e.encode(state, 0)))).toEqual(state));
    const refreshes = encoders.map(() => [] as number[]), simultaneous: number[] = [];
    for (let time = 200; time <= 10000; time += 200) {
      let full = 0;
      encoders.forEach((e, i) => {
        const live = { player: copy(state.player), requestId: 'fire-' + time, correction: false, error: undefined, loot: undefined };
        live.player.resources.ammo = 100 - time / 200;
        const patch = e.encodePlayer(live, () => ({ ...state, ...live }), time);
        expect(decoders[i].decode(copy(patch))).toEqual({ ...state, ...live });
        if (patch.baseSequence === null) { full++; refreshes[i].push(time); }
      });
      simultaneous.push(full);
    }
    expect(Math.max(...simultaneous)).toBe(1);
    for (const times of refreshes) { expect(times).toHaveLength(2); expect(times[0]).toBeGreaterThan(0); expect(times[0]).toBeLessThanOrEqual(5000); expect(times[1] - times[0]).toBe(5000); }
  });
  it('retains phase deadlines after failed full fallback and still sends changed shared state immediately', () => {
    const state = snapshot(), encoder = new StateEncoder(1200), decoder = new StateDecoder();
    decoder.decode(copy(encoder.encode(state, 100)));
    const live = { player: state.player, requestId: 'committed', correction: false, error: undefined, loot: undefined };
    expect(() => encoder.encodePlayer(live, () => { throw Error('view failed'); }, 1200)).toThrow('view failed');
    const retry = encoder.encodePlayer(live, () => ({ ...state, ...live }), 1201);
    expect(retry.baseSequence).toBeNull(); expect(retry.sequence).toBe(2); expect(decoder.decode(copy(retry))).toEqual({ ...state, ...live });
    state.buildings[0].isOpen = true;
    const changed = encoder.encode(state, 1400); expect(changed.baseSequence).not.toBeNull(); expect(decoder.decode(copy(changed))).toEqual(state);
    expect(encoder.encode(state, 6199).baseSequence).not.toBeNull(); expect(encoder.encode(state, 6200).baseSequence).toBeNull();
    state.player.mapId = 'home_owner'; expect(encoder.encode(state, 6250).baseSequence).toBeNull();
    expect(encoder.encode(state, 11199).baseSequence).not.toBeNull(); expect(encoder.encode(state, 11200).baseSequence).toBeNull();
  });
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
