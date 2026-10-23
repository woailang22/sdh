import { describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { BASE_QUEUE_BYTES, sendMessage } from './transport';
import { GameWorld } from './worldState';
import { createMemoryDb } from './db';

function socket(bufferedAmount = 0) {
  const ws = { readyState: WebSocket.OPEN as WebSocket['readyState'], bufferedAmount,
    send: vi.fn(), terminate: vi.fn(() => { ws.readyState = WebSocket.CLOSING; }) };
  return ws;
}

describe('bounded server output', () => {
  it('uses lazy pre-encoded payloads inside the unchanged envelope', () => {
    const ws = socket(), value = { text: '中文"\\\n', empty: [], absent: undefined }, serialize = vi.fn(() => JSON.stringify(value));
    expect(sendMessage(ws, 'game_state_patch', { ignored: true }, serialize)).toBe(true);
    expect(serialize).toHaveBeenCalledOnce();
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({ type: 'game_state_patch', payload: JSON.parse(JSON.stringify(value)), timestamp: expect.any(Number) });
  });
  it('does not invoke a lazy serializer for a closed or already backlogged connection', () => {
    const serialize = vi.fn(() => { throw Error('Must not serialize'); }), closed = socket(), backlogged = socket(BASE_QUEUE_BYTES);
    closed.readyState = WebSocket.CLOSED;
    expect(sendMessage(closed, 'game_state_patch', {}, serialize)).toBe(false);
    expect(sendMessage(backlogged, 'game_state_patch', {}, serialize)).toBe(false);
    expect(serialize).not.toHaveBeenCalled(); expect(backlogged.terminate).toHaveBeenCalledOnce();
  });
  it('retains exact UTF-8 and header accounting for lazy payloads', () => {
    const payload = { text: '荒'.repeat(1000) }, serialize = () => JSON.stringify(payload);
    vi.spyOn(Date, 'now').mockReturnValue(10000);
    try {
      const length = Buffer.byteLength(JSON.stringify({ type: 'game_state_patch', payload, timestamp: 10000 }));
      const fits = socket(BASE_QUEUE_BYTES - length - 10), over = socket(BASE_QUEUE_BYTES - length - 9);
      expect(sendMessage(fits, 'game_state_patch', {}, serialize)).toBe(true);
      expect(sendMessage(over, 'game_state_patch', {}, serialize)).toBe(false);
      expect(over.send).not.toHaveBeenCalled(); expect(over.terminate).toHaveBeenCalledOnce();
    } finally { vi.restoreAllMocks(); }
  });
  it('propagates lazy serialization failure without sending or terminating an otherwise usable socket', () => {
    const ws = socket();
    expect(() => sendMessage(ws, 'game_state_patch', {}, () => { throw Error('encoding failed'); })).toThrow('encoding failed');
    expect(ws.send).not.toHaveBeenCalled(); expect(ws.terminate).not.toHaveBeenCalled();
    expect(sendMessage(ws, 'chat', { text: 'retry' })).toBe(true);
  });
  it('sends normal complete state and feedback using the original envelope', () => {
    const ws = socket();
    expect(sendMessage(ws, 'game_state', { requestId: 'take', loot: { items: ['蓝图'] } })).toBe(true);
    expect(JSON.parse(ws.send.mock.calls[0][0])).toEqual({ type: 'game_state', payload: { requestId: 'take', loot: { items: ['蓝图'] } }, timestamp: expect.any(Number) });
    expect(ws.terminate).not.toHaveBeenCalled();
  });

  it('counts Chinese text as UTF-8 bytes when the next frame would exceed the limit', () => {
    const payload = { text: '荒'.repeat(1000) };
    const length = Buffer.byteLength(JSON.stringify({ type: 'chat', payload, timestamp: Date.now() }));
    const ws = socket(BASE_QUEUE_BYTES - length - 9);
    expect(sendMessage(ws, 'chat', payload)).toBe(false);
    expect(ws.send).not.toHaveBeenCalled(); expect(ws.terminate).toHaveBeenCalledOnce();
  });

  it('accepts a normal burst that still fits including the maximum frame header', () => {
    const payload = { player: { id: 'p', x: 12, y: 34 } };
    const length = Buffer.byteLength(JSON.stringify({ type: 'game_state', payload, timestamp: Date.now() }));
    const ws = socket(BASE_QUEUE_BYTES - length - 10);
    expect(sendMessage(ws, 'game_state', payload)).toBe(true);
    expect(ws.send).toHaveBeenCalledOnce(); expect(ws.terminate).not.toHaveBeenCalled();
  });

  it('never serializes further messages once the backlog already reached its limit', () => {
    const payload = { toJSON: vi.fn(() => { throw Error('Must not serialize'); }) };
    const ws = socket(BASE_QUEUE_BYTES);
    expect(sendMessage(ws, 'game_state', payload)).toBe(false);
    expect(payload.toJSON).not.toHaveBeenCalled(); expect(ws.terminate).toHaveBeenCalledOnce();
    expect(sendMessage(ws, 'game_state', payload)).toBe(false);
    expect(ws.terminate).toHaveBeenCalledOnce(); expect(ws.send).not.toHaveBeenCalled();
  });

  it('fits a large camp init and both startup baselines, but refuses an unbounded backlog', () => {
    const game = new GameWorld(createMemoryDb(), { nodeAt: () => undefined, nodesNear: () => [], buildingsNear: () => [], campSiteAllowed: () => true, migrate: (_id, x, y) => ({ mapId: 'world', x, y }) });
    game.connect('player_00000000-0000-4000-8000-000000000000', '废土流浪者 #0000');
    const p = game.state.players['player_00000000-0000-4000-8000-000000000000'];
    p.mapId = p.campId = 'home_large';
    game.state.camps.home_large = { id: 'home_large', mapId: 'home_large', x: 64, y: 64, ownerId: p.id, ownerName: p.name, size: 128, level: 3 };
    // Seed a supported integer-grid floor layout; this is not a build/economy test.
    for (let y = -60; y <= 60; y++) for (let x = -60; x <= 60; x++) {
      if (Math.hypot(x, y) <= 2 || Math.abs(x) < 3 && y > 24) continue;
      const id = 'build_00000000-0000-4000-8000-' + String((y + 60) * 121 + x + 60).padStart(12, '0');
      game.state.buildings[id] = { id, type: 'wood_floor', name: '原木板材地板', x, y, hp: 300, maxHp: 300, level: 1, mapId: p.mapId, ownerId: p.id, ownerName: p.name, facing: 'ew', isOpen: false, isLocked: true };
    }
    const state = game.snapshot(p.id), ws = socket();
    expect(Buffer.byteLength(JSON.stringify(state))).toBeGreaterThan(BASE_QUEUE_BYTES);
    ws.send.mockImplementation(message => { ws.bufferedAmount += Buffer.byteLength(message) + 10; });
    expect(sendMessage(ws, 'init', { buildings: state.buildings, gameState: state })).toBe(true);
    expect(sendMessage(ws, 'game_state', state)).toBe(true);
    expect(sendMessage(ws, 'game_state_patch', { version: 1, sequence: 1, baseSequence: null, state })).toBe(true);
    const budget = (Buffer.byteLength(ws.send.mock.calls[0][0]) + 10) * 3;
    let accepted = 0;
    while (accepted < 10 && sendMessage(ws, 'game_state', state)) accepted++;
    expect(accepted).toBeLessThan(10); expect(ws.bufferedAmount).toBeLessThanOrEqual(budget);
    expect(ws.terminate).toHaveBeenCalledOnce();
  });
});
