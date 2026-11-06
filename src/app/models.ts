import { defaultWorldClocks } from './world-clocks.ts';
import type { WorldClock } from './world-clocks.ts';
export type Mode = 'clock' | 'countdown' | 'stopwatch' | 'timer' | 'world';
export type UnitSelection = boolean[];
export interface Process {
  automaticStart?: number;
  alarmEnabled?: boolean;
  alarmAt?: number;
  alarmFiredAt?: number;
  id: number;
  name: string;
  color: string;
  visible: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
}
export interface CountFrom {
  id: number;
  name: string;
  startDate: string;
  startTime: string;
  units: UnitSelection;
}
export interface TimerResult {
  id: number;
  session: number;
  kind: string;
  elapsed: number;
  split: number;
}
export interface TimerState {
  status: 'idle' | 'running' | 'paused' | 'stopped';
  accumulated: number;
  startedAt: number | null;
  session: number;
  lap: number;
  lastResult: number;
  nextResultId: number;
  results: TimerResult[];
}
export interface AppState {
  version: 1;
  language: 'pl' | 'en';
  mode: Mode;
  showDigital: boolean;
  alarmInfoAcknowledged?: boolean;
  countdownMode: 'all' | 'single';
  countdownUnits: UnitSelection;
  processes: Process[];
  activeProcessId: number | null;
  nextProcessId: number;
  countFrom: CountFrom[];
  activeCountFromId: number | null;
  nextCountFromId: number;
  timer: TimerState;
  worldClocks: WorldClock[];
  nextWorldClockId: number;
}
export const PALETTE = [
  { name: 'Miętowy', color: '#5ae6c6' }, { name: 'Niebieski', color: '#65baff' },
  { name: 'Fioletowy', color: '#b99aff' }, { name: 'Różowy', color: '#ff8fbc' },
  { name: 'Pomarańczowy', color: '#ffb366' }, { name: 'Żółty', color: '#f4df77' }
];
export const UNITS = [
  { name: 'Sekundy', cycle: 60, color: '#5ae6c6' }, { name: 'Minuty', cycle: 60, color: '#65baff' },
  { name: 'Godziny', cycle: 24, color: '#b99aff' }, { name: 'Dni', cycle: 7, color: '#ff8fbc' },
  { name: 'Tygodnie', cycle: 52, color: '#ffb366' }, { name: 'Miesiące', cycle: 12, color: '#f4df77' },
  { name: 'Lata', cycle: 10, color: '#f1f9ff' }
];
export const PRESETS = [
  { id: 'clock', name: 'Czas — godziny, minuty, sekundy', indexes: [0, 1, 2] },
  { id: 'days', name: 'Dni i czas', indexes: [0, 1, 2, 3] },
  { id: 'weeks', name: 'Tygodnie i dni', indexes: [3, 4] },
  { id: 'calendar', name: 'Lata, miesiące i dni', indexes: [3, 5, 6] },
  { id: 'yearsMonths', name: 'Lata i miesiące', indexes: [5, 6] },
  { id: 'seconds', name: 'Tylko sekundy', indexes: [0] },
  { id: 'all', name: 'Wszystkie jednostki', indexes: [0, 1, 2, 3, 4, 5, 6] },
  { id: 'none', name: 'Ukryj wszystkie', indexes: [] }
];
export const clockUnits = (): boolean[] => [true, true, true, false, false, false, false];
export const pad = (value: number): string => String(value).padStart(2, '0');
export const localDate = (now: Date): string => `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
export const localTime = (now: Date): string => `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
export function createState(now = new Date(), language: 'pl' | 'en' = 'pl'): AppState {
  return {
    worldClocks: defaultWorldClocks(), nextWorldClockId: 31,
    version: 1, language, mode: 'clock', showDigital: true, countdownMode: 'all', countdownUnits: UNITS.map(() => true),
    processes: [{ id: 1, name: language === 'en' ? 'Process 1' : 'Pasek 1', color: PALETTE[0].color, visible: true, startDate: '', endDate: '', startTime: '08:00', endTime: '16:00' }],
    activeProcessId: 1, nextProcessId: 2,
    countFrom: [{ id: 1, name: language === 'en' ? 'Stopwatch 1' : 'Stoper 1', startDate: localDate(now), startTime: localTime(now), units: clockUnits() }],
    activeCountFromId: 1, nextCountFromId: 2,
    timer: { status: 'idle', accumulated: 0, startedAt: null, session: 0, lap: 0, lastResult: 0, nextResultId: 1, results: [] }
  };
}
