import { Form } from 'react-router'
import { Button, ButtonLink } from '~/components/ui/Button'
import { Card, CardTitle } from '~/components/ui/Card'
import { getUser } from '~/server/auth.server'
import type { Route } from './+types/home'

export const meta: Route.MetaFunction = () => [{ title: 'Player Portal' }, { name: 'description', content: 'Manage your account.' }]

export async function loader({ context }: Route.LoaderArgs) {
  const user = getUser(context)
  // Only send the browser what the page needs. Never the session or tokens.
  return { displayName: user ? user.displayName || 'player' : null }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-[var(--ab-width-form)] content-center gap-8 px-[var(--ab-gutter)] py-16">
      <img src="/logo.svg" alt="AccelByte" width={160} height={34} />
      <Card>
        <CardTitle>Player Portal</CardTitle>
        <p className="m-0 text-secondary">Sign in to manage your account, linked platforms, codes and privacy settings.</p>
        {loaderData.displayName ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="m-0 w-full text-secondary">Signed in as {loaderData.displayName}.</p>
            <ButtonLink to="/account">Go to your account</ButtonLink>
            <Form method="post" action="/logout">
              <Button type="submit" variant="secondary">
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
