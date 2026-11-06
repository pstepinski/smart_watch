import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, clockUnits } from '../src/app/models.ts';
import { anniversary, calendarElapsed, formatSelectedTime, formatTimer, processTiming, restoredTimerElapsed } from '../src/app/time.ts';
import { isAppState, loadState, saveState, STORAGE_KEY } from '../src/app/persistence.ts';

test('wybrane jednostki dzielą pozostałość, a same miesiące pokazują sumę', () => {
  const start = new Date(2025, 0, 31, 12);
  const end = new Date(2026, 6, 31, 12);
  assert.equal(formatSelectedTime(start, end, [false, false, false, false, false, true, true]), '1r 6m');
  assert.equal(formatSelectedTime(start, end, [false, false, false, false, false, true, false]), '18m');
  assert.equal(formatSelectedTime(new Date(2026, 0, 1, 12), new Date(2026, 0, 1, 13, 2, 3), clockUnits()), '01:02:03');
});
test('krótkie miesiące i rocznica dnia przestępnego są liczone kalendarzowo', () => {
  const start = new Date(2024, 1, 29, 12);
  assert.equal(anniversary(start, 12).getDate(), 28);
  assert.equal(calendarElapsed(start, new Date(2025, 1, 28, 12), 12), 1);
  assert.equal(calendarElapsed(new Date(2026, 0, 31, 12), new Date(2026, 1, 28, 12), 1), 1);
});
test('odliczanie domyślne, przez północ i walidacja dat', () => {
  const state = createState();
  const entry = state.processes[0];
  assert.equal(processTiming(entry, new Date(2026, 0, 1, 12)).progress, .5);
  entry.startTime = '22:00'; entry.endTime = '06:00';
  assert.equal(processTiming(entry, new Date(2026, 0, 1, 23)).progress, .125);
  entry.startDate = '2026-01-01';
  assert.match(processTiming(entry, new Date()).error, /obie daty/);
});
test('uruchomiony stoper uwzględnia zamknięcie aplikacji, pauza pozostaje nieruchoma', () => {
  const timer = createState().timer;
  timer.status = 'running'; timer.accumulated = 1234; timer.startedAt = 10000;
  assert.equal(restoredTimerElapsed(timer, 15000), 6234);
  timer.status = 'paused'; timer.startedAt = null;
  assert.equal(restoredTimerElapsed(timer, 99999), 1234);
  assert.equal(formatTimer(3723456), '01:02:03.45');
});
test('zapis i odczyt pełnego stanu, w tym pustych tabel i wyników', () => {
  const data = new Map<string, string>();
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  const state = createState();
  state.showDigital = false; state.mode = 'timer';
  state.timer.results.push({ id: 1, session: 1, kind: 'Stop', elapsed: 1234, split: 1234 }); state.timer.nextResultId = 2;
  assert.equal(saveState(store, state), '');
  assert.deepEqual(loadState(store).state, state);
  state.processes = []; state.activeProcessId = null; state.countFrom = []; state.activeCountFromId = null;
  saveState(store, state);
  assert.deepEqual(loadState(store).state.processes, []);
  assert.equal(isAppState(state), true);
  data.set(STORAGE_KEY, '{broken');
  assert.match(loadState(store).error, /odczytać/);
});
test('nieprawidłowy schemat, zduplikowane identyfikatory i blokada zapisu nie psują aplikacji', () => {
  const state = createState();
  assert.equal(isAppState({ ...state, countdownUnits: [true] }), false);
  assert.equal(isAppState({ ...state, processes: [...state.processes, state.processes[0]] }), false);
  assert.equal(isAppState({ ...state, version: 2 }), false);
  assert.equal(isAppState({ ...state, timer: { ...state.timer, status: 'running', startedAt: null } }), false);
  const blocked = { getItem: () => { throw Error('blocked'); }, setItem: () => { throw Error('quota'); } };
  assert.match(loadState(blocked).error, /odczytać/);
  assert.match(saveState(blocked, state), /zapisać/);
});

test('sama godzina końca liczy od zapisanego momentu i maleje z upływem czasu', () => {
  const process = createState().processes[0];
  process.startTime = '';
  process.automaticStart = +new Date(2026, 0, 1, 12);
  const timing = processTiming(process, new Date(2026, 0, 1, 14));
  assert.equal(timing.error, '');
  assert.equal(timing.progress, .5);
  assert.equal(+timing.start, process.automaticStart);
  assert.equal(processTiming(process, new Date(2026, 0, 1, 16)).progress, 1);
  assert.equal(processTiming(process, new Date(2026, 0, 2, 10)).progress, 1);
});
test('cel miniony dzisiaj oznacza jutro, a cel z datą nie wymaga daty początku', () => {
  const process = createState().processes[0];
  process.startTime = ''; process.endTime = '06:00';
  process.automaticStart = +new Date(2026, 0, 1, 22);
  const timing = processTiming(process, new Date(2026, 0, 2, 2));
  assert.equal(timing.error, '');
  assert.equal(timing.end.getDate(), 2);
  assert.equal(timing.progress, .5);
  process.endDate = '2026-01-03';
  assert.equal(processTiming(process, new Date(2026, 0, 2)).error, '');
  process.endDate = '2025-12-31';
  assert.match(processTiming(process, new Date(2026, 0, 2)).error, /po początku/);
});
test('automatyczny początek przechodzi walidację zapisu, błędny znacznik jest odrzucany', () => {
  const state = createState();
  state.processes[0].startTime = '';
  state.processes[0].automaticStart = Date.now();
  assert.equal(isAppState(state), true);
  state.processes[0].automaticStart = -1;
  assert.equal(isAppState(state), false);
});
