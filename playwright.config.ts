import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './generated/tests',
  use: {
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
