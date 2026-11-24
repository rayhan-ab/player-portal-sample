import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts: unit tests do not need the React Router plugin.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: { include: ['app/**/*.test.ts'], environment: 'node' }
})
