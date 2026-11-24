import { redirect } from 'react-router'
import { beginSignIn, getUser } from '~/server/auth.server'
import { isSocialPlatform } from '~/server/iam-config.server'
import { platformAuthorizeUrl } from '~/server/iam.server'
import { commitSession, readSession, safeReturnTo, setCookieHeaders } from '~/server/session.server'
import type { Route } from './+types/auth.platform'

/**
 * Social sign-in: send the browser to IAM, which sends it to the platform's
 * login page and back to /auth/callback with a code.
 *
 * Always starts a fresh authorization request. IAM accepts a request ID only
 * once, so reusing the sign-in form's one would break the password form if the
 * player came back without finishing.
 */
export async function loader({ request, params, context }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const pendingReturnTo = readSession(request)?.pendingSignIn?.returnTo
  const returnTo = safeReturnTo(url.searchParams.get('returnTo') ?? pendingReturnTo)
  if (getUser(context)) throw redirect(returnTo)
  if (!(await isSocialPlatform(params.platformId))) throw redirect('/login?error=unknown')

  const pending = await beginSignIn(returnTo)
  return redirect(platformAuthorizeUrl(params.platformId, pending.requestId).toString(), {
    headers: setCookieHeaders(commitSession(request, { pendingSignIn: pending }))
  })
}
