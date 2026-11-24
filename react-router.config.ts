import type { Config } from '@react-router/dev/config'

export default {
  // Server-side rendering is required: every AGS call happens in loaders and
  // actions on the server, so tokens never reach the browser.
  ssr: true
} satisfies Config
