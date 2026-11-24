/**
 * Server configuration, read from environment variables once.
 *
 * Everything here stays on the server. Nothing in this file may be imported
 * by browser code, which is why the file name ends in `.server.ts`.
 */

export type Env = {
  /** Public origin of this app, for example https://portal.example.com. */
  appUrl: URL
  /** True when the app is served over HTTPS, which enables Secure cookies. */
  isHttps: boolean
  agsBaseUrl: string
  agsNamespace: string
  /** IAM public client. Not a secret. */
  agsClientId: string
}

let cached: Env | undefined

export function getEnv(): Env {
  if (cached) return cached

  const missing: string[] = []
  const read = (name: string): string => {
    const value = process.env[name]?.trim()
    if (!value) missing.push(name)
    return value ?? ''
  }

  const appUrl = read('APP_URL')
  const agsBaseUrl = read('AGS_BASE_URL')
  const agsNamespace = read('AGS_NAMESPACE')
  const agsClientId = read('AGS_CLIENT_ID')

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Copy .env.example to .env and fill it in.`)
  }

  const url = new URL(appUrl)
  cached = {
    appUrl: url,
    isHttps: url.protocol === 'https:',
    agsBaseUrl: agsBaseUrl.replace(/\/+$/, ''),
    agsNamespace,
    agsClientId
  }
  return cached
}

/** The OAuth redirect URI. It must be registered on the IAM client exactly. */
export function getRedirectUri(): string {
  return new URL('/auth/callback', getEnv().appUrl).toString()
}
