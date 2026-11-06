import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const consentKey = 'horizon.analyticsConsent.v1';
const visitorKey = 'horizon.visitorId.v1';
const optIn = (page: Page) => page.getByRole('checkbox', { name: 'Zgadzam się na rozpoznawanie tej przeglądarki w statystykach', exact: true });
const footer = (page: Page) => page.getByRole('checkbox', { name: 'Rozpoznawaj tę przeglądarkę w statystykach', exact: true });
const info = (page: Page) => page.getByRole('dialog', { name: 'Zapis danych na urządzeniu', exact: true });
const read = (page: Page) => page.evaluate(({consentKey,visitorKey}) => ({ consent: localStorage.getItem(consentKey), id: localStorage.getItem(visitorKey) }), {consentKey,visitorKey});

let events: { visitorId: string }[];
test.beforeEach(async ({ context }) => {
  events = [];
  await context.route('**/api/visits', route => route.fulfill({ status: 204 }));
  await context.route('**/api/visitors', async route => {
    expect(route.request().headers()['cookie']).toBeUndefined();
    events.push(route.request().postDataJSON());
    await route.fulfill({ status: 204 });
  });
});

test('domyślnie brak identyfikatora, zgoda na ustawienia nie włącza rozpoznawania, zgoda analityczna zachowuje ID po restarcie', async ({ page }) => {
  await page.goto('/');
  await expect(optIn(page)).not.toBeChecked();
  expect(await read(page)).toEqual({consent:null,id:null});
  expect(events).toHaveLength(0);
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  await expect(info(page)).not.toBeVisible();
  expect(await read(page)).toEqual({consent:'denied',id:null});
  await footer(page).check();
  await expect.poll(() => events.length).toBe(1);
  const first = await read(page);
  expect(first.consent).toBe('granted');
  expect(first.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(events).toEqual([{visitorId:first.id}]);
  await page.reload();
  await expect(info(page)).not.toBeVisible();
  await expect.poll(() => events.length).toBe(2);
  expect(await read(page)).toEqual(first);
  expect(events[1]).toEqual(events[0]);
});

test('zgoda analityczna działa bez zgody na ustawienia, można ją wycofać i otrzymać nowe ID po ponownym włączeniu', async ({ page }) => {
  await page.goto('/');
  await optIn(page).check();
  await expect.poll(() => events.length).toBe(1);
  const first = await read(page);
  await page.getByRole('button', { name: 'Kontynuuj bez zapisu', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('horizon.state.v1'))).toBeNull();
  await footer(page).uncheck();
  expect(await read(page)).toEqual({consent:'denied',id:null});
  await page.reload();
  await expect(optIn(page)).not.toBeChecked();
  expect(events).toHaveLength(1);
  await optIn(page).check();
  await expect.poll(() => events.length).toBe(2);
  expect((await read(page)).id).not.toBe(first.id);
});

test('istniejąca instalacja z zapisem ustawień dostaje osobny wybór statystyk i może odmówić', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('horizon.storageConsent.v1','granted'));
  await page.goto('/');
  await expect(info(page)).toBeVisible();
  await expect(optIn(page)).not.toBeChecked();
  await info(page).locator('.storage-banner-actions').getByRole('button', { name: 'Zamknij', exact: true }).click();
  expect(await read(page)).toEqual({consent:'denied',id:null});
  await page.reload();
  await expect(info(page)).not.toBeVisible();
  expect(events).toHaveLength(0);
});

test('wycofanie zgody zatrzymuje rozpoznawanie także w drugiej karcie', async ({ page, context }) => {
  await page.goto('/');
  await optIn(page).check();
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  const other = await context.newPage();
  await other.goto('/');
  await expect(footer(other)).toBeChecked();
  await footer(page).uncheck();
  await expect(footer(other)).not.toBeChecked();
  const count = events.length;
  await other.reload();
  await expect(footer(other)).not.toBeChecked();
  expect(events).toHaveLength(count);
  expect((await read(other)).id).toBeNull();
});

test('blokada localStorage uniemożliwia zgodę, ale pozwala zamknąć popup i używać aplikacji', async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error('Storage blocked'); }; });
  await page.goto('/');
  await optIn(page).click();
  await expect(optIn(page)).not.toBeChecked();
  await expect(info(page)).toContainText('Nie udało się zapisać wyboru statystyk');
  expect(events).toHaveLength(0);
  await page.getByRole('button', { name: 'Kontynuuj bez zapisu', exact: true }).click();
  await expect(info(page)).not.toBeVisible();
});
