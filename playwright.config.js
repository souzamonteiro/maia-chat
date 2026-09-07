import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/browser',
  use: {
    baseURL: 'http://127.0.0.1:3110',
    browserName: 'chromium',
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}
  },
  webServer: {
    command: 'PORT=3110 MAIA_API_KEYS=[] npm start',
    url: 'http://127.0.0.1:3110/api/health/live',
    reuseExistingServer: false
  }
});
