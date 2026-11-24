import { UsersApi } from '@accelbyte/sdk-iam'
import { Suspense } from 'react'
import { Await, data, Form, useNavigation } from 'react-router'
import { Button, ButtonLink } from '~/components/ui/Button'
import { Callout } from '~/components/ui/Callout'
import { Card, CardTitle } from '~/components/ui/Card'
import { Field } from '~/components/ui/Field'
import { useSubmitting } from '~/lib/pending'
import { createAgsSdk } from '~/server/ags.server'
import { getUser, requireUser, signInHref, type SignedInUser } from '~/server/auth.server'
import { getCountries } from '~/server/iam-config.server'
import { getLinkedPlatformName } from '~/server/player.server'
import type { Route } from './+types/account'

export const meta: Route.MetaFunction = () => [{ title: 'Your account · Player Portal' }]

type Profile = {
  userId: string
  displayName: string | null
  email: string
  emailVerified: boolean
  country: string
}

async function loadProfile(user: SignedInUser): Promise<Profile> {
  const [{ data: me }, countries, platformName] = await Promise.all([
    UsersApi(createAgsSdk({ accessToken: user.accessToken })).getUsersMe_v3(),
    // The country list only turns a code into a name; show the code if IAM can't list them.
    getCountries().catch(() => []),
    // Only needed when the account has no name of its own (a headless account).
    user.displayName ? null : getLinkedPlatformName(user)
  ])
  // Only the fields this page shows go to the browser.
  return {
    userId: me.userId,
    displayName: me.uniqueDisplayName || me.displayName || platformName,
    email: me.emailAddress,
    emailVerified: me.emailVerified,
    country: countries.find(c => c.code === me.country)?.name ?? me.country
  }
}

/**
 * Returns right away and streams the profile: the page shows a placeholder
 * while IAM answers, instead of holding the navigation until it does.
 */
export function loader({ context }: Route.LoaderArgs) {
  const user = getUser(context)
  // Signed out: render the page with a sign-in prompt instead of redirecting.
  if (!user) return { signedIn: false as const, profile: null, signInHref: signInHref('/account') }
  return { signedIn: true as const, profile: loadProfile(user), signInHref: null }
}

/** HTTP status of a failed SDK call, if the SDK got an answer. */
function statusOf(error: unknown): number | undefined {
  return (error as { response?: { status?: number } }).response?.status
}

/** Email verification: send a new code, or redeem the one the player typed. */
export async function action({ request, context }: Route.ActionArgs) {
  const user = requireUser(context, request)
  const users = UsersApi(createAgsSdk({ accessToken: user.accessToken }))
  const form = await request.formData()

  if (form.get('intent') === 'send-code') {
    const { data: me } = await users.getUsersMe_v3()
    try {
      await users.createUserMeCodeRequest_v3({ emailAddress: me.emailAddress, context: 'UserAccountRegistration', languageTag: 'en-US' })
    } catch (error) {
      // 409: already verified. The page reloads and shows that.
      if (statusOf(error) === 409) return data({ result: 'verified' as const, error: null })
      return data({ result: null, error: 'We could not send a code. Try again in a minute.' }, { status: 502 })
    }
    return data({ result: 'sent' as const, error: null })
  }

  const code = String(form.get('code') ?? '')
    .replace(/\s+/g, '')
    .toUpperCase()
  if (!code) return data({ result: null, error: 'Enter the code from the email.' }, { status: 400 })
  try {
    await users.createUserMeCodeVerify_v3({ code, contactType: 'email', languageTag: 'en-US' })
  } catch (error) {
    const status = statusOf(error)
    if (status && status < 500)
      return data({ result: null, error: 'That code is not right or has expired. Send a new one.' }, { status: 400 })
    return data({ result: null, error: 'We could not check the code. Try again in a minute.' }, { status: 502 })
  }
  return data({ result: 'verified' as const, error: null })
}

