import { test, expect, chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

// These feature tests exercise the explicit opt-in state; first-visit behaviour is covered in privacy.spec.ts.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('horizon.testConsentSeeded')) {
      localStorage.setItem('horizon.storageConsent.v1', 'granted');
      sessionStorage.setItem('horizon.testConsentSeeded', 'true');
    }
  });
});

async function saved(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('horizon.state.v1')!));
}
async function timerValue(page: Page) {
  const text = await page.locator('#timerReadout').innerText();
  const [h, m, s] = text.split(':');
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}
test('zapisuje procesy, widoczność, kolor, zakładkę i ustawienia wyświetlacza', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Zegarek', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByRole('button', { name: '+ Dodaj pasek' }).click();
  await page.getByRole('button', { name: '+ Dodaj pasek' }).click();
  await page.getByLabel('Nazwa procesu 2', { exact: true }).fill('Praca');
  await page.getByLabel('Kolor: Praca', { exact: true }).selectOption('#ff8fbc');
  await page.getByRole('switch', { name: 'Pokaż proces: Pasek 1', exact: true }).uncheck();
  await page.getByRole('switch', { name: 'Pokaż proces: Pasek 3', exact: true }).uncheck();
  await page.getByRole('switch', { name: 'Pokaż wyświetlacz cyfrowy' }).uncheck();
  await page.reload();
  await expect(page.getByLabel('Nazwa procesu 2', { exact: true })).toHaveValue('Praca');
  await expect(page.getByLabel('Kolor: Praca', { exact: true })).toHaveValue('#ff8fbc');
  await expect(page.getByRole('switch', { name: 'Pokaż proces: Pasek 1', exact: true })).not.toBeChecked();
  await expect(page.getByRole('switch', { name: 'Pokaż proces: Praca', exact: true })).toBeChecked();
  await expect(page.locator('#digitalDisplay')).toBeHidden();
  await expect(page.getByRole('tab', { name: 'Odliczanie do', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect((await saved(page)).processes).toHaveLength(3);
  expect(errors).toEqual([]);
});
test('zachowuje wiele odliczań od, wybrany proces i jednostki po restarcie', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Odliczanie od', exact: true }).click();
  await expect(page.getByLabel('Zestaw jednostek: Stoper 1')).toHaveValue('clock');
  await page.getByRole('button', { name: '+ Dodaj pozycję' }).click();
  await page.getByLabel('Nazwa odliczania 2').fill('Projekt');
  await page.getByLabel('Data początku (opcjonalnie): Projekt', { exact: true }).fill('2025-01-31');
  await page.getByLabel('Godzina początku: Projekt', { exact: true }).fill('12:00:00');
  await page.getByLabel('Zestaw jednostek: Projekt').selectOption('yearsMonths');
  await page.getByRole('radio', { name: 'Pokaż na zegarku: Projekt', exact: true }).check();
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Pokaż na zegarku: Projekt', exact: true })).toBeChecked();
  await expect(page.getByLabel('Zestaw jednostek: Projekt')).toHaveValue('yearsMonths');
  await expect(page.locator('#digitalDate')).toHaveText('Projekt');
  await expect(page.locator('#digitalTime')).toHaveText(/^\d+r \d+m$/);
  await expect(page.locator('.countdown-ring circle')).toHaveCount(2);
  await page.getByLabel('Data początku (opcjonalnie): Projekt', { exact: true }).fill('');
  await page.reload();
  await expect(page.getByLabel('Data początku (opcjonalnie): Projekt', { exact: true })).toHaveValue('');
});
test('stoper kontynuuje po przeładowaniu, pauza pozostaje na pauzie, wyniki są od najnowszego', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Stoper', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => timerValue(page)).toBeGreaterThan(.2);
  const before = await timerValue(page);
  await page.reload();
  await expect.poll(() => timerValue(page)).toBeGreaterThan(before);
  await expect(page.locator('.countdown-ring circle')).toHaveCount(3);
  await page.getByRole('button', { name: 'Okrążenie', exact: true }).click();
  await page.getByRole('button', { name: 'Pauza', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Wznów', exact: true })).toBeEnabled();
  const paused = await page.locator('#timerReadout').innerText();
  await page.reload();
  await expect(page.locator('#timerReadout')).toHaveText(paused);
  await expect(page.getByRole('button', { name: 'Wznów', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Wznów', exact: true }).click();
  await expect.poll(() => timerValue(page)).toBeGreaterThan(before + .1);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#timerPanel tbody tr')).toHaveCount(2);
  await expect(page.locator('#timerPanel tbody tr').first()).toContainText('Stop');
  await page.reload();
  await expect(page.locator('#timerPanel tbody tr').first()).toContainText('Stop');
  expect((await saved(page)).timer.status).toBe('stopped');
});
test('wybrany proces odlicza w jednostkach i zachowuje tryb oraz wybór po restarcie', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByLabel('Widok odliczania').selectOption('single');
  await page.getByLabel('Zestaw jednostek: Odliczanie do').selectOption('clock');
  await page.getByRole('button', { name: '+ Dodaj pasek' }).click();
  await page.getByRole('radio', { name: 'Pokaż na zegarku: Pasek 2', exact: true }).check();
  await page.reload();
  await expect(page.getByLabel('Widok odliczania')).toHaveValue('single');
  await expect(page.getByRole('radio', { name: 'Pokaż na zegarku: Pasek 2', exact: true })).toBeChecked();
  await expect(page.locator('#digitalDate')).toHaveText('Pasek 2');
  await expect(page.locator('#digitalTime')).toHaveText(/^\d+:\d{2}:\d{2}$/);
});
test('PWA ma manifest i uruchamia się offline z lokalnymi danymi', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true);
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByLabel('Nazwa procesu 1', { exact: true }).fill('Offline');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Nazwa procesu 1', { exact: true })).toHaveValue('Offline');
  await page.getByRole('button', { name: '+ Dodaj pasek' }).click();
  await expect(page.locator('#countdownPanel tbody tr')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('#countdownPanel tbody tr')).toHaveCount(2);
});
test('dane i uruchomiony stoper przetrwają zamknięcie oraz uruchomienie przeglądarki', async ({}, testInfo) => {
  const profile = testInfo.outputPath('profile');
  let context = await chromium.launchPersistentContext(profile, { headless: true });
  let page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('horizon.storageConsent.v1', 'granted'));
  await page.goto(testInfo.project.use.baseURL as string);
  await page.getByRole('tab', { name: 'Stoper', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => timerValue(page)).toBeGreaterThan(.1);
  const before = await timerValue(page);
  await context.close();
  context = await chromium.launchPersistentContext(profile, { headless: true });
  page = await context.newPage();
  await page.goto(testInfo.project.use.baseURL as string);
  await expect(page.getByRole('tab', { name: 'Stoper', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => timerValue(page)).toBeGreaterThan(before);
  await context.close();
});
test('mobilny układ mieści tarczę, a wyświetlacz zachowuje rozmiar między trybami', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  for (const selector of ['.watch-shell', '.bezel', '.dial']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);
  }
  const shell = (await page.locator('.watch-shell').boundingBox())!;
  const dial = (await page.locator('.dial').boundingBox())!;
  expect(Math.abs((dial.y - shell.y) - (shell.y + shell.height - dial.y - dial.height))).toBeLessThan(1);
  const initial = await page.locator('#digitalDisplay').boundingBox();
  await page.getByRole('tab', { name: 'Odliczanie od', exact: true }).click();
  const elapsed = await page.locator('#digitalDisplay').boundingBox();
  expect(elapsed?.width).toBe(initial?.width);
  expect(elapsed?.height).toBe(initial?.height);
  expect(elapsed?.y).toBe(initial?.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  expect((await page.locator('app-root').boundingBox())!.width).toBeLessThanOrEqual(390);
  expect((await page.locator('.stage').boundingBox())!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});
test('uszkodzony zapis pokazuje komunikat i pozwala dalej korzystać z aplikacji', async ({ page }) => {
  await page.goto('/');
  await page.addInitScript(() => localStorage.setItem('horizon.state.v1', '{broken'));
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Nie udało się odczytać');
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByRole('button', { name: '+ Dodaj pasek' }).click();
  await expect(page.locator('#countdownPanel tbody tr')).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('Dane są zapisywane');
});

test('sama godzina celu zapisuje bieżący początek i zachowuje odliczanie po restarcie', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByLabel('Godzina końca: Pasek 1', { exact: true }).fill('13:00');
  await page.getByLabel('Godzina początku: Pasek 1', { exact: true }).fill('');
  await expect(page.locator('#countdownPanel .range-status')).toContainText('1 godz. 0 min 0 s');
  const origin = (await saved(page)).processes[0].automaticStart;
  await page.clock.setFixedTime(new Date('2026-01-01T12:30:00'));
  await expect(page.locator('.countdown-ring circle')).toHaveCount(0);
  await page.getByLabel('Nazwa procesu 1', { exact: true }).fill('Cel');
  expect((await saved(page)).processes[0].automaticStart).toBe(origin);
  await page.reload();
  await expect(page.locator('#countdownPanel .range-status')).toContainText('0 godz. 30 min 0 s');
  expect((await saved(page)).processes[0].automaticStart).toBe(origin);
  await page.getByLabel('Widok odliczania').selectOption('single');
  await page.getByLabel('Zestaw jednostek: Odliczanie do').selectOption('clock');
  await expect(page.locator('#digitalTime')).toHaveText('00:30:00');
  await page.clock.setFixedTime(new Date('2026-01-02T12:30:00'));
  await expect(page.locator('#digitalTime')).toHaveText('00:00:00');
  await expect(page.locator('#countdownPanel .range-status')).toContainText('0 godz. 0 min 0 s');
});

test('PL/EN tłumaczy interfejs, zapamiętuje wybór i zachowuje własne nazwy oraz wyniki', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Analog × Digital · Edition 01', { exact: true })).toHaveCount(0);
  await expect(page.getByText('LIVE CLOCK', { exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByLabel('Nazwa procesu 1', { exact: true }).fill('Mój projekt');
  await page.getByLabel('Język interfejsu').selectOption('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('tab', { name: 'Countdown to', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Process name 1', { exact: true })).toHaveValue('Mój projekt');
  await expect(page.getByRole('status')).toContainText('Data is saved on this device.');
  await expect(page.getByLabel('Colour: Mój projekt')).toContainText('Mint');
  await page.getByLabel('End time: Mój projekt', { exact: true }).fill('');
  await expect(page.locator('#countdownPanel .range-status')).toHaveText('Enter an end time.');
  await page.getByRole('tab', { name: 'Count from', exact: true }).click();
  await expect(page.getByLabel('Unit preset: Stoper 1')).toContainText('Time — hours, minutes, seconds');
  await expect(page.getByRole('switch', { name: 'Stoper 1: Seconds', exact: true })).toBeChecked();
  await page.getByRole('tab', { name: 'Stopwatch', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Lap', exact: true }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await expect(page.locator('#timerPanel tbody')).toContainText('Lap 1');
  await page.reload();
  await expect(page.locator('#languageSelect')).toHaveValue('en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  await expect(page.locator('#timerPanel tbody')).toContainText('Lap 1');
  await page.getByLabel('Interface language').selectOption('pl');
  await expect(page.locator('#timerPanel tbody')).toContainText('Okrążenie 1');
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await expect(page.getByLabel('Nazwa procesu 1', { exact: true })).toHaveValue('Mój projekt');
});

for (const [locale, language, tab] of [['pl-PL', 'pl', 'Zegarek'], ['en-US', 'en', 'Clock'], ['de-DE', 'en', 'Clock']]) {
  test.describe(`język przeglądarki ${locale}`, () => {
    test.use({ locale });
    test('wybiera domyślny język i zachowuje ręczny wybór po restarcie', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      await expect(page.getByRole('tab', { name: tab, exact: true })).toBeVisible();
      const chosen = language === 'en' ? 'pl' : 'en';
      await page.locator('#languageSelect').selectOption(chosen);
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('lang', chosen);
      await expect(page.locator('#languageSelect')).toHaveValue(chosen);
    });
  });
}

test('zegary świata mają 30 domyślnych miast, zapis widoczności, usuwanie i przywracanie', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-01T00:00:00Z'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Zegary świata', exact: true }).click();
  await expect(page.locator('.world-card')).toHaveCount(30);
  await expect(page.getByRole('article', { name: 'Warszawa', exact: true }).locator('time')).toHaveText('01:00:00');
  await page.locator('.world-settings summary').click();
  await page.getByRole('button', { name: 'Ukryj wszystkie', exact: true }).click();
  await expect(page.locator('.world-card')).toHaveCount(0);
  await page.getByRole('switch', { name: 'Pokaż zegar: Warszawa', exact: true }).check();
  await expect(page.locator('.world-card')).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Zegary świata', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.world-card')).toHaveCount(1);
  await page.locator('.world-settings summary').click();
  await page.getByRole('button', { name: 'Usuń zegar: Warszawa', exact: true }).click();
  await expect(page.locator('.world-settings tbody tr')).toHaveCount(29);
  await page.getByRole('button', { name: 'Przywróć domyślne zegary', exact: true }).click();
  await expect(page.locator('.world-card')).toHaveCount(30);
  await page.reload();
  await expect(page.locator('.world-card')).toHaveCount(30);
});
test('dodaje miasto z listy i własne ze strefą, zachowuje je po restarcie i tłumaczy interfejs', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Zegary świata', exact: true }).click();
  await page.locator('.world-settings summary').click();
  await page.getByLabel('Miasto', { exact: true }).selectOption('30');
  await page.getByRole('button', { name: '+ Dodaj zegar', exact: true }).click();
  await expect(page.getByRole('article', { name: 'Zurych', exact: true })).toBeVisible();
  await page.getByLabel('Miasto', { exact: true }).selectOption('custom');
  await page.getByLabel('Nazwa miasta', { exact: true }).fill('Moje miasto');
  await page.getByLabel('Strefa czasowa', { exact: true }).selectOption('Asia/Kathmandu');
  await page.getByRole('button', { name: '+ Dodaj zegar', exact: true }).click();
  await expect(page.locator('.world-card')).toHaveCount(32);
  await page.reload();
  await expect(page.getByRole('article', { name: 'Moje miasto', exact: true })).toContainText('UTC+5:45');
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.getByRole('tab', { name: 'World clocks', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('article', { name: 'Warsaw', exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Moje miasto', exact: true })).toBeVisible();
});
test('mobilne zegary świata są okrągłe i mieszczą się na ekranie', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('tab', { name: 'Zegary świata', exact: true }).click();
  const boxes = await page.locator('.world-watch, .world-watch .bezel, .world-watch .dial').evaluateAll(elements => elements.map(element => { const b = element.getBoundingClientRect(); return { width: b.width, height: b.height, right: b.right, left: b.left }; }));
  expect(boxes.every(b => Math.abs(b.width - b.height) < 1 && b.left >= 0 && b.right <= 390)).toBe(true);
  await page.screenshot({ path: 'test-results/world-mobile.png', fullPage: true });
});

test('filtr miast obejmuje tabelę i zegary, polskie i angielskie nazwy oraz diakrytykę', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Zegary świata', exact: true }).click();
  await page.getByLabel('Filtruj po nazwie miasta').fill(' WARSAW ');
  await expect(page.locator('.world-card')).toHaveCount(1);
  await expect(page.getByRole('article', { name: 'Warszawa', exact: true })).toBeVisible();
  await page.locator('.world-settings summary').click();
  await expect(page.locator('#worldCityTable tbody tr')).toHaveCount(1);
  await page.getByLabel('Filtruj po nazwie miasta').fill('paryz');
  await expect(page.getByRole('article', { name: 'Paryż', exact: true })).toBeVisible();
  await expect(page.locator('#worldCityTable tbody tr')).toHaveCount(1);
  await page.getByLabel('Filtruj po nazwie miasta').fill('brak-takiego-miasta');
  await expect(page.locator('.world-card')).toHaveCount(0);
  await expect(page.getByText('Brak miast pasujących do filtra.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Wyczyść filtr', exact: true }).click();
  await expect(page.locator('.world-card')).toHaveCount(30);
  await expect(page.locator('#worldCityTable tbody tr')).toHaveCount(30);
  await page.getByLabel('Filtruj po nazwie miasta').fill('warsz');
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.getByRole('article', { name: 'Warsaw', exact: true })).toBeVisible();
  await expect(page.getByLabel('Filter by city name')).toHaveValue('warsz');
});

test('usuwa pojedyncze i wszystkie wyniki stopera bez przerywania pomiaru, zapisuje usunięcia', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('tab', { name: 'Stoper', exact: true }).click();
  const clear = page.getByRole('button', { name: 'Usuń wszystkie wyniki', exact: true });
  await expect(clear).toBeDisabled();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect.poll(() => timerValue(page)).toBeGreaterThan(.1);
  await page.getByRole('button', { name: 'Okrążenie', exact: true }).click();
  await page.getByRole('button', { name: 'Okrążenie', exact: true }).click();
  await expect(page.locator('#timerPanel tbody tr')).toHaveCount(2);
  const before = await saved(page);
  await page.getByRole('button', { name: 'Usuń wynik: Okrążenie 1 · Pomiar 1', exact: true }).click();
  await expect(page.locator('#timerPanel tbody tr')).toHaveCount(1);
  await expect(page.locator('#timerPanel tbody')).toContainText('Okrążenie 2');
  expect((await saved(page)).timer.lastResult).toBe(before.timer.lastResult);
  await page.reload();
  await expect(page.locator('#timerPanel tbody tr')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Pauza', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Usuń wszystkie wyniki', exact: true }).click();
  await expect(page.locator('#timerPanel tbody tr')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Usuń wszystkie wyniki', exact: true })).toBeDisabled();
  expect((await saved(page)).timer.status).toBe('running');
  await page.reload();
  await expect(page.locator('#timerPanel tbody tr')).toHaveCount(0);
  await page.getByRole('button', { name: 'Okrążenie', exact: true }).click();
  await expect(page.locator('#timerPanel tbody')).toContainText('Okrążenie 3');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#timerPanel tbody tr')).toHaveCount(2);
  await page.locator('#languageSelect').selectOption('en');
  await expect(page.getByRole('button', { name: 'Delete all results', exact: true })).toBeEnabled();
});

