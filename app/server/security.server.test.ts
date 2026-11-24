import { describe, expect, it } from 'vitest'
import { contentSecurityPolicy, isCrossSiteMutation } from './security.server'

const origin = 'https://portal.example.com'
const post = (headers: Record<string, string>) => new Request(`${origin}/login`, { method: 'POST', headers })

describe('isCrossSiteMutation', () => {
  it('allows safe methods from anywhere', () => {
    const request = new Request(`${origin}/`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })
    expect(isCrossSiteMutation(request, origin)).toBe(false)
  })

  it('allows same-origin posts', () => {
    expect(isCrossSiteMutation(post({ 'Sec-Fetch-Site': 'same-origin' }), origin)).toBe(false)
    expect(isCrossSiteMutation(post({ Origin: origin }), origin)).toBe(false)
  })

  it('rejects cross-site and same-site posts', () => {
    expect(isCrossSiteMutation(post({ 'Sec-Fetch-Site': 'cross-site' }), origin)).toBe(true)
    // A sibling subdomain is same-site but not same-origin.
    expect(isCrossSiteMutation(post({ 'Sec-Fetch-Site': 'same-site' }), origin)).toBe(true)
    expect(isCrossSiteMutation(post({ Origin: 'https://evil.example' }), origin)).toBe(true)
  })

  it('rejects posts with neither header', () => {
    expect(isCrossSiteMutation(post({}), origin)).toBe(true)
  })
})

describe('contentSecurityPolicy', () => {
  it('allows scripts only from self or with the nonce, and forbids framing', () => {
    const csp = contentSecurityPolicy('abc')
    expect(csp).toContain("script-src 'self' 'nonce-abc'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('unsafe-inline')
  })
})
