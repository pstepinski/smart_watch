import { createState, PALETTE } from './models.ts';
import type { AppState } from './models.ts';

export const STORAGE_KEY = 'horizon.state.v1';
export interface LocalStore { getItem(key: string): string | null; setItem(key: string, value: string): void; }
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const natural = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const amount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const selection = (value: unknown): boolean => Array.isArray(value) && value.length === 7 && value.every(item => typeof item === 'boolean');
const strings = (value: Record<string, unknown>, keys: string[]): boolean => keys.every(key => typeof value[key] === 'string');
const optionalId = (value: unknown): boolean => value === null || natural(value);
const uniqueIds = (rows: unknown[]): boolean => new Set(rows.map(row => (row as Record<string, unknown>)['id'])).size === rows.length;

export function isAppState(value: unknown): value is AppState {
  if (!record(value) || value['version'] !== 1) return false;
  if (!['clock', 'countdown', 'stopwatch', 'timer'].includes(String(value['mode'])) || typeof value['showDigital'] !== 'boolean') return false;
  if (!['all', 'single'].includes(String(value['countdownMode'])) || !selection(value['countdownUnits'])) return false;
  const processes = value['processes'];
  if (!Array.isArray(processes) || !processes.every(item => record(item) && natural(item['id']) &&
    strings(item, ['name', 'color', 'startDate', 'endDate', 'startTime', 'endTime']) &&
    (item['automaticStart'] === undefined || amount(item['automaticStart'])) && PALETTE.some(color => color.color === item['color']) && typeof item['visible'] === 'boolean') || !uniqueIds(processes)) return false;
  const countFrom = value['countFrom'];
  if (!Array.isArray(countFrom) || !countFrom.every(item => record(item) && natural(item['id']) &&
    strings(item, ['name', 'startDate', 'startTime']) && selection(item['units'])) || !uniqueIds(countFrom)) return false;
  if (!natural(value['nextProcessId']) || !natural(value['nextCountFromId']) || !optionalId(value['activeProcessId']) || !optionalId(value['activeCountFromId'])) return false;
  if (processes.some(item => item.id >= (value['nextProcessId'] as number)) || countFrom.some(item => item.id >= (value['nextCountFromId'] as number))) return false;
  if (processes.length ? !processes.some(item => item.id === value['activeProcessId']) : value['activeProcessId'] !== null) return false;
  if (countFrom.length ? !countFrom.some(item => item.id === value['activeCountFromId']) : value['activeCountFromId'] !== null) return false;
  const timer = value['timer'];
  if (!record(timer) || !['idle', 'running', 'paused', 'stopped'].includes(String(timer['status']))) return false;
  if (!amount(timer['accumulated']) || !amount(timer['lastResult']) || !natural(timer['session']) || !natural(timer['lap']) || !natural(timer['nextResultId'])) return false;
  if (timer['status'] === 'running' ? !amount(timer['startedAt']) : timer['startedAt'] !== null) return false;
  const results = timer['results'];
  if (!Array.isArray(results) || !results.every(item => record(item) && natural(item['id']) && natural(item['session']) && typeof item['kind'] === 'string' && amount(item['elapsed']) && amount(item['split'])) || !uniqueIds(results)) return false;
  return results.every(item => item.id < (timer['nextResultId'] as number));
}
export function loadState(storage: LocalStore, now = new Date()): { state: AppState; error: string } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { state: createState(now), error: '' };
    const state: unknown = JSON.parse(raw);
    if (!isAppState(state)) throw new Error('Invalid saved state');
    return { state, error: '' };
  } catch {
    return { state: createState(now), error: 'Nie udało się odczytać zapisanych danych. Wyświetlono ustawienia domyślne.' };
  }
}
export function saveState(storage: LocalStore, state: AppState): string {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return '';
  } catch {
    return 'Nie udało się zapisać danych na urządzeniu. Sprawdź dostępne miejsce i ustawienia przeglądarki.';
  }
}
