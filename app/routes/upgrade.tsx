import { UsersApi } from '@accelbyte/sdk-iam'
import { data, Form, redirect, useNavigation } from 'react-router'
import { AuthLayout } from '~/components/AuthLayout'
import { Button } from '~/components/ui/Button'
import { Callout } from '~/components/ui/Callout'
import { Field } from '~/components/ui/Field'
import { PasswordField } from '~/components/ui/PasswordField'
import { validateField } from '~/lib/validation'
import { agsError, createAgsSdk } from '~/server/ags.server'
import { getUser, requireUser, signInHref } from '~/server/auth.server'
import { getRegistrationConfig, getValidationRules } from '~/server/iam-config.server'
import type { Route } from './+types/upgrade'

/**
 * Upgrade a headless account (one made by signing in with a platform) to a
 * full account, by adding an email and password:
 *   1. IAM emails a code to the new address.
 *   2. The code, email and password go to IAM in one call, which upgrades the
 *      account and verifies the email.
 */

export const meta: Route.MetaFunction = () => [{ title: 'Add an email and password · Player Portal' }]

export async function loader({ context }: Route.LoaderArgs) {
  const user = getUser(context)
  if (!user) throw redirect(signInHref('/upgrade'))
  const { data: me } = await UsersApi(createAgsSdk({ accessToken: user.accessToken })).getUsersMe_v3()
  // Already a full account: nothing to upgrade.
  if (me.emailAddress) throw redirect('/account')
  const [rules, config] = await Promise.all([getValidationRules(), getRegistrationConfig()])
  // A namespace with unique display names requires one to upgrade.
  return { rules, needsDisplayName: config.uniqueDisplayNameEnabled }
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireUser(context, request)
  const users = UsersApi(createAgsSdk({ accessToken: user.accessToken }))
  const form = await request.formData()
  const email = String(form.get('email') ?? '').trim()
  const password = String(form.get('password') ?? '')
  const code = String(form.get('code') ?? '').trim()
  const displayName = String(form.get('displayName') ?? '').trim()

  const rules = await getValidationRules()
  const error = validateField('email', email, rules) ?? validateField('password', password, rules)
  if (error) return data({ step: 'details' as const, error, sent: false }, { status: 400 })

  // Step 1: send a code to the new email (also "Send a new code").
  if (!code || form.get('intent') === 'resend') {
    try {
      await users.createUserMeCodeRequest_v3({ emailAddress: email, context: 'upgradeHeadlessAccount', languageTag: 'en-US' })
    } catch (error) {
      const { status, message } = agsError(error)
      return data({ step: 'details' as const, error: message, sent: false }, { status })
    }
    return data({ step: 'verify' as const, error: null, sent: form.get('intent') === 'resend' })
  }

  // Step 2: upgrade with the code.
  try {
    await users.createUserMeHeadlesCodeVerify_v3({
      code,
      emailAddress: email,
      password,
      ...(displayName ? { displayName, uniqueDisplayName: displayName } : {})
    })
  } catch (error) {
    const { status, message } = agsError(error)
    // The SDK checks IAM's answer against its schema and throws if they differ,
    // even when IAM said yes (2xx). The account is upgraded then.
    if (status < 200 || status >= 300) return data({ step: 'verify' as const, error: message, sent: false }, { status })
  }
  throw redirect('/account')
}

export default function Upgrade({ loaderData, actionData }: Route.ComponentProps) {
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST'
  const verifying = actionData?.step === 'verify'

  return (
    <AuthLayout
      title={verifying ? 'Check your email' : 'Add an email and password'}
      intro={verifying ? 'Enter the code we sent to your email.' : 'Then you can sign in without your platform account.'}
    >
      {actionData?.error ? <Callout tone="error">{actionData.error}</Callout> : null}
      {actionData?.sent ? <Callout tone="success">New code sent. Check your email.</Callout> : null}
      <Form method="post" className="grid gap-5" noValidate>
        {/* The details stay in the form (hidden) while the code is entered, so they are sent again with it. */}
        <div className={verifying ? 'hidden' : 'grid gap-5'}>
          <Field label="Email" name="email" type="email" autoComplete="email" required maxLength={loaderData.rules.email?.maxLength} />
          {loaderData.needsDisplayName ? (
            <Field
              label="Display name"
              name="displayName"
              autoComplete="nickname"
              required
              maxLength={loaderData.rules.displayName?.maxLength}
              help="Other players see this name. It must be unique."
            />
          ) : null}
          <PasswordField
            label="Password"
            name="password"
            autoComplete="new-password"
            required
            maxLength={loaderData.rules.password?.maxLength}
            help={loaderData.rules.password?.hints.join(' ') || undefined}
          />
        </div>
        {verifying ? (
          <Field
            label="Verification code"
            name="code"
            autoComplete="one-time-code"
            className="[&_input]:font-mono [&_input]:tracking-[0.2em]"
            required
            autoFocus
          />
        ) : null}
        <Button type="submit" loading={busy}>
          {verifying ? 'Verify and save' : 'Send code'}
        </Button>
        {verifying ? (
          <Button type="submit" name="intent" value="resend" variant="link" disabled={busy}>
            Send a new code
          </Button>
        ) : null}
      </Form>
    </AuthLayout>
  )
}
