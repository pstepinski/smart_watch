import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const popup = (page: Page) => page.getByRole('dialog', { name: 'Informacje o alarmie', exact: true });
const countdown = (page: Page) => page.getByRole('tab', { name: 'Odliczanie do', exact: true }).click();
const acknowledge = (page: Page) => popup(page).getByRole('button', { name: 'Rozumiem', exact: true }).click();

test('potwierdzenie jest zapamiętane za zgodą, oba przyciski informacji są na dole i pozwalają otworzyć popupy', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Zgadzam się na zapis', exact: true }).click();
  await countdown(page);
  await expect(popup(page)).toContainText('Nie działa po zablokowaniu telefonu');
  await page.keyboard.press('Escape');
  await expect(popup(page)).toBeVisible();
  await acknowledge(page);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Odliczanie do', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(popup(page)).not.toBeVisible();
  const footer = page.locator('footer.page-information');
  await footer.getByRole('button', { name: 'Informacje o alarmie', exact: true }).click();
  await expect(popup(page)).toBeVisible();
  await acknowledge(page);
  await footer.getByRole('button', { name: 'Informacje o zapisie i instalacji', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Zapis danych na urządzeniu', exact: true })).toBeVisible();
  expect(await page.locator('main').evaluate(main => main.lastElementChild?.tagName)).toBe('FOOTER');
});

test('bez zapisu potwierdzenie działa w sesji, ale znika po odświeżeniu', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Kontynuuj bez zapisu', exact: true }).click();
  await countdown(page);
  await acknowledge(page);
  await page.getByRole('tab', { name: 'Zegarek', exact: true }).click();
  await countdown(page);
  await expect(popup(page)).not.toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('horizon.state.v1'))).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Kontynuuj bez zapisu', exact: true }).click();
  await countdown(page);
  await expect(popup(page)).toBeVisible();
});
