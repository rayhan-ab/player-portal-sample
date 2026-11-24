import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  // Load .env into process.env for the dev server, so server code reads the
  // same variables it reads in production. Vite only exposes VITE_-prefixed
  // variables to the browser bundle, and this app has none.
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ''))) {
    process.env[key] ??= value
  }

  return {
    plugins: [tailwindcss(), reactRouter()],
    resolve: { tsconfigPaths: true }
  }
})
