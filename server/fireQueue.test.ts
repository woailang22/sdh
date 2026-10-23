import { afterEach, expect, it, vi } from 'vitest';
import { FireQueue } from './fireQueue';

afterEach(() => vi.useRealTimers());

it('waits until the monotonic deadline even when a timer wakes early or wall time changes', () => {
  vi.useFakeTimers(); let now = 0, executed = 0;
  const queue = new FireQueue(() => now);
  expect(queue.schedule({ requestId: 'shot', context: 'world/rifle', delayMs: 120, maxDelayMs: 120, execute: () => executed++ })).toBe(true);
  vi.setSystemTime(Date.now() + 50000); vi.advanceTimersByTime(120);
  expect(executed).toBe(0); expect(queue.requestId).toBe('shot'); expect(queue.context).toBe('world/rifle');
  now = 119; expect(queue.flushDue()).toBe(false); expect(executed).toBe(0);
  now = 120; expect(queue.flushDue()).toBe(true); expect(executed).toBe(1); expect(queue.requestId).toBeUndefined();
  vi.runAllTimers(); expect(executed).toBe(1);
});

it('holds only one shot and cancellation neither executes it nor blocks a later request', () => {
  vi.useFakeTimers(); const queue = new FireQueue(Date.now); let executed = 0;
  const shot = { requestId: 'a', context: 'world', delayMs: 120, maxDelayMs: 120, execute: () => executed++ };
  expect(queue.schedule(shot)).toBe(true); expect(queue.schedule({ ...shot, requestId: 'b' })).toBe(false);
  queue.cancel(); vi.advanceTimersByTime(200); expect(executed).toBe(0);
  expect(queue.schedule({ ...shot, requestId: 'c' })).toBe(true);
  vi.advanceTimersByTime(120); expect(executed).toBe(1); expect(queue.context).toBeUndefined();
});

it.each([0, -1, 121, NaN, Infinity])('rejects a delay outside the authoritative interval (%s)', delayMs => {
  const queue = new FireQueue();
  expect(queue.schedule({ requestId: 'a', context: 'world', delayMs, maxDelayMs: 120, execute: () => { throw Error('Must not run'); } })).toBe(false);
  expect(queue.requestId).toBeUndefined();
});

it('clears the occupied slot before executing a callback that fails', () => {
  vi.useFakeTimers(); const queue = new FireQueue(Date.now);
  queue.schedule({ requestId: 'a', context: 'world', delayMs: 120, maxDelayMs: 120, execute: () => { throw Error('reply failed'); } });
  expect(() => vi.advanceTimersByTime(120)).toThrow('reply failed');
  expect(queue.requestId).toBeUndefined(); expect(queue.flushDue()).toBe(false);
});
