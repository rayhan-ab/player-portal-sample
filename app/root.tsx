import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import type { Route } from './+types/root'
import { nonceRouterContext, useNonce } from './nonce'
import { authContext, loadAuth } from './server/auth.server'
import { getEnv } from './server/env.server'
import { applySecurityHeaders, createNonce, isCrossSiteMutation } from './server/security.server'
import { setsSessionCookie } from './server/session.server'
import './styles/app.css'

/**
 * Runs for every document and data request: rejects cross-site form posts,
 * loads the signed-in player (refreshing their tokens when due), then adds the
 * security headers to whatever the route returns.
 */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request, context }, next) => {
    const env = getEnv()
    if (isCrossSiteMutation(request, env.appUrl.origin)) {
      return new Response('Cross-site request rejected.', { status: 403 })
    }

    const nonce = createNonce()
    context.set(nonceRouterContext, nonce)

    const auth = await loadAuth(request)
    context.set(authContext, auth)

    const response = (await next()) as Response
    // A route that set the session itself (sign-in, sign-out) wins over a refresh.
    if (auth.setCookies.length > 0 && !setsSessionCookie(response.headers)) {
      for (const cookie of auth.setCookies) response.headers.append('Set-Cookie', cookie)
    }
    applySecurityHeaders(response.headers, {
      nonce,
      isHttps: env.isHttps,
      isDev: import.meta.env.DEV
    })
    return response
  }
]

export const links: Route.LinksFunction = () => [
  { rel: 'icon', href: '/favicon.png', type: 'image/png' },
  {
    rel: 'preload',
    href: '/fonts/inter-variable.woff2',
    as: 'font',
    type: 'font/woff2',
    crossOrigin: 'anonymous'
  }
]

export function Layout({ children }: { children: React.ReactNode }) {
  const nonce = useNonce()
  return (
    <html lang="en" data-ab-theme="dark">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links nonce={nonce} />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = 'Something went wrong'
  let detail = 'Please try again in a moment.'
  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? 'Page not found' : `Error ${error.status}`
    detail = error.status === 404 ? 'This page does not exist.' : error.statusText || detail
  }
  // Never show stack traces or AGS error bodies to players; they can contain
  // internal details. Server logs have the full error.
  return (
    <main className="mx-auto max-w-[var(--ab-width-form)] px-[var(--ab-gutter)] py-16">
      <h1 className="text-[length:var(--ab-font-size-32)]">{title}</h1>
      <p className="text-secondary">{detail}</p>
      <a href="/">Go to the home page</a>
    </main>
  )
}
