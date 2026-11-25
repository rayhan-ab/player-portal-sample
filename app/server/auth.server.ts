import { createContext, redirect, type RouterContextProvider } from 'react-router'
import { authenticate, createPkce, exchangeCode, refreshTokens, requestAuthorization, type TokenOutcome } from './iam.server'
import { commitSession, readSession, safeReturnTo, setCookieHeaders, type AuthTokens, type PendingSignIn } from './session.server'

/**
 * Who is signed in, for loaders and actions.
 *
 * Pages never force sign-in just to be viewed. Loaders call `getUser()`, which
 * may return null, and show a sign-in prompt in place where they need the
 * player's own data. Only actions (create, update, delete) call
 * `requireUser()`, which sends a signed-out visitor to sign in and back.
 */

export type SignedInUser = {
  userId: string
  displayName: string
  accessToken: string
}

type AuthState = {
  user: SignedInUser | null
  /** Set-Cookie values to send when the middleware refreshed the session. */
  setCookies: string[]
}

export const authContext = createContext<AuthState>({ user: null, setCookies: [] })

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 60_000
/** How long a refresh result is reused for requests still carrying the old cookie. */
const REFRESH_REUSE_MS = 30_000

/**
 * IAM revokes a refresh token once it is used, so two requests refreshing the
 * same session at once would sign the player out. Requests on this server that
 * carry the same refresh token share one refresh, and its result is reused for
 * a short while for requests that left the browser before the new cookie
 * arrived.
 */
const refreshes = new Map<string, Promise<AuthTokens | null>>()

function refreshOnce(refreshToken: string): Promise<AuthTokens | null> {
  let pending = refreshes.get(refreshToken)
  if (!pending) {
    pending = refreshTokens(refreshToken)
      .then(outcome => (outcome.kind === 'tokens' ? outcome.tokens : null))
      .catch(() => null)
    refreshes.set(refreshToken, pending)
    const forget = () => setTimeout(() => refreshes.delete(refreshToken), REFRESH_REUSE_MS).unref?.()
    pending.then(forget, forget)
  }
  return pending
}

/** Read the user from the access token. Display only: AGS checks the token itself. */
function userFromToken(accessToken: string): SignedInUser | null {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'))
    if (typeof payload.sub !== 'string') return null
    return { userId: payload.sub, displayName: String(payload.display_name ?? ''), accessToken }
  } catch {
    return null
  }
}

/** Run by the root middleware for every request. */
export async function loadAuth(request: Request): Promise<AuthState> {
  const session = readSession(request)
  let tokens = session?.tokens
  if (!tokens) return { user: null, setCookies: [] }

  const setCookies: string[] = []
  if (tokens.accessExpiresAt - REFRESH_MARGIN_MS <= Date.now()) {
    const refreshed = await refreshOnce(tokens.refreshToken)
    if (!refreshed) {
      // Refresh token expired or revoked: the player is signed out.
      return { user: null, setCookies: commitSession(request, {}) }
    }
    tokens = refreshed
    setCookies.push(...commitSession(request, { tokens }))
  }
  return { user: userFromToken(tokens.accessToken), setCookies }
}

export function getUser(context: Readonly<RouterContextProvider>): SignedInUser | null {
  return context.get(authContext).user
}

/** For actions: the signed-in user, or a redirect to sign in and come back. */
export function requireUser(context: Readonly<RouterContextProvider>, request: Request): SignedInUser {
  const user = getUser(context)
  if (user) return user
  const url = new URL(request.url)
  throw redirect(`/login?returnTo=${encodeURIComponent(url.pathname + url.search)}`)
}

/** The sign-in page for a return path, for links and buttons. */
export function signInHref(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(safeReturnTo(returnTo))}`
}

/**
 * Take the next step after IAM answered a token request during sign-in:
 * signed in, or show an error.
 * Returns a redirect carrying the updated session cookie.
 */
export function continueSignIn(request: Request, pending: PendingSignIn, outcome: TokenOutcome): Response {
  switch (outcome.kind) {
    case 'tokens':
      // Signed in. The pending sign-in is dropped with the rest of the old session.
      return redirect(safeReturnTo(pending.returnTo), { headers: setCookieHeaders(commitSession(request, { tokens: outcome.tokens })) })
    case 'error':
      return redirect(`/login?error=${encodeURIComponent(signInErrorKey(outcome.error, outcome.description))}`)
  }
}

/** Map an IAM error to one of the messages the sign-in page knows. */
export function signInErrorKey(error: string, description: string): string {
  const text = `${error} ${description}`.toLowerCase()
  if (text.includes('mfa_required')) return 'mfa'
  if (text.includes('login_queue')) return 'queue'
  if (text.includes('invalid username or password') || text.includes('invalid_grant')) return 'credentials'
  if (text.includes('too many failed')) return 'locked'
  if (text.includes('banned')) return 'banned'
  if (text.includes('disabled') || text.includes('deletion')) return 'disabled'
  if (text.includes('expired') || text.includes('request id not found')) return 'expired'
  if (text.includes('country')) return 'country'
  return 'unknown'
}

/**
 * Start a sign-in: a fresh `state` and PKCE pair, plus an IAM authorization
 * request for a sign-in form to post against.
 */
export async function beginSignIn(returnTo: string): Promise<PendingSignIn & { requestId: string }> {
  const { state, codeVerifier, codeChallenge } = createPkce()
  return {
    state,
    codeVerifier,
    returnTo: safeReturnTo(returnTo),
    createdAt: Date.now(),
    requestId: await requestAuthorization(state, codeChallenge)
  }
}

/**
 * Check an email (or username) and password against a pending sign-in and take
 * the next step. Returns a redirect, or an error key for the page to show.
 */
export async function signInWithPassword(
  request: Request,
  pending: PendingSignIn,
  loginId: string,
  password: string
): Promise<Response | { errorKey: string }> {
  if (!pending.requestId) return { errorKey: 'expired' }
  const result = await authenticate({ loginId, password, requestId: pending.requestId })
  if (result.kind === 'error') return { errorKey: signInErrorKey(result.error, result.description) }
  if (result.state !== pending.state) return { errorKey: 'state' }
  return continueSignIn(request, pending, await exchangeCode(result.code, pending.codeVerifier))
}