test('odliczanie wielu procesów ma tabelę obok zegarka z jednostkami i procentem upływu', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  const clock = (await page.locator('#overviewClock').boundingBox())!;
  const summary = (await page.locator('#overviewProcesses').boundingBox())!;
  expect(summary.x).toBeGreaterThan(clock.x + clock.width);
  await expect(page.locator('.process-summary tbody tr')).toHaveCount(1);
  await expect(page.locator('.process-summary tbody tr')).toContainText('4 godz. 0 min 0 s');
  await expect(page.locator('.process-summary tbody tr')).toContainText('50%');
  await page.getByRole('button', { name: '+ Dodaj pasek', exact: true }).click();
  await expect(page.locator('.process-summary tbody tr')).toHaveCount(2);
  await page.getByRole('switch', { name: 'Pokaż proces: Pasek 2', exact: true }).uncheck();
  await expect(page.locator('.process-summary tbody tr')).toHaveCount(1);
  await expect(page.locator('.process-summary')).not.toContainText('Pasek 2');
  await page.getByRole('switch', { name: 'Pokaż proces: Pasek 2', exact: true }).check();
  await expect(page.locator('.process-summary tbody tr')).toHaveCount(2);
  await page.getByLabel('Godzina końca: Pasek 2', { exact: true }).fill('');
  await expect(page.locator('.process-summary tbody tr').nth(1)).toContainText('—');
  await page.getByLabel('Widok odliczania').selectOption('single');
  await expect(page.locator('#overviewProcesses')).toHaveCount(0);
});

