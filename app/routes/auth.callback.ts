import { redirect } from 'react-router'
import { continueSignIn, signInErrorKey } from '~/server/auth.server'
import { exchangeCode } from '~/server/iam.server'
import { readSession } from '~/server/session.server'
import type { Route } from './+types/auth.callback'

/** IAM sends the browser here with an authorization code (or an error). */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  // Back from linking a platform (see routes/linked.tsx): IAM sends `requestId`, not a code.
  const linkRequestId = url.searchParams.get('requestId')
  if (linkRequestId && !url.searchParams.has('code'))
    throw redirect(`/account/linked-accounts?request_id=${encodeURIComponent(linkRequestId)}`)
  const pending = readSession(request).pendingSignIn
  const error = url.searchParams.get('error')
  if (error) throw redirect(`/login?error=${signInErrorKey(error, url.searchParams.get('error_description') ?? '')}`)

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  // The state must match the one this browser started with, or the code may
  // belong to someone else's sign-in (login CSRF).
  if (!pending || !code || !state || state !== pending.state) throw redirect('/login?error=state')

  return continueSignIn(pending, await exchangeCode(code, pending.codeVerifier))
}
