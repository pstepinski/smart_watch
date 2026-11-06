import { chromium, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createState } from '../src/app/models.ts';
import { CONSENT_KEY } from '../src/app/storage-consent.ts';
import { STORAGE_KEY } from '../src/app/persistence.ts';
import type { Mode } from '../src/app/models.ts';

// Isolated browser context: never reads or changes the user's stored app data.
const baseURL = process.env['SCREENSHOT_BASE_URL'] ?? 'http://localhost:4173';
const directory = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
await mkdir(directory, { recursive: true });
const demoTime = new Date('2026-11-06T10:24:36+01:00');
const demo = createState(demoTime, 'en');
demo.alarmInfoAcknowledged = true;
demo.processes = [
  { id: 1, name: 'Working day', color: '#5ae6c6', visible: true, startDate: '', startTime: '08:00', endDate: '', endTime: '16:00' },
  { id: 2, name: 'Design review', color: '#65baff', visible: true, startDate: '', startTime: '10:00', endDate: '', endTime: '12:30' },
  { id: 3, name: 'Next meeting', color: '#ffb366', visible: true, startDate: '', startTime: '', endDate: '', endTime: '11:00', automaticStart: +demoTime }
];
demo.nextProcessId = 4;
demo.countdownUnits = [true, true, true, false, false, false, false];
demo.countFrom = [
  { id: 1, name: 'Morning focus', startDate: '2026-11-06', startTime: '08:00:00', units: [true, true, true, false, false, false, false] },
  { id: 2, name: 'Project launch', startDate: '2025-05-01', startTime: '09:00:00', units: [false, false, false, true, false, true, true] }
];
demo.nextCountFromId = 3;
demo.timer = {
  status: 'paused', accumulated: 754560, startedAt: null, session: 2, lap: 3, lastResult: 754560, nextResultId: 5,
  results: [
    { id: 4, session: 2, kind: 'Okrążenie 3', elapsed: 754560, split: 242220 },
    { id: 3, session: 2, kind: 'Okrążenie 2', elapsed: 512340, split: 252210 },
    { id: 2, session: 2, kind: 'Okrążenie 1', elapsed: 260130, split: 260130 },
    { id: 1, session: 1, kind: 'Stop', elapsed: 985430, split: 985430 }
  ]
};
const visibleCities = ['Warszawa', 'Londyn', 'Nowy Jork', 'Dubaj', 'Tokio', 'Sydney'];
demo.worldClocks.forEach(clock => { clock.visible = visibleCities.includes(clock.name); });

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1100 }, locale: 'en-GB', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block', reducedMotion: 'reduce' });
  let page = await context.newPage();
  let viewport = { width: 1200, height: 1100 };
  async function load(mode: Mode, single = false, allowed = true) {
    await page.close();
    page = await context.newPage();
    await page.setViewportSize(viewport);
    await page.clock.setFixedTime(demoTime);
    await page.addInitScript(({ key, consentKey, state, allowed }) => {
      localStorage.setItem(key, JSON.stringify(state));
      localStorage.setItem('horizon.analyticsConsent.v1', 'denied');
      if (allowed) localStorage.setItem(consentKey, 'granted'); else localStorage.removeItem(consentKey);
    }, {
      key: STORAGE_KEY, consentKey: CONSENT_KEY, allowed, state: { ...demo, mode, countdownMode: single ? 'single' : 'all' }
    });
    await page.goto(baseURL);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator(`#${mode}Tab`)).toHaveAttribute('aria-selected', 'true');
  }
  async function capture(name: string) {
    if (viewport.width < 700) await page.screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' });
    else await page.locator('body').screenshot({ path: `${directory}/${name}.png`, animations: 'disabled' });
    console.log(`Saved docs/screenshots/${name}.png`);
  }
  await load('clock'); await capture('clock');
  await load('clock', false, false); await capture('storage-consent');
  await load('countdown'); await capture('countdown-all');
  await load('countdown', true); await capture('countdown-single');
  await load('stopwatch'); await capture('count-from');
  await load('timer'); await capture('stopwatch');
  await load('world'); await capture('world-clocks');
  await page.locator('.world-settings summary').click();
  await page.getByLabel('Filter by city name').fill('Warsaw');
  await capture('world-clocks-settings');
  viewport = { width: 390, height: 844 };
  await load('countdown');
  // Native scroll-snap without smooth scrolling keeps screenshot capture deterministic.
  const carousel = page.locator('.countdown-overview');
  await carousel.evaluate(element => { element.style.scrollSnapType = 'none'; element.scrollTo({ left: 0, behavior: 'instant' }); });
  await capture('countdown-mobile-clock');
  await carousel.evaluate(element => element.scrollTo({ left: element.clientWidth, behavior: 'instant' }));
  await expect.poll(() => carousel.evaluate(element => Math.abs(element.scrollLeft - element.clientWidth))).toBeLessThan(1);
  await capture('countdown-mobile-processes');
  await context.close();
} finally {
  await browser.close();
}
