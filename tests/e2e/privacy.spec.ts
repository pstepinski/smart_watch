import { createState } from '../../src/app/models';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const stateKey = 'horizon.state.v1';
const consentKey = 'horizon.storageConsent.v1';
const checkbox = (page: Page) => page.getByRole('checkbox', { name: 'Zapisuj dane na tym urządzeniu', exact: true });
const banner = (page: Page) => page.getByRole('dialog', { name: 'Zapis danych na urządzeniu', exact: true });
const read = (page: Page) => page.evaluate(({ stateKey, consentKey }) => ({ state: localStorage.getItem(stateKey), consent: localStorage.getItem(consentKey) }), { stateKey, consentKey });

// Feature tests acknowledge the alarm introduction; its lifecycle is tested separately.
test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(page.getByRole('dialog', { name: 'Informacje o alarmie', exact: true }), async () => {
    await page.getByRole('button', { name: 'Rozumiem', exact: true }).click();
  });
});

test('bez zgody nie zapisuje stanu, języka ani nie rejestruje PWA, odmowa działa w sesji', async ({ page }) => {
  await page.goto('/');
  await expect(banner(page)).toBeVisible();
  await expect(checkbox(page)).not.toBeChecked();
  expect(await read(page)).toEqual({ state: null, consent: null });
  await page.getByRole('button', { name: 'Kontynuuj bez zapisu', exact: true }).click();
  await expect(banner(page)).toHaveCount(0);
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByLabel('Nazwa procesu 1', { exact: true }).fill('Bez zapisu');
  await page.locator('#languageSelect').selectOption('en');
  expect(await read(page)).toEqual({ state: null, consent: null });
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
  await page.reload();
  await expect(banner(page)).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Zegarek', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await read(page)).toEqual({ state: null, consent: null });
});

test('zgoda zapamiętuje wybór i dane, banner nie wraca, PWA może działać offline', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  await expect(banner(page)).toHaveCount(0);
  await expect(checkbox(page)).toBeChecked();
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await page.getByLabel('Nazwa procesu 1', { exact: true }).fill('Zapamiętane');
  expect((await read(page)).consent).toBe('granted');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(banner(page)).toHaveCount(0);
  await expect(page.getByLabel('Nazwa procesu 1', { exact: true })).toHaveValue('Zapamiętane');
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Nazwa procesu 1', { exact: true })).toHaveValue('Zapamiętane');
});

test('anulowanie wyłączenia zachowuje dane, potwierdzenie kasuje zapis i cache aplikacji', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.getByRole('tab', { name: 'Stoper', exact: true }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Okrążenie', exact: true }).click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  const stored = await read(page);
  page.once('dialog', dialog => { expect(dialog.message()).toContain('usunie'); return dialog.dismiss(); });
  await checkbox(page).click();
  await expect(checkbox(page)).toBeChecked();
  expect(await read(page)).toEqual(stored);
  await page.evaluate(async () => { const cache = await caches.open('unrelated-app'); await cache.put('/other-data', new Response('keep')); });
  page.once('dialog', dialog => dialog.accept());
  await checkbox(page).uncheck();
  await expect(checkbox(page)).not.toBeChecked();
  await expect(checkbox(page)).toBeEnabled();
  expect(await read(page)).toEqual({ state: null, consent: null });
  expect(await page.evaluate(() => caches.keys())).toEqual(['unrelated-app']);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(items => items.length))).toBe(0);
  await page.getByRole('tab', { name: 'Stoper', exact: true }).click();
  await expect(page.locator('#timerPanel tbody tr')).toHaveCount(0);
  await page.reload();
  await expect(banner(page)).toBeVisible();
  expect(await read(page)).toEqual({ state: null, consent: null });
});

test('checkbox ponownie włącza zapis po usunięciu, a zgoda jest obsługiwana w EN', async ({ page }) => {
  await page.goto('/');
  await page.locator('#dialogLanguageSelect').selectOption('en');
  await page.getByRole('button', { name: 'Allow saving', exact: true }).click();
  const input = page.getByRole('checkbox', { name: 'Save data on this device', exact: true });
  await expect(input).toBeChecked();
  page.once('dialog', dialog => { expect(dialog.message()).toContain('delete'); return dialog.accept(); });
  await input.uncheck();
  await expect(input).toBeEnabled();
  await expect(input).not.toBeChecked();
  await input.check();
  await expect(input).toBeEnabled();
  expect((await read(page)).consent).toBe('granted');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Data storage on this device', exact: true })).toHaveCount(0);
  await expect(input).toBeChecked();
});