export default function Account({ loaderData, actionData }: Route.ComponentProps) {
  const signingOut = useSubmitting({ action: '/logout' })
  const { profile } = loaderData
  return (
    <main className="mx-auto grid w-full max-w-(--ab-width-content) gap-8 px-(--ab-gutter) py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-(length:--ab-font-size-40)">Your account</h1>
        {profile ? (
          <Form method="post" action="/logout">
            <Button type="submit" variant="secondary" size="sm" loading={signingOut}>
              Sign out
            </Button>
          </Form>
        ) : null}
      </header>

      {profile ? (
        <Card>
          <CardTitle>Profile</CardTitle>
          <Suspense fallback={<ProfileSkeleton />}>
            <Await
              resolve={profile}
              errorElement={<Callout tone="error">We could not load your profile. Refresh the page to try again.</Callout>}
            >
              {profile => (
                <>
                  <dl className="m-0 grid gap-4 sm:grid-cols-2">
                    <Item label="Display name" value={profile.displayName} />
                    <Item
                      label="Email"
                      value={profile.email ? `${profile.email}${profile.emailVerified ? '' : ' (not verified)'}` : 'Not set'}
                    />
                    <Item label="Country" value={profile.country} />
                    <Item label="User ID" value={profile.userId} mono />
                  </dl>
                  {actionData?.result === 'verified' ? <Callout tone="success">Your email is verified.</Callout> : null}
                  {profile.email ? null : (
                    <Callout tone="info">This account has no email or password yet. You sign in with a linked platform.</Callout>
                  )}
                  {!profile.email || profile.emailVerified ? null : (
                    <VerifyEmail email={profile.email} result={actionData?.result ?? null} error={actionData?.error ?? null} />
                  )}
                </>
              )}
            </Await>
          </Suspense>
        </Card>
      ) : (
        <Card>
          <CardTitle>Sign in to see your account</CardTitle>
          <p className="m-0 text-secondary">Your profile, linked platforms and privacy settings are here once you sign in.</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to={loaderData.signInHref ?? '/login'}>Sign in</ButtonLink>
            <ButtonLink to="/register" variant="secondary">
              Create an account
            </ButtonLink>
          </div>
        </Card>
      )}
    </main>
  )
}

/** Same layout as the profile list, so nothing jumps when it arrives. */
function ProfileSkeleton() {
  return (
    <dl className="m-0 grid animate-pulse gap-4 sm:grid-cols-2" aria-busy="true" aria-label="Loading your profile">
      {['w-32', 'w-48', 'w-24', 'w-64'].map(width => (
        <div key={width} className="grid gap-2">
          <dt className="h-3 w-20 rounded-(--ab-radius-4) bg-surface-hover" />
          <dd className={`m-0 h-5 ${width} max-w-full rounded-(--ab-radius-4) bg-surface-hover`} />
        </div>
      ))}
    </dl>
  )
}

function Item({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <div className="grid gap-1">
      <dt className="text-(length:--ab-font-size-12) text-muted">{label}</dt>
      <dd className={`m-0 break-all ${mono ? 'font-mono text-(length:--ab-font-size-14)' : ''}`}>{value || '—'}</dd>
    </div>
  )
}

/** Code form for an unverified email. IAM emails a code when the account is created. */
function VerifyEmail({ email, result, error }: { email: string; result: 'sent' | 'verified' | null; error: string | null }) {
  const navigation = useNavigation()
  const busy = navigation.state !== 'idle' && navigation.formMethod === 'POST'
  const verifying = useSubmitting({ intent: 'verify' })
  const sending = useSubmitting({ intent: 'send-code' })

  return (
    <section className="grid gap-4 border-t border-border pt-6">
      <div className="grid gap-1">
        <h3 className="m-0 text-(length:--ab-font-size-18)">Verify your email</h3>
        <p className="m-0 text-(length:--ab-font-size-14) text-secondary">
          Enter the code we sent to {email}. Codes expire after 5 minutes.
        </p>
      </div>
      {error ? <Callout tone="error">{error}</Callout> : null}
      {result === 'sent' ? <Callout tone="success">New code sent. Check your email.</Callout> : null}
      <Form method="post" className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end" noValidate>
        <Field
          label="Verification code"
          name="code"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
          required
          className="[&_input]:font-mono [&_input]:tracking-[0.2em] [&_input]:uppercase"
        />
        <Button type="submit" name="intent" value="verify" disabled={busy} loading={verifying}>
          Verify
        </Button>
      </Form>
      <Form method="post">
        <Button type="submit" name="intent" value="send-code" variant="link" disabled={busy} loading={sending}>
          Send a new code
        </Button>
      </Form>
    </section>
  )
}