test.describe('karuzela odliczania na telefonie', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('przesuwa zegarek gestem do tabeli i pozwala wrócić przyciskiem', async ({ page, context }) => {
    await page.goto('/');
    await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
    const carousel = page.locator('.countdown-overview');
    const bounds = (await carousel.boundingBox())!;
    const y = Math.min(bounds.y + 150, 700);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 340, y }] });
    for (const x of [300, 240, 180, 120, 60]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => carousel.evaluate(el => Math.abs(el.scrollLeft - el.clientWidth))).toBeLessThan(1);
    const table = (await page.locator('#overviewProcesses').boundingBox())!;
    expect(table.x).toBeGreaterThanOrEqual(0);
    expect(table.x + table.width).toBeLessThanOrEqual(391);
    await page.getByRole('navigation', { name: 'Karty odliczania' }).getByRole('button', { name: 'Zegarek', exact: true }).click();
    await expect.poll(() => carousel.evaluate(el => el.scrollLeft)).toBeLessThan(1);
    await page.getByRole('navigation', { name: 'Karty odliczania' }).getByRole('button', { name: 'Procesy', exact: true }).click();
    await expect.poll(() => carousel.evaluate(el => Math.abs(el.scrollLeft - el.clientWidth))).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect.poll(async () => (await page.locator('#overviewProcesses').boundingBox())!.x).toBeLessThan(10);
    await page.screenshot({ path: 'test-results/countdown-carousel.png', fullPage: true });
  });
});


