import { getEnv } from './env.server'

/**
 * Sessions, kept in HttpOnly cookies. No database, no Redis, no secret.
 *
 * Three cookies, each read only by this server (HttpOnly, so page scripts
 * can't see them):
 *   session_access   the AGS access token; expires a minute before the token
 *   session_refresh  the AGS refresh token
 *   session_signin   a sign-in in progress (OAuth state and PKCE verifier)
 *
 * The player can see and edit their own cookies, so the server never trusts
 * them for anything AGS doesn't check: AGS validates the token on every call,
 * and `returnTo` is validated before any redirect (see safeReturnTo).
 */

/** Tokens as IAM returns them. */
export type AuthTokens = {
  accessToken: string
  refreshToken: string
  /** Seconds. */
  expiresIn: number
  /** Seconds. */
  refreshExpiresIn: number
}

/** A sign-in that has started but not finished (the OAuth round trip). */
export type PendingSignIn = {
  state: string
  codeVerifier: string
  /** Where to send the player after sign-in. Pass through safeReturnTo. */
  returnTo: string
  createdAt: number
  /** IAM authorization request the sign-in form posts against. */
  requestId?: string
}

export type Session = {
  accessToken?: string
  refreshToken?: string
  pendingSignIn?: PendingSignIn
}

const ACCESS = 'session_access'
const REFRESH = 'session_refresh'
const SIGNIN = 'session_signin'

/** How long a sign-in in progress lives. */
const SIGNIN_TTL_SECONDS = 15 * 60
/** Drop the access token this early, so the next request refreshes it in time. */
const ACCESS_MARGIN_SECONDS = 60

function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const attributes = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`]
  if (getEnv().isHttps) attributes.push('Secure')
  return attributes.join('; ')
}

function readCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return cookies
}

/** Keep only a well-formed, unexpired sign-in; the cookie is input from the browser. */
function parsePendingSignIn(value: string | undefined): PendingSignIn | undefined {
  try {
    const p = JSON.parse(Buffer.from(value ?? '', 'base64url').toString('utf8'))
    const ok =
      typeof p.state === 'string' &&
      typeof p.codeVerifier === 'string' &&
      typeof p.returnTo === 'string' &&
      typeof p.createdAt === 'number' &&
      p.createdAt + SIGNIN_TTL_SECONDS * 1000 > Date.now()
    if (!ok) return undefined
    const pending: PendingSignIn = { state: p.state, codeVerifier: p.codeVerifier, returnTo: p.returnTo, createdAt: p.createdAt }
    if (typeof p.requestId === 'string') pending.requestId = p.requestId
    return pending
  } catch {
    return undefined
  }
}

export function readSession(request: Request): Session {
  const cookies = readCookies(request)
  return {
    accessToken: cookies.get(ACCESS) || undefined,
    refreshToken: cookies.get(REFRESH) || undefined,
    pendingSignIn: parsePendingSignIn(cookies.get(SIGNIN))
  }
}

/** Set-Cookie values for a signed-in player. Also ends any sign-in in progress. */
export function saveTokens(tokens: AuthTokens): string[] {
  return [
    serializeCookie(ACCESS, tokens.accessToken, tokens.expiresIn - ACCESS_MARGIN_SECONDS),
    serializeCookie(REFRESH, tokens.refreshToken, tokens.refreshExpiresIn),
    serializeCookie(SIGNIN, '', 0)
  ]
}

/** Set-Cookie value for a sign-in in progress. */
export function savePendingSignIn(pending: PendingSignIn): string[] {
  return [serializeCookie(SIGNIN, Buffer.from(JSON.stringify(pending)).toString('base64url'), SIGNIN_TTL_SECONDS)]
}

/** Set-Cookie values that clear everything (sign-out). */
export function clearSession(): string[] {
  return [ACCESS, REFRESH, SIGNIN].map(name => serializeCookie(name, '', 0))
}

/** True if a response already sets session cookies (so a refresh must not overwrite them). */
export function setsSessionCookie(headers: Headers): boolean {
  return headers.getSetCookie().some(cookie => cookie.startsWith('session_'))
}

/** Headers carrying several Set-Cookie values, for `redirect()` or `data()`. */
export function setCookieHeaders(cookies: string[], headers = new Headers()): Headers {
  for (const cookie of cookies) headers.append('Set-Cookie', cookie)
  return headers
}

/**
 * A path on this site to redirect to, or "/" if `value` is anything else.
 * Blocks open redirects such as "//evil.example" or "https://evil.example".
 */
export function safeReturnTo(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/'
  }
  return value
}
