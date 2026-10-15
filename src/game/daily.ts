export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function isNextDay(last: string, today: string): boolean {
  return last !== today;
}
export interface DailyState { lastSignIn: string; kills: number; gathers: number; raids: number; claimed: boolean }
export function freshDaily(today: string): DailyState {
  return { lastSignIn: today, kills: 0, gathers: 0, raids: 0, claimed: false };
}
