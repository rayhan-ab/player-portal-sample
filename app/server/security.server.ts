import { randomBytes } from 'node:crypto'

/**
 * Security headers and the cross-site request check. Both run for every
 * request from the root route middleware (app/root.tsx).
 */

export function createNonce(): string {
  return randomBytes(16).toString('base64')
}

/**
 * Content Security Policy. Scripts only run from this origin or with the
 * per-response nonce; nothing may frame the app; forms only post to this
 * origin. The browser never needs to reach AGS, so connect-src stays 'self'.
 */
export function contentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'"
  ].join('; ')
}

export function applySecurityHeaders(headers: Headers, options: { nonce: string; isHttps: boolean; isDev: boolean }): void {
  // Vite's dev server injects inline scripts and styles for hot reload, so
  // the policy only applies to production builds.
  if (!options.isDev) {
    headers.set('Content-Security-Policy', contentSecurityPolicy(options.nonce))
  }
  if (options.isHttps) {
    headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defence on top of SameSite=Lax cookies: a state-changing request must
 * come from a page on this app's own origin.
 */
export function isCrossSiteMutation(request: Request, appOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return false

  const fetchSite = request.headers.get('Sec-Fetch-Site')
  if (fetchSite) return fetchSite !== 'same-origin'

  // Older browsers: fall back to the Origin header. Reject when neither is
  // present, since every browser that can run this app sends one of them.
  const origin = request.headers.get('Origin')
  return origin !== appOrigin
}
