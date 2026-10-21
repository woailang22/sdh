import { describe, expect, it } from 'vitest';
import { createMemoryDb } from './db';
import { resolveGuest, guestTokenFromCookie } from './identity';

describe('guest identity', () => {
  it('issues a high entropy secret and restores the same identity using only its hash in persistence', () => {
    const db = createMemoryDb();
    const first = resolveGuest(db);
    expect(first.token).toMatch(/^[a-f0-9]{64}$/);
    expect(resolveGuest(db, first.token).playerId).toBe(first.playerId);
    expect(db.getMeta('guest:' + first.token)).toBeNull();
    expect(resolveGuest(db, 'forged').playerId).not.toBe(first.playerId);
  });
  it('reads only an exact, valid cookie token', () => {
    const token = 'a'.repeat(64);
    expect(guestTokenFromCookie('other=1; sdc_guest=' + token)).toBe(token);
    expect(guestTokenFromCookie('sdc_guest=bad')).toBeUndefined();
    expect(guestTokenFromCookie('other_sdc_guest=' + token)).toBeUndefined();
  });
});
