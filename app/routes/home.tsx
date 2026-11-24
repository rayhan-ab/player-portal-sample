import { Suspense } from 'react'
import { Await, Form } from 'react-router'
import { Button, ButtonLink } from '~/components/ui/Button'
import { Card, CardTitle } from '~/components/ui/Card'
import { useSubmitting } from '~/lib/pending'
import { getUser } from '~/server/auth.server'
import { getLinkedPlatformName } from '~/server/player.server'
import type { Route } from './+types/home'

export const meta: Route.MetaFunction = () => [{ title: 'Player Portal' }, { name: 'description', content: 'Manage your account.' }]

export function loader({ context }: Route.LoaderArgs) {
  const user = getUser(context)
  // Only send the browser what the page needs. Never the session or tokens.
  if (!user) return { signedIn: false, displayName: null }
  // A name from the linked platform is streamed, so the page doesn't wait for IAM.
  return { signedIn: true, displayName: user.displayName || getLinkedPlatformName(user) }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const signingOut = useSubmitting({ action: '/logout' })
  return (
    <main className="mx-auto grid min-h-dvh max-w-(--ab-width-form) content-center gap-8 px-(--ab-gutter) py-16">
      <img src="/logo.svg" alt="AccelByte" width={160} height={34} />
      <Card>
        <CardTitle>Player Portal</CardTitle>
        <p className="m-0 text-secondary">Sign in to manage your account, linked platforms, codes and privacy settings.</p>
        {loaderData.signedIn ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 w-full text-secondary">
              <Suspense fallback="You're signed in.">
                <Await resolve={loaderData.displayName} errorElement="You're signed in.">
                  {name => (name ? `Signed in as ${name}.` : "You're signed in.")}
                </Await>
              </Suspense>
            </p>
            <ButtonLink to="/account">Go to your account</ButtonLink>
            <Form method="post" action="/logout">
              <Button type="submit" variant="secondary" loading={signingOut}>
                Sign out
              </Button>
            </Form>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/login">Sign in</ButtonLink>
            <ButtonLink to="/register" variant="secondary">
              Create an account
            </ButtonLink>
          </div>
        )}
      </Card>
    </main>
  )
}
