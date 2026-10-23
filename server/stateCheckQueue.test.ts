import { afterEach, expect, it, vi } from 'vitest';
import { StateCheckQueue } from './stateCheckQueue';

afterEach(() => vi.unstubAllGlobals());
function fixture(run: (value: { id: number; value: number }) => void) {
  const tasks = new Map<number, () => void>(); let next = 0;
  vi.stubGlobal('setImmediate', (fn: () => void) => { tasks.set(++next, fn); return next; });
  vi.stubGlobal('clearImmediate', (id: number) => tasks.delete(id));
  const step = () => { const [id, fn] = tasks.entries().next().value!; tasks.delete(id); fn(); };
  return { tasks, step, queue: new StateCheckQueue(run) };
}
it('chains one periodic check per event-loop turn and coalesces the same connection', () => {
  const seen: number[] = [], f = fixture(c => seen.push(c.id));
  const clients = Array.from({ length: 8 }, (_, id) => ({ id, value: 0 }));
  for (const c of clients) { f.queue.enqueue(c); f.queue.enqueue(c); }
  expect(f.tasks.size).toBe(1); expect(seen).toEqual([]);
  for (let i = 0; i < 8; i++) { f.step(); expect(seen).toEqual(clients.slice(0, i + 1).map(c => c.id)); expect(f.tasks.size).toBe(i === 7 ? 0 : 1); }
});
it('removes cancelled identities, reads fresh state, and permits a later replacement', () => {
  const seen: number[] = [], f = fixture(c => seen.push(c.value));
  const old = { id: 1, value: 1 }, live = { id: 2, value: 2 }, replacement = { id: 1, value: 3 };
  f.queue.enqueue(old); f.queue.enqueue(live); f.queue.cancel(old); f.queue.enqueue(replacement); live.value = 9;
  f.step(); f.step(); expect(seen).toEqual([9, 3]); expect(f.tasks.size).toBe(0);
  f.queue.enqueue(old); f.queue.cancel(old); expect(f.tasks.size).toBe(0);
});
it('continues remaining checks after an exception and never restores cancelled work', () => {
  const seen: number[] = []; let f: ReturnType<typeof fixture>;
  const a = { id: 1, value: 1 }, b = { id: 2, value: 2 }, c = { id: 3, value: 3 };
  f = fixture(item => { seen.push(item.id); if (item === a) { f.queue.cancel(b); throw Error('snapshot failed'); } });
  f.queue.enqueue(a); f.queue.enqueue(b); f.queue.enqueue(c);
  expect(() => f.step()).toThrow('snapshot failed'); expect(f.tasks.size).toBe(1);
  f.step(); expect(seen).toEqual([1, 3]); expect(f.tasks.size).toBe(0);
});
