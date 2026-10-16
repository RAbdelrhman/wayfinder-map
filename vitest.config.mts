import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Leave CPU and memory for the desktop app and other agents on a busy laptop.
    maxWorkers: 4,
  },
});
