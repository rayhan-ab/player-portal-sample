import { UsersApi } from '@accelbyte/sdk-iam'
import { useState, type SubmitEvent } from 'react'
import { data, Form, Link, redirect, useNavigation } from 'react-router'
import { AuthLayout } from '~/components/AuthLayout'
import { Button } from '~/components/ui/Button'
import { Callout } from '~/components/ui/Callout'
import { Field } from '~/components/ui/Field'
import { PasswordField } from '~/components/ui/PasswordField'
import { validateField, type ValidationRules } from '~/lib/validation'
import { agsError, createAgsSdk } from '~/server/ags.server'
import { beginSignIn, getUser, signInWithPassword } from '~/server/auth.server'
import { getValidationRules } from '~/server/iam-config.server'
import type { Route } from './+types/forgot-password'

/**
 * Forgot and reset password, in two steps on one page:
 *   1. The player enters their email. IAM emails them a reset code.
 *   2. The player enters the code and a new password, and is signed in.
 *
 * The same module also serves /login/reset-password, the page the link in
 * IAM's reset email opens (IAM builds it as "<login website URL>reset-password
 * ?code=…&email=…"). That link only reaches this app when the studio's login
 * website URL is set to "https://<host>/login/"; otherwise it opens the
 * AccelByte login site, and the player types the code here instead.
 */

export const meta: Route.MetaFunction = () => [{ title: 'Reset your password · Player Portal' }]

type Step = 'email' | 'reset'
type FieldErrors = Partial<Record<'email' | 'code' | 'password', string>>

export async function loader({ request, context }: Route.LoaderArgs) {
  if (getUser(context)) throw redirect('/account')
  const url = new URL(request.url)
  const email = url.searchParams.get('email') ?? url.searchParams.get('login_id') ?? ''
  const code = url.searchParams.get('code') ?? ''
  return { rules: await getValidationRules(), email, code, step: (email && code ? 'reset' : 'email') as Step }
}

function checkReset(values: { code: string; password: string }, rules: ValidationRules): FieldErrors {
  const errors: FieldErrors = {}
  if (!values.code) errors.code = 'Enter the code from the email.'
  const password = validateField('password', values.password, rules)
  if (password) errors.password = password
  return errors
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim()
  const intent = form.get('intent') === 'reset' ? 'reset' : 'send'
  const sdk = createAgsSdk()
  const rules = await getValidationRules()

  if (intent === 'send') {
    const emailError = validateField('email', email, rules)
    if (emailError)
      return data({ step: 'email' as Step, email, fieldErrors: { email: emailError } as FieldErrors, error: null }, { status: 400 })
    try {
      await UsersApi(sdk).createUserForgot_ByNS_v3({ emailAddress: email, languageTag: 'en-US' })
    } catch (error) {
      const { status, message } = agsError(error)
      // An unknown email (404) goes on to the next step like a known one, so
      // the page doesn't tell anyone which emails have an account.
      if (status !== 404) return data({ step: 'email' as Step, email, fieldErrors: {}, error: message }, { status })
    }
    return data({ step: 'reset' as Step, email, fieldErrors: {}, error: null })
  }

  // intent === 'reset'
  const values = { code: String(form.get('code') ?? '').replace(/\s+/g, ''), password: String(form.get('password') ?? '') }
  const fieldErrors = checkReset(values, rules)
  if (!email) return data({ step: 'email' as Step, email, fieldErrors: {}, error: 'Enter your email first.' }, { status: 400 })
  if (Object.keys(fieldErrors).length > 0) return data({ step: 'reset' as Step, email, fieldErrors, error: null }, { status: 400 })

  try {
    await UsersApi(sdk).createUserReset_v3({ emailAddress: email, code: values.code, newPassword: values.password })
  } catch (error) {
    const { status, message } = agsError(error)
    return data({ step: 'reset' as Step, email, fieldErrors: {}, error: message }, { status })
  }

  // Sign the player in with the new password. If that can't finish here (2FA,
  // for example), the sign-in page explains and they sign in again.
  const signIn = await signInWithPassword(await beginSignIn('/account'), email, values.password)
  if (signIn instanceof Response) return signIn
  throw redirect('/login?notice=password-reset&returnTo=/account')
}

export default function ForgotPassword({ loaderData, actionData }: Route.ComponentProps) {
  const { rules } = loaderData
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST'
  const step = actionData?.step ?? loaderData.step
  const email = actionData?.email ?? loaderData.email
  const [clientErrors, setClientErrors] = useState<FieldErrors>({})
  const errors: FieldErrors = { ...actionData?.fieldErrors, ...clientErrors }
  // The code came in the email link, so there is nothing to type.
  const codeFromLink = step === 'reset' && !actionData && loaderData.code

  let intro: string | undefined = 'Enter the email on your account and we will send you a reset code.'
  if (step === 'reset')
    intro = codeFromLink ? undefined : `If an account uses ${email}, we sent it a reset code. Enter it with your new password.`

  let submitLabel = busy ? 'Sending…' : 'Send reset code'
  if (step === 'reset') submitLabel = busy ? 'Saving…' : 'Save password and sign in'

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    const form = new FormData(event.currentTarget)
    const found: FieldErrors =
      step === 'email'
        ? { email: validateField('email', String(form.get('email') ?? '').trim(), rules) ?? undefined }
        : checkReset({ code: String(form.get('code') ?? '').trim(), password: String(form.get('password') ?? '') }, rules)
    setClientErrors(found)
    if (Object.values(found).some(Boolean)) event.preventDefault()
  }

  return (
    <AuthLayout title={step === 'email' ? 'Reset your password' : 'Choose a new password'} intro={intro}>
      {actionData?.error ? <Callout tone="error">{actionData.error}</Callout> : null}

      {/* A new key per step, so fields and client errors from the email step don't carry over. */}
      <Form key={step} method="post" className="grid gap-5" noValidate onSubmit={onSubmit} onChange={() => setClientErrors({})}>
        <input type="hidden" name="intent" value={step === 'email' ? 'send' : 'reset'} />
        {step === 'email' ? (
          <Field
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={email}
            required
            autoFocus
            maxLength={rules.email?.maxLength}
            error={errors.email}
          />
        ) : (
          <>
            <input type="hidden" name="email" value={email} />
            {codeFromLink ? (
              <input type="hidden" name="code" value={loaderData.code} />
            ) : (
              <Field
                label="Reset code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="[&_input]:font-mono [&_input]:tracking-[0.2em]"
                required
                autoFocus
                error={errors.code}
              />
            )}
            <PasswordField
              label="New password"
              name="password"
              autoComplete="new-password"
              required
              autoFocus={Boolean(codeFromLink)}
              maxLength={rules.password?.maxLength}
              error={errors.password}
              help={rules.password?.hints.join(' ') || undefined}
            />
          </>
        )}
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
      </Form>

      <p className="m-0 text-(length:--ab-font-size-14) text-secondary">
        {step === 'reset' ? (
          <>
            No code? <Link to="/forgot-password">Send a new one</Link> ·{' '}
          </>
        ) : null}
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}
