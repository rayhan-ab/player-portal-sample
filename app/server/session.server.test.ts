import { describe, expect, it } from 'vitest'

process.env.APP_URL = 'https://portal.example.com'
process.env.AGS_BASE_URL = 'https://example.gamingservices.accelbyte.io'
process.env.AGS_NAMESPACE = 'test'
process.env.AGS_CLIENT_ID = 'client'

const { readSession, commitSession, destroySession, safeReturnTo } = await import('./session.server')

const url = 'https://portal.example.com/'
const blank = () => new Request(url)

/** A request carrying the cookies from Set-Cookie values. */
function requestWith(setCookies: string[]): Request {
  const pairs = setCookies.map(c => c.split(';')[0]!).filter(p => !p.endsWith('='))
  return new Request(url, { headers: { Cookie: pairs.join('; ') } })
}

const tokens = (size = 100) => ({
  accessToken: 'a'.repeat(size),
  refreshToken: 'r'.repeat(size),
  accessExpiresAt: Date.now() + 3600_000,
  refreshExpiresAt: Date.now() + 86_400_000
})

describe('sessions', () => {
  it('sets a __Host- cookie that is HttpOnly, Secure and SameSite=Lax', () => {
    const [cookie] = commitSession(blank(), { tokens: tokens() })
    expect(cookie).toMatch(/^__Host-session=[A-Za-z0-9_-]+; /)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).not.toContain('Domain')
  })

  it('round-trips the session', () => {
    const cookies = commitSession(blank(), { tokens: tokens() })
    expect(readSession(requestWith(cookies))?.tokens?.accessToken).toBe('a'.repeat(100))
  })

  it('splits a large session across cookies and reads it back', () => {
    const cookies = commitSession(blank(), { tokens: tokens(4000) })
    expect(cookies.length).toBeGreaterThan(1)
    expect(cookies.every(c => c.split(';')[0]!.length < 4000)).toBe(true)
    expect(readSession(requestWith(cookies))?.tokens?.accessToken).toHaveLength(4000)
  })

  it('clears leftover chunks when the session shrinks', () => {
    const big = commitSession(blank(), { tokens: tokens(4000) })
    const small = commitSession(requestWith(big), { tokens: tokens() })
    expect(small.filter(c => c.includes('Max-Age=0')).length).toBe(big.length - 1)
  })

  it('ignores garbage and malformed sessions', () => {
    const cookie = (value: string) => new Request(url, { headers: { Cookie: `__Host-session=${value}` } })
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
    expect(readSession(cookie('garbage'))).toBeNull()
    expect(readSession(cookie(encode({ tokens: { accessToken: 1 } })))).toBeNull()
    expect(readSession(cookie(encode({ admin: true })))).toBeNull()
  })

  it('drops expired sessions', () => {
    const expired = { ...tokens(), refreshExpiresAt: Date.now() - 1 }
    expect(readSession(requestWith(commitSession(blank(), { tokens: expired })))).toBeNull()
  })

  it('clears the cookie on destroy', () => {
    const cookies = commitSession(blank(), { tokens: tokens() })
    expect(destroySession(requestWith(cookies))[0]).toContain('Max-Age=0')
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