test('wycofanie zgody w drugiej karcie nie pozwala starej karcie odtworzyć zapisu', async ({ page, context }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  const other = await context.newPage(); await other.goto('/');
  page.once('dialog', dialog => dialog.accept());
  await checkbox(page).uncheck();
  await expect(checkbox(page)).toBeEnabled();
  await expect(checkbox(other)).not.toBeChecked();
  await other.getByRole('button', { name: 'Kontynuuj bez zapisu', exact: true }).click();
  await other.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await other.getByLabel('Nazwa procesu 1', { exact: true }).fill('Nie przywracaj');
  await other.reload();
  expect(await read(other)).toEqual({ state: null, consent: null });
});

test('błąd zapisu nie zapisuje zgody i nie ukrywa bannera', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError'); }; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  await expect(banner(page)).toBeVisible();
  await expect(checkbox(page)).not.toBeChecked();
  await expect(page.locator('.storage-status.error')).toContainText('Nie udało się zapisać');
  expect(await read(page)).toEqual({ state: null, consent: null });
});


test('starszy zapis bez zgody jest odtwarzany dopiero po zaakceptowaniu bannera', async ({ page }) => {
  const legacy = createState();
  legacy.mode = 'countdown'; legacy.processes[0].name = 'Wcześniejszy proces';
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: stateKey, value: legacy });
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Zegarek', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(banner(page)).toBeVisible();
  expect((await read(page)).consent).toBeNull();
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  await expect(page.getByLabel('Nazwa procesu 1', { exact: true })).toHaveValue('Wcześniejszy proces');
  await expect(banner(page)).toHaveCount(0);
});

test('nieudany zapis danych cofa flagę zgody i zachowuje poprzedni zapis', async ({ page }) => {
  const legacy = createState(); legacy.processes[0].name = 'Nie usuwaj';
  await page.addInitScript(({ key, state }) => {
    const original = Storage.prototype.setItem;
    original.call(localStorage, key, JSON.stringify(state));
    Storage.prototype.setItem = function (name, value) {
      if (name === key) throw new DOMException('Quota', 'QuotaExceededError');
      original.call(this, name, value);
    };
  }, { key: stateKey, state: legacy });
  await page.goto('/');
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  await expect(banner(page)).toBeVisible();
  const stored = await read(page);
  expect(stored.consent).toBeNull();
  expect(JSON.parse(stored.state!).processes[0].name).toBe('Nie usuwaj');
});

test('popup można odczytać ponownie bez zmiany zgody, zawiera instrukcje Android i iOS', async ({ page }) => {
  await page.goto('/');
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toHaveJSProperty('open', true);
  await banner(page).getByText('Jak zapisać aplikację na telefonie?', { exact: true }).click();
  await expect(banner(page).getByRole('heading', { name: 'Android · Chrome', exact: true })).toBeVisible();
  await expect(banner(page).getByRole('heading', { name: 'iPhone / iPad · Safari', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(banner(page)).toHaveCount(0);
  expect((await read(page)).consent).toBeNull();
  await page.getByRole('button', { name: 'Informacje o zapisie i instalacji', exact: true }).click();
  await expect(banner(page)).toBeVisible();
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  await expect(banner(page)).toHaveCount(0);
  const stored = await read(page);
  await page.getByRole('button', { name: 'Informacje o zapisie i instalacji', exact: true }).click();
  await expect(banner(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true })).toHaveCount(0);
  await banner(page).locator('.popup-close').click();
  expect(await read(page)).toEqual(stored);
});

test('flagi i język są w prawym górnym rogu, a popup jest dostępny na telefonie', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.locator('#dialogLanguageSelect').selectOption('en');
  const dialog = page.getByRole('dialog', { name: 'Data storage on this device', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue without saving', exact: true }).click();
  const select = page.locator('#languageSelect');
  await expect(select.locator('option')).toContainText(['🇵🇱 PL', '🇬🇧 EN']);
  const box = (await select.boundingBox())!;
  expect(box.y).toBeLessThan(30); expect(box.x).toBeGreaterThan(280);
  await page.getByRole('button', { name: 'Storage and installation information', exact: true }).click();
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.height).toBeLessThanOrEqual(844);
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
});

test('zmiana języka w popupie nie usuwa wcześniejszych ustawień przy zgodzie', async ({ page }) => {
  const legacy = createState(); legacy.mode = 'countdown'; legacy.processes[0].name = 'Zachowany proces';
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key: stateKey, state: legacy });
  await page.goto('/');
  await page.locator('#dialogLanguageSelect').selectOption('en');
  await page.getByRole('button', { name: 'Allow saving', exact: true }).click();
  await expect(page.getByLabel('Process name 1', { exact: true })).toHaveValue('Zachowany proces');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
