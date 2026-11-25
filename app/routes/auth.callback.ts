import { redirect } from 'react-router'
import { continueSignIn, signInErrorKey } from '~/server/auth.server'
import { exchangeCode } from '~/server/iam.server'
import { readSession } from '~/server/session.server'
import type { Route } from './+types/auth.callback'

/** IAM sends the browser here with an authorization code (or an error). */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
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