test('pusty początek w widoku wszystkich procesów pokazuje tylko pozostałe jednostki bez pierścienia i procentu', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByRole('button', { name: '+ Dodaj pasek', exact: true }).click();
  await page.getByLabel('Godzina początku: Pasek 2', { exact: true }).fill('');
  await expect(page.locator('.countdown-ring circle')).toHaveCount(1);
  const automatic = page.locator('.process-summary tbody tr').nth(1);
  await expect(automatic).toContainText('4 godz. 0 min 0 s');
  await expect(automatic).not.toContainText('%');
  await expect(page.locator('#countdownPanel .range-status').nth(1)).not.toContainText('%');
  await expect(page.locator('.process-summary tbody tr').first()).toContainText('50%');
  await page.getByLabel('Godzina początku: Pasek 1', { exact: true }).fill('');
  await expect(page.locator('.countdown-ring circle')).toHaveCount(0);
  await expect(page.locator('.process-summary')).not.toContainText('%');
  await page.getByLabel('Widok odliczania').selectOption('single');
  await expect(page.locator('.countdown-ring circle')).toHaveCount(7);
});

test('odliczanie od ma podsumowanie wszystkich procesów z jednostkami i wyborem zegarka', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Odliczanie od', exact: true }).click();
  await page.getByLabel('Godzina początku: Stoper 1', { exact: true }).fill('10:00:00');
  await page.getByRole('button', { name: '+ Dodaj pozycję', exact: true }).click();
  await page.getByLabel('Godzina początku: Stoper 2', { exact: true }).fill('11:00:00');
  await expect(page.locator('.elapsed-summary tbody tr')).toHaveCount(2);
  await expect(page.locator('.elapsed-summary tbody tr').first()).toContainText('2 godz. 0 min 0 s');
  await expect(page.locator('.elapsed-summary tbody tr').nth(1)).toContainText('1 godz. 0 min 0 s');
  const clock = (await page.locator('#overviewClock').boundingBox())!;
  expect((await page.locator('#overviewProcesses').boundingBox())!.x).toBeGreaterThan(clock.x + clock.width);
  await page.getByRole('radio', { name: 'Wybierz proces: Stoper 2', exact: true }).check();
  await expect(page.locator('#digitalDate')).toHaveText('Stoper 2');
  await page.reload();
  await expect(page.getByRole('radio', { name: 'Wybierz proces: Stoper 2', exact: true })).toBeChecked();
  await page.getByLabel('Zestaw jednostek: Stoper 1').selectOption('seconds');
  await expect(page.locator('.elapsed-summary tbody tr').first()).toContainText('7200 s');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('navigation', { name: 'Karty odliczania' }).getByRole('button', { name: 'Procesy', exact: true }).click();
  await expect.poll(() => page.locator('.countdown-overview').evaluate(el => Math.abs(el.scrollLeft - el.clientWidth))).toBeLessThan(1);
  expect((await page.locator('#overviewProcesses').boundingBox())!.x).toBeLessThan(10);
});

