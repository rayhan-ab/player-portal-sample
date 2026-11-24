import { useState } from 'react'
import { data, Form, Link, redirect, useNavigation } from 'react-router'
import { AuthLayout } from '~/components/AuthLayout'
import { Button } from '~/components/ui/Button'
import { Callout } from '~/components/ui/Callout'
import { Field } from '~/components/ui/Field'
import { continueSignIn } from '~/server/auth.server'
import { sendMfaEmailCode, verifyMfa } from '~/server/iam.server'
import { readSession } from '~/server/session.server'
import type { Route } from './+types/login.2fa'

export const meta: Route.MetaFunction = () => [{ title: 'Two-factor authentication · Player Portal' }]

const FACTORS: Record<string, { label: string; prompt: string; inputMode: 'numeric' | 'text' }> = {
  authenticator: {
    label: 'Authenticator app',
    prompt: 'Enter the 6-digit code from your authenticator app.',
    inputMode: 'numeric'
  },
  email: { label: 'Email', prompt: 'Enter the code we sent to your email.', inputMode: 'numeric' },
  backupCode: { label: 'Backup code', prompt: 'Enter one of your backup codes. Each code works once.', inputMode: 'text' }
}

function pendingChallenge(request: Request) {
  const pending = readSession(request)?.pendingSignIn
  // Nothing to verify: the sign-in expired or never asked for 2FA.
  if (!pending?.mfa) throw redirect('/login?error=expired')
  return { pending, mfa: pending.mfa }
}

export async function loader({ request }: Route.LoaderArgs) {
  const { mfa } = pendingChallenge(request)
  const factors = mfa.factors.filter(factor => factor in FACTORS)
  return {
    factors,
    defaultFactor: factors.includes(mfa.defaultFactor) ? mfa.defaultFactor : (factors[0] ?? 'authenticator')
  }
}

export async function action({ request }: Route.ActionArgs) {
  const { pending, mfa } = pendingChallenge(request)
  const form = await request.formData()
  const factor = String(form.get('factor') ?? '')
  if (!mfa.factors.includes(factor)) {
    return data({ error: 'Choose a verification method.', sent: false }, { status: 400 })
  }

  if (form.get('intent') === 'send-email') {
    const sent = await sendMfaEmailCode(mfa.mfaToken)
    return data({ error: sent ? null : 'We could not send a code. Try again in a minute.', sent })
  }

  const code = String(form.get('code') ?? '').replace(/\s+/g, '')
  if (!code) return data({ error: 'Enter your code.', sent: false }, { status: 400 })

  const outcome = await verifyMfa({ mfaToken: mfa.mfaToken, factor, code })
  if (outcome.kind === 'error') {
    const expired = /expired|not found|invalid mfa token/i.test(`${outcome.error} ${outcome.description}`)
    if (expired) throw redirect('/login?error=expired')
    return data({ error: 'That code is not right. Check it and try again.', sent: false }, { status: 400 })
  }
  return continueSignIn(request, pending, outcome)
}

export default function TwoFactor({ loaderData, actionData }: Route.ComponentProps) {
  const [factor, setFactor] = useState(loaderData.defaultFactor)
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST'
  const info = FACTORS[factor] ?? FACTORS.authenticator!

  return (
    <AuthLayout title="Two-factor authentication" intro={info.prompt}>
      {actionData?.error ? <Callout tone="error">{actionData.error}</Callout> : null}
      {actionData?.sent ? <Callout tone="success">Code sent. Check your email.</Callout> : null}

      <Form method="post" className="grid gap-5" noValidate>
        {loaderData.factors.length > 1 ? (
          <fieldset className="m-0 grid gap-2 border-0 p-0">
            <legend className="mb-2 text-[length:var(--ab-font-size-14)] font-bold">Verify with</legend>
            {loaderData.factors.map(option => (
              <label key={option} className="flex items-center gap-2 text-[length:var(--ab-font-size-14)] text-secondary">
                <input
                  type="radio"
                  name="factor"
                  value={option}
                  checked={factor === option}
                  onChange={() => setFactor(option)}
                  className="accent-[var(--ab-color-action)]"
                />
                {FACTORS[option]?.label ?? option}
              </label>
            ))}
          </fieldset>
        ) : (
          <input type="hidden" name="factor" value={factor} />
        )}

        <Field
          key={factor}
          label="Code"
          name="code"
          inputMode={info.inputMode}
          autoComplete="one-time-code"
          className="[&_input]:font-mono [&_input]:tracking-[0.2em]"
          required
          autoFocus
        />

        <Button type="submit" name="intent" value="verify" disabled={busy}>
          {busy ? 'Verifying…' : 'Verify'}
        </Button>
        {factor === 'email' ? (
          <Button type="submit" name="intent" value="send-email" variant="secondary" disabled={busy} formNoValidate>
            Send a new code
          </Button>
        ) : null}
      </Form>

      <p className="m-0 text-[length:var(--ab-font-size-14)] text-secondary">
        <Link to="/login">Back to sign in</Link>
      </p>
    </AuthLayout>
  )
}
