import { data, Form, Link, redirect, useNavigation } from 'react-router'
import { AuthLayout } from '~/components/AuthLayout'
import { Button } from '~/components/ui/Button'
import { Callout } from '~/components/ui/Callout'
import { Field } from '~/components/ui/Field'
import { beginSignIn, getUser, signInWithPassword } from '~/server/auth.server'
import { getRegistrationConfig } from '~/server/iam-config.server'
import { commitSession, readSession, safeReturnTo, setCookieHeaders } from '~/server/session.server'
import type { Route } from './+types/login'

export const meta: Route.MetaFunction = () => [{ title: 'Sign in · Player Portal' }]

const ERRORS: Record<string, string> = {
  credentials: 'Incorrect email or password.',
  locked: 'Too many failed attempts. Wait a few minutes, then try again.',
  banned: 'This account is banned from signing in.',
  disabled: 'This account is disabled or scheduled for deletion.',
  expired: 'Your sign-in took too long. Please try again.',
  country: 'Signing in is not available in your country.',
  state: 'Sign-in could not be verified. Please try again.',
  unknown: 'Something went wrong signing you in. Please try again.'
}

/** Reuse an authorization request for this long before starting a new one. */
const REQUEST_REUSE_MS = 5 * 60 * 1000

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
  if (getUser(context)) throw redirect(returnTo)

  const session = readSession(request)
  let pending = session?.pendingSignIn
  const requestIdFromIam = url.searchParams.get('request_id')

  if (requestIdFromIam && pending && !pending.requestId) {
    // Redirect flow: /auth/start sent the player to IAM, and IAM sent them here
    // with the request ID. Our state and PKCE verifier are already in the session.
    pending = { ...pending, requestId: requestIdFromIam }
  } else if (!pending?.requestId || pending.createdAt + REQUEST_REUSE_MS < Date.now() || pending.mfa || pending.queue) {
    pending = await beginSignIn(url.searchParams.has('returnTo') ? returnTo : (pending?.returnTo ?? '/'))
  }

  const { usernameDisabled } = await getRegistrationConfig()
  const errorKey = url.searchParams.get('error')
  return data(
    { usernameDisabled, error: errorKey ? (ERRORS[errorKey] ?? ERRORS.unknown) : null },
    { headers: setCookieHeaders(commitSession(request, { pendingSignIn: pending })) }
  )
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const loginId = String(form.get('loginId') ?? '').trim()
  const password = String(form.get('password') ?? '')
  if (!loginId || !password) {
    return data({ error: 'Enter your email and password.', loginId }, { status: 400 })
  }

  const pending = readSession(request)?.pendingSignIn
  if (!pending) return data({ error: ERRORS.expired, loginId }, { status: 400 })

  const result = await signInWithPassword(request, pending, loginId, password)
  if (result instanceof Response) return result
  return data({ error: ERRORS[result.errorKey] ?? ERRORS.unknown, loginId }, { status: result.errorKey === 'credentials' ? 401 : 400 })
}

export default function Login({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST'
  const error = actionData?.error ?? loaderData.error
  const loginLabel = loaderData.usernameDisabled ? 'Email' : 'Email or username'

  return (
    <AuthLayout title="Sign in" intro="Use your game account.">
      {error ? <Callout tone="error">{error}</Callout> : null}
      <Form method="post" className="grid gap-5" noValidate>
        <Field
          label={loginLabel}
          name="loginId"
          type={loaderData.usernameDisabled ? 'email' : 'text'}
          autoComplete="username"
          defaultValue={actionData?.loginId}
          required
          autoFocus
        />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <Button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </Form>
      <p className="m-0 text-[length:var(--ab-font-size-14)] text-secondary">
        New here? <Link to="/register">Create an account</Link>
      </p>
    </AuthLayout>
  )
}