test.describe('wyświetlacz po przeciwnej stronie wskazówki godzinowej', () => {
  test.use({ timezoneId: 'Europe/Warsaw' });
  test('zmienia stronę na granicach 3 i 9 we wszystkich trybach głównej tarczy', async ({ page }) => {
    await page.goto('/');
    for (const tab of ['Zegarek', 'Odliczanie do', 'Odliczanie od', 'Stoper']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      for (const [time, above] of [['02:59:59', false], ['03:00:00', true], ['08:59:59', true], ['09:00:00', false], ['15:00:00', true], ['21:00:00', false]] as const) {
        await page.clock.setFixedTime(new Date(`2026-01-01T${time}+01:00`));
        if (above) await expect(page.locator('#digitalDisplay')).toHaveClass(/digital-above/);
        else await expect(page.locator('#digitalDisplay')).not.toHaveClass(/digital-above/);
        const dial = (await page.locator('#overviewClock .dial').boundingBox())!;
        const display = (await page.locator('#digitalDisplay').boundingBox())!;
        if (above) expect(display.y + display.height).toBeLessThan(dial.y + dial.height / 2);
        else expect(display.y).toBeGreaterThan(dial.y + dial.height / 2);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.setFixedTime(new Date('2026-01-01T06:00:00+01:00'));
    await expect(page.locator('#digitalDisplay')).toHaveClass(/digital-above/);
    const dial = (await page.locator('#overviewClock .dial').boundingBox())!;
    const display = (await page.locator('#digitalDisplay').boundingBox())!;
    expect(display.y + display.height).toBeLessThan(dial.y + dial.height / 2);
  });
});
