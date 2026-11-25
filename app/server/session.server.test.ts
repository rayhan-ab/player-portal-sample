import { describe, expect, it } from 'vitest'

process.env.APP_URL = 'https://portal.example.com'
process.env.AGS_BASE_URL = 'https://example.gamingservices.accelbyte.io'
process.env.AGS_NAMESPACE = 'test'
process.env.AGS_CLIENT_ID = 'client'

const { readSession, saveTokens, savePendingSignIn, clearSession, safeReturnTo } = await import('./session.server')

const url = 'https://portal.example.com/'

/** A request carrying the cookies from Set-Cookie values. */
function requestWith(setCookies: string[]): Request {
  const pairs = setCookies.map(c => c.split(';')[0]!).filter(p => !p.endsWith('='))
  return new Request(url, { headers: { Cookie: pairs.join('; ') } })
}

const tokens = { accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600, refreshExpiresIn: 86_400 }

describe('sessions', () => {
  it('sets HttpOnly, Secure, SameSite=Lax cookies', () => {
    for (const cookie of saveTokens(tokens)) {
      expect(cookie).toMatch(/^session_/)
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
      expect(cookie).toContain('SameSite=Lax')
      expect(cookie).toContain('Path=/')
    }
  })

  it('expires the access cookie a minute before the token', () => {
    expect(saveTokens(tokens)[0]).toContain('Max-Age=3540')
  })

  it('round-trips tokens and a pending sign-in', () => {
    const session = readSession(requestWith(saveTokens(tokens)))
    expect(session.accessToken).toBe('access')
    expect(session.refreshToken).toBe('refresh')
    const pending = { state: 's', codeVerifier: 'v', returnTo: '/account', createdAt: Date.now() }
    expect(readSession(requestWith(savePendingSignIn(pending))).pendingSignIn).toEqual(pending)
  })

  it('ignores a malformed or expired pending sign-in', () => {
    const cookie = (value: string) => new Request(url, { headers: { Cookie: `session_signin=${value}` } })
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    expect(readSession(cookie('garbage')).pendingSignIn).toBeUndefined()
    expect(readSession(cookie(encode({ state: 1 }))).pendingSignIn).toBeUndefined()
    const old = { state: 's', codeVerifier: 'v', returnTo: '/', createdAt: Date.now() - 60 * 60 * 1000 }
    expect(readSession(cookie(encode(old))).pendingSignIn).toBeUndefined()
  })

  it('clears every cookie on sign-out', () => {
    expect(clearSession().every(c => c.includes('Max-Age=0'))).toBe(true)
  })
})

describe('safeReturnTo', () => {
  it('keeps same-site paths', () => {
    expect(safeReturnTo('/account?tab=1')).toBe('/account?tab=1')
  })

  it('blocks anything that could leave the site', () => {
    for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', 'account', '', null]) {
      expect(safeReturnTo(value)).toBe('/')
    }
  })
})
