import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Only pick up Vitest-format tests — exclude the pre-existing custom runners
    // (packing/places/ticket/itinerary-validator) that use process.exit() directly.
    include: ['tests/api/**/*.test.js', 'tests/lib/**/*.test.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['api/**/*.js', 'lib/**/*.js'],
      exclude: ['api/server.js', 'api/og.js'],
    },
    // Each file gets its own isolated module registry — prevents rate-limit
    // store and other module-level state from leaking between test files.
    isolate: true,
    pool: 'forks',
  },
})
