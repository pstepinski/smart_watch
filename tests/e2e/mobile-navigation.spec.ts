import { test, expect } from '@playwright/test';
import { createState } from '../../src/app/models';

test.use({ hasTouch: true, isMobile: true });
for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`telefon ${viewport.width}×${viewport.height}: przełącznik kart jest nad zegarkiem i długą tabelą`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const state = createState();
    state.mode = 'countdown';
    state.alarmInfoAcknowledged = true;
    state.processes = Array.from({ length: 20 }, (_, index) => ({ ...state.processes[0], id: index + 1, name: `Proces ${index + 1}` }));
    state.nextProcessId = 21;
    await page.addInitScript(state => {
      localStorage.setItem('horizon.storageConsent.v1', 'granted');
      localStorage.setItem('horizon.analyticsConsent.v1', 'denied');
      localStorage.setItem('horizon.state.v1', JSON.stringify(state));
    }, state);
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: 'Karty odliczania' });
    await expect(nav).toBeVisible();
    const bounds = (await nav.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.y + bounds.height).toBeLessThan(viewport.height);
    const carousel = page.locator('.countdown-overview');
    expect(bounds.y + bounds.height).toBeLessThanOrEqual((await carousel.boundingBox())!.y);
    await nav.getByRole('button', { name: 'Procesy', exact: true }).click();
    await expect.poll(() => carousel.evaluate(el => Math.abs(el.scrollLeft - el.clientWidth))).toBeLessThan(1);
    await nav.getByRole('button', { name: 'Zegarek', exact: true }).click();
    await expect.poll(() => carousel.evaluate(el => el.scrollLeft)).toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
  });
}
