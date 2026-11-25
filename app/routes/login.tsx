import { data, Form, Link, redirect, useNavigation } from 'react-router'
import { AuthLayout } from '~/components/AuthLayout'
import { SocialSignIn } from '~/components/SocialSignIn'
import { Button } from '~/components/ui/Button'
import { Callout } from '~/components/ui/Callout'
import { Field } from '~/components/ui/Field'
import { PasswordField } from '~/components/ui/PasswordField'
import { beginSignIn, getUser, signInWithPassword } from '~/server/auth.server'
import { getRegistrationConfig, getSocialPlatforms } from '~/server/iam-config.server'
import { commitSession, readSession, safeReturnTo, setCookieHeaders, type PendingSignIn } from '~/server/session.server'
import type { Route } from './+types/login'

export const meta: Route.MetaFunction = () => [{ title: 'Sign in · Player Portal' }]

const ERRORS: Record<string, string> = {
  credentials: 'Incorrect email or password.',
  locked: 'Too many failed attempts. Wait a few minutes, then try again.',
  banned: 'This account is banned from signing in.',
  disabled: 'This account is disabled or scheduled for deletion.',
  expired: 'Your sign-in took too long. Please try again.',
  country: 'Signing in is not available in your country.',
  mfa: 'This account uses two-factor authentication, which this sample does not support.',
  queue: 'Too many players are signing in right now. Try again in a few minutes.',
  state: 'Sign-in could not be verified. Please try again.',
  unknown: 'Something went wrong signing you in. Please try again.'
}

/** Reuse an authorization request for this long before starting a new one. */
const REQUEST_REUSE_MS = 5 * 60 * 1000

/**
 * Renders without calling IAM, so the page opens fast. The IAM authorization
 * request the form posts against is made when the player submits (see action).
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
  if (getUser(context)) throw redirect(returnTo)

  let pending = readSession(request)?.pendingSignIn
  const requestIdFromIam = url.searchParams.get('request_id')
  let headers: Headers | undefined
  if (requestIdFromIam && pending && !pending.requestId) {
    // Redirect flow: /auth/start sent the player to IAM, and IAM sent them here
    // with the request ID. Our state and PKCE verifier are already in the session.
    pending = { ...pending, requestId: requestIdFromIam }
    headers = setCookieHeaders(commitSession(request, { pendingSignIn: pending }))
  }

  const [{ usernameDisabled }, socialPlatforms] = await Promise.all([getRegistrationConfig(), getSocialPlatforms()])
  const errorKey = url.searchParams.get('error')
  return data(
    {
      usernameDisabled,
      socialPlatforms,
      returnTo: url.searchParams.has('returnTo') ? returnTo : (pending?.returnTo ?? '/'),
      error: errorKey ? (ERRORS[errorKey] ?? ERRORS.unknown) : null
    },
    { headers }
  )
}

/** A pending sign-in the form can still post against, if there is one. */
function usablePending(pending: PendingSignIn | undefined): (PendingSignIn & { requestId: string }) | null {
  if (!pending?.requestId) return null
  if (pending.createdAt + REQUEST_REUSE_MS < Date.now()) return null
  return { ...pending, requestId: pending.requestId }
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const loginId = String(form.get('loginId') ?? '').trim()
  const password = String(form.get('password') ?? '')
  if (!loginId || !password) {
    return data({ error: 'Enter your email and password.', loginId }, { status: 400 })
  }

  // Reuse the request IAM sent the player here with (redirect flow) or one
  // from an earlier attempt; otherwise start one now.
  const pending =
    usablePending(readSession(request)?.pendingSignIn) ?? (await beginSignIn(safeReturnTo(String(form.get('returnTo') ?? '/'))))

  const result = await signInWithPassword(request, pending, loginId, password)
  if (result instanceof Response) return result
  // Keep the request for a retry, unless IAM no longer knows it.
  const keep = result.errorKey !== 'expired'
  return data(
    { error: ERRORS[result.errorKey] ?? ERRORS.unknown, loginId },
    {
      status: result.errorKey === 'credentials' ? 401 : 400,
      headers: setCookieHeaders(commitSession(request, keep ? { pendingSignIn: pending } : {}))
    }
  )
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST'
  const error = actionData?.error ?? loaderData.error
  const loginLabel = loaderData.usernameDisabled ? 'Email' : 'Email or username'

  return (
    <AuthLayout title="Sign in" intro="Use your game account.">
      {error ? <Callout tone="error">{error}</Callout> : null}
      <SocialSignIn platforms={loaderData.socialPlatforms} returnTo={loaderData.returnTo} />
      <Form method="post" className="grid gap-5" noValidate>
        <input type="hidden" name="returnTo" value={loaderData.returnTo} />
        <Field
          label={loginLabel}
          name="loginId"
          type={loaderData.usernameDisabled ? 'email' : 'text'}
          autoComplete="username"
          defaultValue={actionData?.loginId}
          required
          autoFocus
        />
        <PasswordField label="Password" name="password" autoComplete="current-password" required />
        <Button type="submit" loading={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Form>
      <p className="m-0 text-(length:--ab-font-size-14) text-secondary">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  )
}
