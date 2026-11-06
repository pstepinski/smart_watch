import { defaultWorldClocks, validTimeZone, zonedTime } from '../src/app/world-clocks.ts';
import { browserLanguage } from '../src/app/translations.ts';
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

test('język jest zapisywany, a starsze dane bez języka zachowują stan i otrzymują PL', () => {
  const state = createState();
  state.language = 'en';
  const data = new Map<string, string>();
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
  saveState(store, state);
  assert.equal(loadState(store).state.language, 'en');
  const old: Record<string, unknown> = JSON.parse(JSON.stringify(state));
  delete old['language'];
  data.set(STORAGE_KEY, JSON.stringify(old));
  const restored = loadState(store);
  assert.equal(restored.error, '');
  assert.equal(restored.state.language, 'pl');
  assert.deepEqual(restored.state.processes, state.processes);
  assert.equal(isAppState({ ...state, language: 'de' }), false);
});
test('format czasu i komunikaty walidacji obsługują język angielski', () => {
  assert.equal(formatSelectedTime(new Date(2025, 0, 1), new Date(2026, 6, 1), [false, false, false, false, false, true, true], 'en'), '1y 6m');
  const process = createState().processes[0]; process.endTime = '';
  assert.equal(processTiming(process, new Date(), 'en').error, 'Enter an end time.');
});


test('język przeglądarki wybiera PL dla polskiego i EN dla pozostałych', () => {
  assert.equal(browserLanguage('pl-PL'), 'pl');
  assert.equal(browserLanguage('PL'), 'pl');
  assert.equal(browserLanguage('en-US'), 'en');
  assert.equal(browserLanguage('de-DE'), 'en');
  assert.equal(browserLanguage(undefined), 'en');
  const empty = { getItem: () => null, setItem: () => {} };
  assert.equal(loadState(empty, new Date(), 'en').state.language, 'en');
  const state = createState(); state.language = 'pl';
  const saved = { getItem: () => JSON.stringify(state), setItem: () => {} };
  assert.equal(loadState(saved, new Date(), 'en').state.language, 'pl');
  const old: Record<string, unknown> = JSON.parse(JSON.stringify(state)); delete old['language'];
  assert.equal(loadState({ ...saved, getItem: () => JSON.stringify(old) }, new Date(), 'en').state.language, 'en');
});


test('domyślne zegary obejmują Warszawę i 30 miast z prawidłowymi strefami', () => {
  const clocks = defaultWorldClocks();
  assert.equal(clocks.length, 30);
  assert.equal(clocks[0].timeZone, 'Europe/Warsaw');
  assert(clocks.every(clock => validTimeZone(clock.timeZone)));
  clocks[0].visible = false;
  assert.equal(defaultWorldClocks()[0].visible, true);
});
test('zegary świata uwzględniają czas letni, inne daty i niepełne przesunięcia godzin', () => {
  const winter = new Date('2026-01-01T00:00:00Z');
  assert.equal(zonedTime(winter, 'Europe/Warsaw', 'pl-PL').time, '01:00:00');
  assert.equal(zonedTime(new Date('2026-07-01T00:00:00Z'), 'Europe/Warsaw', 'pl-PL').time, '02:00:00');
  assert.equal(zonedTime(winter, 'Asia/Kolkata', 'en-GB').time, '05:30:00');
  const ny = zonedTime(winter, 'America/New_York', 'en-GB');
  assert.equal(ny.time, '19:00:00'); assert.match(ny.date, /31/);
});
test('migracja dodaje zegary bez utraty stanu, pusty zestaw i własne miasta pozostają zapisane', () => {
  const state = createState();
  const old: Record<string, unknown> = JSON.parse(JSON.stringify(state));
  delete old['worldClocks']; delete old['nextWorldClockId'];
  const store = { getItem: () => JSON.stringify(old), setItem: () => {} };
  const loaded = loadState(store);
  assert.equal(loaded.error, ''); assert.equal(loaded.state.worldClocks.length, 30);
  assert.deepEqual(loaded.state.processes, state.processes);
  state.worldClocks = []; state.mode = 'world';
  assert.equal(isAppState(state), true);
  assert.deepEqual(loadState({ ...store, getItem: () => JSON.stringify(state) }).state.worldClocks, []);
  state.worldClocks = [{ id: 1, name: 'Moje miasto', timeZone: 'Asia/Kathmandu', visible: true }];
  assert.equal(isAppState(state), true);
  state.worldClocks[0].timeZone = 'Bad/Zone'; assert.equal(isAppState(state), false);
});
