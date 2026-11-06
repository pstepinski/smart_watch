import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1100, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: false, timeout: 20000 }
});
