import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkManager } from './NetworkManager';
import { StateEncoder } from './stateSync';
import { GameWorld } from '../../server/worldState';
import { createMemoryDb } from '../../server/db';

class Socket {
  static OPEN = 1; static CONNECTING = 0;
  readyState = 0;
  onclose: ((event: { code: number }) => void) | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror = null;
  send = vi.fn(); close = vi.fn();
  constructor(public url: string) { sockets.push(this); }
}
let sockets: Socket[] = [];
function setup() {
  sockets = [];
  vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:3000' } });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
  vi.stubGlobal('WebSocket', Socket);
  const callbacks = { onConnectionChange: vi.fn(), onGameState: vi.fn(), onInit: vi.fn() } as any;
  return { network: new NetworkManager(callbacks), callbacks };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('game action request IDs', () => {
  it('uses the native UUID API when available and sends the returned ID with the action', () => {
    const { network } = setup();
    const requestId = '75a75688-5833-4056-afba-9b884cc4fcb6';
    const randomUUID = vi.fn(() => requestId);
    vi.stubGlobal('crypto', { randomUUID });
    const send = vi.spyOn(network, 'send');
    expect(network.gameAction('gather', { targetId: 'tree' })).toBe(requestId);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: 'game_action', payload: { action: 'gather', targetId: 'tree', requestId } });
  });

  it('generates valid UUIDs without randomUUID, as on a LAN HTTP origin', () => {
    const { network } = setup();
    const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(0); return bytes; });
    vi.stubGlobal('crypto', { getRandomValues });
    const send = vi.spyOn(network, 'send');
    expect(network.gameAction('search', { targetId: 'box' })).toBe('00000000-0000-4000-8000-000000000000');
    expect(getRandomValues).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ type: 'game_action', payload: { action: 'search', targetId: 'box', requestId: '00000000-0000-4000-8000-000000000000' } });
  });

  it('keeps fallback action IDs distinct across managers even in the same millisecond', () => {
    const getRandomValues = crypto.getRandomValues.bind(crypto);
    vi.stubGlobal('crypto', { getRandomValues });
    vi.useFakeTimers(); vi.setSystemTime(10000);
    const ids: string[] = [];
    for (let manager = 0; manager < 2; manager++) {
      const { network } = setup();
      vi.spyOn(network, 'send').mockImplementation(() => {});
      for (let i = 0; i < 256; i++) ids.push(network.gameAction('gather', { targetId: 'tree' }));
    }
    expect(new Set(ids).size).toBe(512);
    expect(ids.every(id => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))).toBe(true);
  });
});

describe('guest connection lifecycle', () => {
  it('restores the cookie session before opening the socket and forwards actual game state', async () => {
    const { network, callbacks } = setup();
    await network.connect();
    expect(fetch).toHaveBeenCalledWith('/api/session', { credentials: 'same-origin' });
    expect(sockets).toHaveLength(1);
    expect(sockets[0].url).toBe('ws://localhost:3000/ws');
    sockets[0].onmessage?.({ data: JSON.stringify({ type: 'game_state', payload: { player: { campId: null } } }) });
    expect(callbacks.onGameState).toHaveBeenCalledWith({ player: { campId: null } });
    network.disconnect();
  });
  it('does not fight the newer tab when its guest connection has been replaced', async () => {
    vi.useFakeTimers();
    const { network } = setup();
    await network.connect();
    sockets[0].readyState = 3;
    sockets[0].onclose?.({ code: 4001 });
    await vi.advanceTimersByTimeAsync(10000);
    expect(sockets).toHaveLength(1);
    network.disconnect();
  });
  it('cannot open a ghost socket if disposed while session recovery is pending', async () => {
    const { network } = setup();
    let complete!: (value: { ok: boolean }) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { complete = resolve; })));
    const connecting = network.connect();
    network.disconnect(); complete({ ok: true });
    await connecting;
    expect(sockets).toHaveLength(0);
  });
});

describe('negotiated state synchronization', () => {
  function state() {
    const game = new GameWorld(createMemoryDb(), { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], campSiteAllowed: () => true, migrate: (_id, x, y) => ({ mapId: 'world', x, y }) }, () => 10000);
    game.connect('owner', '行者'); return game.snapshot('owner');
  }
  const receive = (socket: Socket, type: string, payload: unknown) => socket.onmessage?.({ data: JSON.stringify({ type, payload }) });

  it('opts in after opening and still accepts legacy complete snapshots', async () => {
    vi.useFakeTimers();
    const { network, callbacks } = setup(); await network.connect();
    sockets[0].readyState = Socket.OPEN; sockets[0].onopen?.();
    expect(sockets[0].send).toHaveBeenCalledWith(JSON.stringify({ type: 'state_sync', payload: { version: 1 } }));
    const full = state(); receive(sockets[0], 'game_state', full);
    expect(callbacks.onGameState).toHaveBeenLastCalledWith(full); network.disconnect();
  });
  it('passes reconstructed complete state to the existing game callback', async () => {
    const { network, callbacks } = setup(); await network.connect();
    const encoder = new StateEncoder(), full = state();
    receive(sockets[0], 'game_state_patch', encoder.encode(full, 0));
    full.player.resources.wood = 3; full.nodes = [{ id: 'tree', stock: 0, respawnAt: 300000 }];
    receive(sockets[0], 'game_state_patch', encoder.encode(full, 200));
    expect(callbacks.onGameState).toHaveBeenLastCalledWith(full); network.disconnect();
  });
  it('requests a fresh baseline once for a gap and resumes only after complete state', async () => {
    const { network, callbacks } = setup(); await network.connect(); const send = vi.spyOn(network, 'send');
    const encoder = new StateEncoder(), full = state();
    encoder.encode(full, 0); const delta = encoder.encode(full, 200);
    receive(sockets[0], 'game_state_patch', delta); receive(sockets[0], 'game_state_patch', delta);
    expect(callbacks.onGameState).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1); expect(send).toHaveBeenCalledWith({ type: 'state_sync', payload: { version: 1 } });
    receive(sockets[0], 'game_state_patch', encoder.encode(full, 5000));
    expect(callbacks.onGameState).toHaveBeenLastCalledWith(full); network.disconnect();
  });
  it('clears the old baseline on disconnect and never merges it into a new connection', async () => {
    const { network, callbacks } = setup(); await network.connect(); const encoder = new StateEncoder(), full = state();
    receive(sockets[0], 'game_state_patch', encoder.encode(full, 0));
    network.disconnect(); await network.connect(); callbacks.onGameState.mockClear();
    receive(sockets[1], 'game_state_patch', encoder.encode(full, 200));
    expect(callbacks.onGameState).not.toHaveBeenCalled(); network.disconnect();
  });
});
