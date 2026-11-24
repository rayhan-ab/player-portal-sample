import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Narrow centred page for sign-in, registration and 2FA. */
export function AuthLayout({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[var(--ab-width-form)] content-center gap-8 px-[var(--ab-gutter)] py-12">
      <Link to="/" aria-label="Home" className="w-fit">
        <img src="/logo.svg" alt="AccelByte" width={160} height={34} />
      </Link>
      <section className="grid gap-6 rounded-card border border-border bg-surface p-6 sm:p-8">
        <header className="grid gap-2">
          <h1 className="m-0 text-[length:var(--ab-font-size-32)]">{title}</h1>
          {intro ? <p className="m-0 text-secondary">{intro}</p> : null}
        </header>
        {children}
      </section>
    </main>
  )
}
