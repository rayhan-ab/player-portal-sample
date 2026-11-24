import { UsersApi } from '@accelbyte/sdk-iam'
import { Form } from 'react-router'
import { Button, ButtonLink } from '~/components/ui/Button'
import { Card, CardTitle } from '~/components/ui/Card'
import { createAgsSdk } from '~/server/ags.server'
import { getUser, signInHref } from '~/server/auth.server'
import type { Route } from './+types/account'

export const meta: Route.MetaFunction = () => [{ title: 'Your account · Player Portal' }]

export async function loader({ context }: Route.LoaderArgs) {
  const user = getUser(context)
  // Signed out: render the page with a sign-in prompt instead of redirecting.
  if (!user) return { profile: null, signInHref: signInHref('/account') }

  const { data: me } = await UsersApi(createAgsSdk({ accessToken: user.accessToken })).getUsersMe_v3()
  return {
    // Only the fields this page shows go to the browser.
    profile: {
      userId: me.userId,
      displayName: me.uniqueDisplayName || me.displayName,
      email: me.emailAddress,
      emailVerified: me.emailVerified,
      country: me.country
    },
    signInHref: null
  }
}

export default function Account({ loaderData }: Route.ComponentProps) {
  const { profile } = loaderData
  return (
    <main className="mx-auto grid w-full max-w-[var(--ab-width-content)] gap-8 px-[var(--ab-gutter)] py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-[length:var(--ab-font-size-40)]">Your account</h1>
        {profile ? (
          <Form method="post" action="/logout">
            <Button type="submit" variant="secondary" size="sm">
              Sign out
            </Button>
          </Form>
        ) : null}
      </header>

      {profile ? (
        <Card>
          <CardTitle>Profile</CardTitle>
          <dl className="m-0 grid gap-4 sm:grid-cols-2">
            <Item label="Display name" value={profile.displayName} />
            <Item label="Email" value={`${profile.email}${profile.emailVerified ? '' : ' (not verified)'}`} />
            <Item label="Country" value={profile.country} />
            <Item label="User ID" value={profile.userId} mono />
          </dl>
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

function Item({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1">
      <dt className="text-[length:var(--ab-font-size-12)] text-muted">{label}</dt>
      <dd className={`m-0 break-all ${mono ? 'font-mono text-[length:var(--ab-font-size-14)]' : ''}`}>{value || '—'}</dd>
    </div>
  )
}
