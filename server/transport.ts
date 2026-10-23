import { WebSocket } from 'ws';

export const BASE_QUEUE_BYTES = 1024 * 1024;
type Socket = Pick<WebSocket, 'readyState' | 'bufferedAmount' | 'send' | 'terminate'>;
const budgets = new WeakMap<Socket, number>();

export function sendMessage(ws: Socket, type: string, payload: unknown, serializePayload?: () => string): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  if (ws.bufferedAmount >= (budgets.get(ws) ?? BASE_QUEUE_BYTES)) { ws.terminate(); return false; }
  const timestamp = Date.now();
  const message = serializePayload
    ? '{"type":' + JSON.stringify(type) + ',"payload":' + serializePayload() + ',"timestamp":' + JSON.stringify(timestamp) + '}'
    : JSON.stringify({ type, payload, timestamp });
  const bytes = Buffer.byteLength(message) + 10;
  // Initial connection sends init and complete baselines back-to-back. Large
  // camps must still fit that burst; retain only one numeric budget, no queue.
  const budget = Math.max(budgets.get(ws) ?? BASE_QUEUE_BYTES, bytes * 3);
  budgets.set(ws, budget);
  // Server frames are unmasked, with at most ten header bytes. Never discard
  // action results or delta baselines while continuing the same connection.
  if (ws.bufferedAmount + bytes > budget) {
    ws.terminate(); return false;
  }
  ws.send(message);
  return true;
}
