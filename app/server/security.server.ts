/**
 * A few security headers for every response, added by the root middleware
 * (app/root.tsx). React Router already rejects form posts whose Origin doesn't
 * match this app, and the session cookies are SameSite=Lax, so no extra CSRF
 * check is needed.
 */
export function applySecurityHeaders(headers: Headers, isHttps: boolean): void {
  if (isHttps) headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
}
