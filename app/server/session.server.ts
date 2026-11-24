import { getEnv } from './env.server'
import type { MfaChallenge, QueueTicket } from './iam.server'

/**
 * Sessions, kept in an HttpOnly cookie. No database, no Redis, no secret.
 *
 * The cookie holds the player's AGS tokens (or a sign-in in progress). It is
 * HttpOnly, so page scripts can never read it, and it only goes to this
 * server. The player can see and edit their own cookie, so the server never
 * trusts it for anything AGS doesn't check: AGS validates the token on every
 * call, and `returnTo` is validated before any redirect (see safeReturnTo).
 *
 * AGS tokens can be large, so a session that does not fit in one cookie is
 * split across a few (`session`, `session.1`, ...).
 */

export type AuthTokens = {
  accessToken: string
  refreshToken: string
  /** Epoch milliseconds. */
  accessExpiresAt: number
  /** Epoch milliseconds. */
  refreshExpiresAt: number
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
  /** Set when IAM asked for a 2FA code. */
  mfa?: MfaChallenge
  /** Set when the player is waiting in the login queue. */
  queue?: QueueTicket
}

export type SessionData = {
  tokens?: AuthTokens
  pendingSignIn?: PendingSignIn
}

/** How long a session with no tokens (a sign-in in progress) lives. */
const PENDING_TTL_MS = 15 * 60 * 1000
/** Browsers accept about 4096 bytes per cookie, name and attributes included. */
const CHUNK_SIZE = 3800
const MAX_CHUNKS = 5

function cookieName(): string {
  // `__Host-` cookies must be Secure, have Path=/ and no Domain, so no other
  // subdomain can set or overwrite them. Plain HTTP (local dev) can't use it.
  return getEnv().isHttps ? '__Host-session' : 'session'
}

function chunkName(index: number): string {
  return index === 0 ? cookieName() : `${cookieName()}.${index}`
}

function readCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>()
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0) cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim())
  }
  return cookies
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const attributes = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`]
  if (getEnv().isHttps) attributes.push('Secure')
  return attributes.join('; ')
}

function chunkCount(cookies: Map<string, string>): number {
  let count = 0
  while (count < MAX_CHUNKS && cookies.has(chunkName(count))) count++
  return count
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

/** Keep only well-formed fields; the cookie is input from the browser. */
function parse(value: unknown): SessionData | null {
  if (!value || typeof value !== 'object') return null
  const { tokens, pendingSignIn } = value as Record<string, Record<string, unknown> | undefined>
  const data: SessionData = {}
  if (
    tokens &&
    isString(tokens.accessToken) &&
    isString(tokens.refreshToken) &&
    typeof tokens.accessExpiresAt === 'number' &&
    typeof tokens.refreshExpiresAt === 'number' &&
    tokens.refreshExpiresAt > Date.now()
  ) {
    data.tokens = tokens as AuthTokens
  }
  if (
    pendingSignIn &&
    isString(pendingSignIn.state) &&
    isString(pendingSignIn.codeVerifier) &&
    isString(pendingSignIn.returnTo) &&
    typeof pendingSignIn.createdAt === 'number' &&
    pendingSignIn.createdAt + PENDING_TTL_MS > Date.now()
  ) {
    const { state, codeVerifier, returnTo, createdAt, requestId, mfa, queue } = pendingSignIn as PendingSignIn
    data.pendingSignIn = { state, codeVerifier, returnTo, createdAt }
    if (isString(requestId)) data.pendingSignIn.requestId = requestId
    if (mfa && isString(mfa.mfaToken) && Array.isArray(mfa.factors) && typeof mfa.defaultFactor === 'string') {
      data.pendingSignIn.mfa = { mfaToken: mfa.mfaToken, factors: mfa.factors.map(String), defaultFactor: mfa.defaultFactor }
    }
    if (queue && isString(queue.ticket)) {
      data.pendingSignIn.queue = {
        ticket: queue.ticket,
        position: Number(queue.position) || 0,
        estimatedWaitingTimeInSeconds: Number(queue.estimatedWaitingTimeInSeconds) || 0,
        playerPollingTimeInSeconds: Math.max(2, Number(queue.playerPollingTimeInSeconds) || 5)
      }
    }
  }
  return data.tokens || data.pendingSignIn ? data : null
}

/** Read the current session, or null if there is none or it has expired. */
export function readSession(request: Request): SessionData | null {
  const cookies = readCookies(request)
  const count = chunkCount(cookies)
  if (count === 0) return null
  let encoded = ''
  for (let i = 0; i < count; i++) encoded += cookies.get(chunkName(i))
  try {
    return parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')))
  } catch {
    return null
  }
}

/**
 * Write the session into cookies. Returns Set-Cookie values; append each one
 * to the response headers (see `setCookieHeaders`).
 */
export function commitSession(request: Request, data: SessionData): string[] {
  const expiresAt = data.tokens ? data.tokens.refreshExpiresAt : Date.now() + PENDING_TTL_MS
  const encoded = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url')
  const chunks = encoded.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'g')) ?? []
  if (chunks.length > MAX_CHUNKS) {
    throw new Error(`Session too large for cookies (${encoded.length} bytes).`)
  }

  const maxAge = (expiresAt - Date.now()) / 1000
  const headers = chunks.map((chunk, i) => serializeCookie(chunkName(i), chunk, maxAge))
  // Clear chunks left over from a larger, earlier session.
  const previous = chunkCount(readCookies(request))
  for (let i = chunks.length; i < previous; i++) headers.push(serializeCookie(chunkName(i), '', 0))
  return headers
}

/** Set-Cookie values that clear the session. */
export function destroySession(request: Request): string[] {
  const count = Math.max(1, chunkCount(readCookies(request)))
  return Array.from({ length: count }, (_, i) => serializeCookie(chunkName(i), '', 0))
}

/** True if a response already sets the session cookie (so a refresh must not overwrite it). */
export function setsSessionCookie(headers: Headers): boolean {
  const name = cookieName()
  return headers.getSetCookie().some(cookie => cookie.startsWith(`${name}=`) || cookie.startsWith(`${name}.`))
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
