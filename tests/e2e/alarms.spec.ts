import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ locale: 'pl-PL', timezoneId: 'Europe/Warsaw' });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('horizon.storageConsent.v1', 'granted');
    const state = window as unknown as { alarmTones: number };
    state.alarmTones = 0;
    const original = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      state.alarmTones++;
      const source = original.call(this);
      (window as unknown as { alarmSource: AudioBufferSourceNode }).alarmSource = source;
      return source;
    };
  });
  await page.clock.setFixedTime(new Date('2026-01-01T11:59:58+01:00'));
  await page.goto('/');
  await page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
  await expect(page.getByText('Alarm działa tylko przy otwartej, aktywnej aplikacji i włączonym ekranie.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Rozumiem', exact: true }).click();
  await page.getByLabel('Godzina końca: Pasek 1', { exact: true }).fill('12:00');
});
const alarm = (page: Page) => page.getByRole('checkbox', { name: 'Alarm: Pasek 1', exact: true });
const tones = (page: Page) => page.evaluate(() => (window as unknown as { alarmTones: number }).alarmTones);
async function beforeDeadline(page: Page) {
  await page.clock.setFixedTime(new Date('2026-01-01T11:59:59+01:00'));
  await expect(page.locator('#digitalTime')).toHaveText('11:59:59');
}

test('alarm jednorazowy gra przy aktywnej aplikacji i pokazuje jasną informację o ograniczeniach', async ({ page }) => {
  await expect(page.getByRole('dialog', { name: 'Informacje o alarmie', exact: true })).not.toBeVisible();
  await alarm(page).check();
  await expect(page.getByText('Dźwięk jest włączony w tej sesji.', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Alarm włączony', exact: true })).toHaveCount(2);
  await beforeDeadline(page);
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00+01:00'));
  await expect(page.locator('.alarm-notices')).toContainText('Czas upłynął!');
  expect(await tones(page)).toBe(1);
  await expect(alarm(page)).not.toBeChecked();
  await expect(page.getByRole('img', { name: 'Alarm włączony', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { alarmSource: AudioBufferSourceNode }).alarmSource.loop)).toBe(true);
  await page.evaluate(() => {
    (window as unknown as { alarmEnded: boolean }).alarmEnded = false;
    (window as unknown as { alarmSource: AudioBufferSourceNode }).alarmSource.addEventListener('ended', () => { (window as unknown as { alarmEnded: boolean }).alarmEnded = true; });
  });
  // A real alarm still rings after the entire 5.4-second test sequence would have ended.
  await page.waitForTimeout(5600);
  expect(await page.evaluate(() => (window as unknown as { alarmEnded: boolean }).alarmEnded)).toBe(false);
  await expect(page.getByRole('button', { name: 'Włącz i przetestuj dźwięk alarmów', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Zamknij alarm i wyłącz dźwięk', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { alarmEnded: boolean }).alarmEnded)).toBe(true);
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:01+01:00'));
  await expect(page.locator('#digitalTime')).toHaveText('12:00:01');
  await expect(page.locator('.alarm-notices')).toHaveCount(0);
  expect(await tones(page)).toBe(1);
  await page.reload();
  await expect(alarm(page)).not.toBeChecked();
});

test('zmiana terminu anuluje alarm i nie pozwala ustawić go dla minionego celu', async ({ page }) => {
  await alarm(page).check();
  await page.getByLabel('Godzina końca: Pasek 1', { exact: true }).fill('13:00');
  await expect(alarm(page)).not.toBeChecked();
  await page.getByLabel('Godzina końca: Pasek 1', { exact: true }).fill('10:00');
  await alarm(page).click();
  await expect(alarm(page)).not.toBeChecked();
  await expect(page.locator('.alarm-audio-controls')).toContainText('prawidłowy termin końca w przyszłości');
});

test('w tle nie odtwarza dźwięku i po powrocie informuje o miniętym terminie', async ({ page }) => {
  await alarm(page).check();
  await beforeDeadline(page);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00+01:00'));
  await expect(page.locator('.alarm-notices')).toContainText('Termin minął, gdy alarm nie mógł zadziałać.');
  expect(await tones(page)).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:01+01:00'));
  await expect(page.locator('#digitalTime')).toHaveText('12:00:01');
  expect(await tones(page)).toBe(0);
});

test('po przeładowaniu dźwięk wymaga gestu użytkownika, a przeterminowany alarm nie gra z opóźnieniem', async ({ page }) => {
  await alarm(page).check();
  await page.reload();
  await expect(alarm(page)).toBeChecked();
  await expect(page.getByText('Dźwięk wymaga włączenia w tej sesji.', { exact: true })).toBeVisible();
  await beforeDeadline(page);
  await page.clock.setFixedTime(new Date('2026-01-01T12:00:00+01:00'));
  await expect(page.locator('.alarm-notices')).toContainText('Termin minął, gdy alarm nie mógł zadziałać.');
  expect(await tones(page)).toBe(0);
});


test('test dźwięku można natychmiast zatrzymać i uruchomić ponownie bez rozbrajania alarmu', async ({ page }) => {
  await alarm(page).check();
  const start = page.getByRole('button', { name: 'Włącz i przetestuj dźwięk alarmów', exact: true });
  const stop = page.getByRole('button', { name: 'Zatrzymaj test dźwięku', exact: true });
  await start.click();
  await expect(stop).toBeVisible();
  await page.evaluate(() => {
    const source = (window as unknown as { alarmSource: AudioBufferSourceNode }).alarmSource;
    (window as unknown as { stopped: boolean }).stopped = false;
    source.addEventListener('ended', () => { (window as unknown as { stopped: boolean }).stopped = true; });
  });
  await stop.click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { stopped: boolean }).stopped)).toBe(true);
  await expect(stop).toHaveCount(0);
  await expect(alarm(page)).toBeChecked();
  await start.click();
  await expect(stop).toBeVisible();
  await stop.click();
  expect(await tones(page)).toBe(2);
});
