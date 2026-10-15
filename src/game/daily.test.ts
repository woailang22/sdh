import { describe, expect, it } from 'vitest';
import { dayKey, isNextDay } from './daily';

describe('daily', () => {
  it('detects next day reset', () => {
    expect(isNextDay('2026-10-14', '2026-10-15')).toBe(true);
    expect(isNextDay('2026-10-15', '2026-10-15')).toBe(false);
    expect(dayKey(new Date('2026-10-15T00:00:00'))).toBe('2026-10-15');
  });
});
