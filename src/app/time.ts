import { localDate, pad } from './models.ts';
import type { Process, UnitSelection, TimerState } from './models.ts';

export function anniversary(start: Date, months: number): Date {
  const result = new Date(start);
  result.setDate(1);
  result.setMonth(start.getMonth() + months);
  const last = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(start.getDate(), last));
  return result;
}
export function calendarElapsed(start: Date, end: Date, step: number): number {
  if (end < start) return 0;
  let count = Math.floor(((end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth()) / step);
  if (anniversary(start, count * step) > end) count--;
  const previous = anniversary(start, count * step);
  const next = anniversary(start, (count + 1) * step);
  return count + (+end - +previous) / (+next - +previous);
}
export function elapsedValues(start: Date, end: Date): number[] {
  const seconds = Math.max(0, (+end - +start) / 1000);
  return [seconds, seconds / 60, seconds / 3600, seconds / 86400, seconds / 604800,
    calendarElapsed(start, end, 1), calendarElapsed(start, end, 12)];
}
export function formatSelectedTime(start: Date, end: Date, selected: UnitSelection): string {
  const parts = Array<number>(7).fill(0);
  if (end >= start) {
    const months = Math.floor(calendarElapsed(start, end, 1));
    let consumed = 0;
    if (selected[6]) { parts[6] = Math.floor(months / 12); consumed = parts[6] * 12; }
    if (selected[5]) { parts[5] = months - consumed; consumed += parts[5]; }
    let remaining = +end - +anniversary(start, consumed);
    const durations = [1000, 60000, 3600000, 86400000, 604800000];
    for (let index = 4; index >= 0; index--) {
      if (!selected[index]) continue;
      parts[index] = Math.floor(remaining / durations[index]);
      remaining -= parts[index] * durations[index];
    }
  }
  const suffixes: Record<number, string> = { 3: 'd', 4: 't', 5: 'm', 6: 'r' };
  const larger = [6, 5, 4, 3].filter(index => selected[index]).map(index => `${parts[index]}${suffixes[index]}`);
  const time = [2, 1, 0].filter(index => selected[index]).map(index => pad(parts[index])).join(':');
  return [...larger, ...(time ? [time] : [])].join(' ') || '—';
}
export interface ProcessTiming { start: Date; end: Date; error: string; progress: number; }
export function processTiming(process: Process, now: Date): ProcessTiming {
  let error = '';
  if (!process.startTime || !process.endTime) error = 'Podaj godzinę początku i końca.';
  if (Boolean(process.startDate) !== Boolean(process.endDate)) error = 'Podaj obie daty lub pozostaw obie puste.';
  const today = localDate(now);
  const start = new Date(`${process.startDate || today}T${process.startTime}`);
  const end = new Date(`${process.endDate || today}T${process.endTime}`);
  if (!process.startDate && end < start) end.setDate(end.getDate() + 1);
  if (!error && (!Number.isFinite(+start) || !Number.isFinite(+end) || end <= start)) error = 'Koniec musi przypadać po początku.';
  return { start, end, error, progress: error ? 0 : Math.max(0, Math.min(1, (+now - +start) / (+end - +start))) };
}
export function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  return `${days ? days + ' dni ' : ''}${pad(Math.floor(seconds / 3600) % 24)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
}
export function formatTimer(milliseconds: number): string {
  const ticks = Math.floor(Math.max(0, milliseconds) / 10);
  return `${pad(Math.floor(ticks / 360000))}:${pad(Math.floor(ticks / 6000) % 60)}:${pad(Math.floor(ticks / 100) % 60)}.${pad(ticks % 100)}`;
}
// The persisted wall-clock anchor allows a running timer to survive app/device restarts.
export function restoredTimerElapsed(timer: TimerState, now: number): number {
  return timer.accumulated + (timer.status === 'running' && timer.startedAt !== null ? Math.max(0, now - timer.startedAt) : 0);
}
