import { test, expect } from '@playwright/test';

test('liczy jedno otwarcie online bez zgody na zapis, nie wysyła danych aplikacji i nie liczy zmiany zakładek', async ({ page }) => {
  const events: unknown[] = [];
  await page.route('**/api/visits', async route => {
    events.push(route.request().postDataJSON());
    expect(route.request().headers()['cookie']).toBeUndefined();
    await route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await expect.poll(() => events.length).toBe(1);
  expect(events).toEqual([{ event: 'visit' }]);
  await page.getByRole('button', { name: 'Kontynuuj bez zapisu', exact: true }).click();
  await page.getByRole('tab', { name: 'Stoper', exact: true }).click();
  await page.getByRole('tab', { name: 'Zegary świata', exact: true }).click();
  expect(events.length).toBe(1);
  await page.reload();
  await expect.poll(() => events.length).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem('horizon.state.v1'))).toBeNull();
});
