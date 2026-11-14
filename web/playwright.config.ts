import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH, args: ['--no-sandbox'], headless: true },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_TELEMETRY_DISABLED: '1',
      API_INTERNAL_URL: 'http://127.0.0.1:8080',
      PROXY_SHARED_SECRET: 'e2e-only-private-secret-that-is-never-deployed',
      APP_ORIGIN: 'http://localhost:3000',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
      NEXT_PUBLIC_INDEXING: 'false',
    },
  },
});
