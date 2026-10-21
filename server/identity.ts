import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DbHandle } from './db';

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;

export function guestTokenFromCookie(cookie?: string): string | undefined {
  const token = cookie?.split(';').map(v => v.trim()).find(v => v.startsWith('sdc_guest='))?.slice(10);
  return token && TOKEN_PATTERN.test(token) ? token : undefined;
}

export function resolveGuest(db: DbHandle, suppliedToken?: string): { playerId: string; token: string } {
  if (suppliedToken && TOKEN_PATTERN.test(suppliedToken)) {
    const playerId = db.getMeta('guest:' + createHash('sha256').update(suppliedToken).digest('hex'));
    if (playerId) return { playerId, token: suppliedToken };
  }
  const token = randomBytes(32).toString('hex');
  const playerId = 'player_' + randomUUID();
  db.setMeta('guest:' + createHash('sha256').update(token).digest('hex'), playerId);
  return { playerId, token };
}
