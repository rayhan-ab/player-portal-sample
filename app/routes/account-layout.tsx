import { Form, Link, NavLink, Outlet } from 'react-router'
import { Button } from '~/components/ui/Button'
import { cx } from '~/components/ui/cx'
import { useSubmitting } from '~/lib/pending'
import { getUser } from '~/server/auth.server'
import type { Route } from './+types/account-layout'

/** The account area's sections. Add a page here and in routes.ts. */
const NAV = [
  { to: '/account', label: 'Profile' },
  { to: '/account/linked-accounts', label: 'Linked accounts' }
]

export function loader({ context }: Route.LoaderArgs) {
  const user = getUser(context)
  return { signedIn: Boolean(user) }
}

/** Shell for the account pages: a top bar, a narrow sidebar and the page. */
export default function AccountLayout({ loaderData }: Route.ComponentProps) {
  const signingOut = useSubmitting({ action: '/logout' })
  const { signedIn } = loaderData

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-(--ab-width-content) items-center justify-between gap-4 px-(--ab-gutter) py-4">
          <Link to="/" aria-label="Home">
            <img src="/logo.svg" alt="AccelByte" width={130} height={28} />
          </Link>
          {signedIn ? (
            <Form method="post" action="/logout">
              <Button type="submit" variant="secondary" size="sm" loading={signingOut}>
                Sign out
              </Button>
            </Form>
          ) : null}
        </div>
      </header>

      <div className="mx-auto grid max-w-(--ab-width-content) gap-8 px-(--ab-gutter) py-10 md:grid-cols-[12rem_1fr]">
        {signedIn ? (
          <div className="grid content-start">
            {/* A row of tabs on small screens, a column on wider ones. */}
            <nav className="-mx-(--ab-gutter) flex gap-1 overflow-x-auto px-(--ab-gutter) md:mx-0 md:flex-col md:px-0">
              {NAV.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end
                  className={({ isActive }) =>
                    cx(
                      'rounded-control px-3 py-2 text-(length:--ab-font-size-14) whitespace-nowrap no-underline',
                      isActive ? 'bg-surface-hover font-bold text-text' : 'text-secondary hover:text-text'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        ) : (
          <div className="hidden md:block" />
        )}
        <main className="grid min-w-0 content-start gap-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
