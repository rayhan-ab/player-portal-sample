import { createHash, randomBytes } from 'node:crypto'
import { getEnv, getRedirectUri } from './env.server'
import type { AuthTokens } from './session.server'

/**
 * The OAuth part of IAM: authorize, authenticate, token, revoke.
 *
 * These are plain `fetch` calls rather than SDK calls on purpose. In OAuth the
 * status code and the redirect *are* the answer (302 with a code or an error),
 * and redirects must be read, not followed. Everything else in the app goes
 * through the SDK (ags.server.ts).
 */

/** What IAM answers when asked for a token. */
export type TokenOutcome = { kind: 'tokens'; tokens: AuthTokens } | { kind: 'error'; error: string; description: string }

/** What IAM answers when a player submits the sign-in form. */
export type AuthenticateOutcome = { kind: 'code'; code: string; state: string } | { kind: 'error'; error: string; description: string }

function iamUrl(path: string): URL {
  return new URL(path, getEnv().agsBaseUrl)
}

/** Public client: Basic auth with the client ID and an empty password. */
function clientBasicAuth(): string {
  return `Basic ${Buffer.from(`${getEnv().agsClientId}:`).toString('base64')}`
}

function postForm(path: string, form: Record<string, string>, init: RequestInit = {}): Promise<Response> {
  return fetch(iamUrl(path), {
    method: 'POST',
    redirect: 'manual',
    ...init,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: clientBasicAuth(),
      ...init.headers
    },
    body: new URLSearchParams(form)
  })
}

// ── PKCE ─────────────────────────────────────────────────────────────────

export function createPkce(): { state: string; codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString('base64url')
  return {
    state: randomBytes(16).toString('base64url'),
    codeVerifier,
    codeChallenge: createHash('sha256').update(codeVerifier).digest('base64url')
  }
}

/** The IAM authorize URL for this client, redirect URI and PKCE pair. */
export function authorizeUrl(state: string, codeChallenge: string): URL {
  const url = iamUrl('/iam/v3/oauth/authorize')
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: getEnv().agsClientId,
    redirect_uri: getRedirectUri(),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256'
  }).toString()
  return url
}

/**
 * Where to send the browser to sign in with a third-party platform. IAM sends
 * the player to the platform, then back to our redirect URI with a code. A
 * player with no account yet gets a new headless account.
 */
export function platformAuthorizeUrl(platformId: string, requestId: string): URL {
  const url = iamUrl(`/iam/v3/oauth/platforms/${encodeURIComponent(platformId)}/authorize`)
  url.search = new URLSearchParams({ request_id: requestId, client_id: getEnv().agsClientId, redirect_uri: getRedirectUri() }).toString()
  return url
}

/**
 * Start an authorization request from the server and return its `request_id`.
 * IAM answers with a redirect to the login website; we read the `request_id`
 * from it and show our own form instead of following it.
 */
export async function requestAuthorization(state: string, codeChallenge: string): Promise<string> {
  const response = await fetch(authorizeUrl(state, codeChallenge), { redirect: 'manual' })
  const location = new URL(response.headers.get('Location') ?? '', getEnv().agsBaseUrl)
  const requestId = location.searchParams.get('request_id')
  if (response.status !== 302 || !requestId) {
    throw new Error(`IAM authorize failed: HTTP ${response.status} ${location.searchParams.get('error') ?? ''}`.trim())
  }
  return requestId
}

// ── Sign in ──────────────────────────────────────────────────────────────

/** Check the player's credentials against an authorization request. */
export async function authenticate(input: { loginId: string; password: string; requestId: string }): Promise<AuthenticateOutcome> {
  const response = await postForm('/iam/v3/authenticate', {
    user_name: input.loginId,
    password: input.password,
    request_id: input.requestId,
    client_id: getEnv().agsClientId
  })
  // IAM always answers with a redirect: to our callback with a code, or to the
  // login website with an error.
  const location = new URL(response.headers.get('Location') ?? '', getEnv().agsBaseUrl)
  const code = location.searchParams.get('code')
  const state = location.searchParams.get('state')
  if (code && state) return { kind: 'code', code, state }
  return {
    kind: 'error',
    error: location.searchParams.get('error') ?? `http_${response.status}`,
    description: location.searchParams.get('error_description') ?? ''
  }
}

/** Exchange an authorization code for tokens */
export function exchangeCode(code: string, codeVerifier: string): Promise<TokenOutcome> {
  return tokenRequest('/iam/v4/oauth/token', {
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: getRedirectUri(),
    client_id: getEnv().agsClientId
  })
}

// ── Session upkeep ───────────────────────────────────────────────────────

/** Get new tokens with a refresh token. IAM revokes the old refresh token. */
export function refreshTokens(refreshToken: string): Promise<TokenOutcome> {
  return tokenRequest('/iam/v3/oauth/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: getEnv().agsClientId
  })
}

/** Revoke a token at IAM. Best effort: sign-out continues if this fails. */
export async function revokeToken(token: string): Promise<void> {
  try {
    await postForm('/iam/v3/oauth/revoke', { token })
  } catch {
    // Network error: the local session is cleared anyway.
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function tokenRequest(path: string, form: Record<string, string>): Promise<TokenOutcome> {
  const response = await postForm(path, form)
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>

  if (response.status === 200 && typeof body.access_token === 'string' && typeof body.refresh_token === 'string') {
    const now = Date.now()
    return {
      kind: 'tokens',
      tokens: {
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        accessExpiresAt: now + Number(body.expires_in ?? 0) * 1000,
        refreshExpiresAt: now + Number(body.refresh_expires_in ?? 0) * 1000
      }
    }
  }
  // This sample doesn't handle the login queue or 2FA (see README). Both come
  // back as errors the sign-in page explains.
  if (response.status === 202 || body.error === 'login_queue_enabled') {
    return { kind: 'error', error: 'login_queue', description: '' }
  }
  return {
    kind: 'error',
    error: String(body.error ?? body.errorCode ?? `http_${response.status}`),
    description: String(body.error_description ?? body.errorMessage ?? '')
  }
}
