import { redirect } from 'react-router'
import { authorizeUrl, createPkce } from '~/server/iam.server'
import { safeReturnTo, savePendingSignIn, setCookieHeaders } from '~/server/session.server'
import type { Route } from './+types/auth.start'

/**
 * Redirect flow: send the browser to IAM's authorize endpoint. IAM then sends
 * the player to the studio's login website (this app's /login, once the
 * studio's custom login website URL points here), and back to /auth/callback
 * with a code.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get('returnTo'))
  const { state, codeVerifier, codeChallenge } = createPkce()
  const cookies = savePendingSignIn({ state, codeVerifier, returnTo, createdAt: Date.now() })
  return redirect(authorizeUrl(state, codeChallenge).toString(), { headers: setCookieHeaders(cookies) })
}
