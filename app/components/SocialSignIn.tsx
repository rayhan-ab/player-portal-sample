import { useEffect, useState } from 'react'
import { WEB_LOGIN_PLATFORMS, type WebLoginPlatform } from '~/lib/platforms'
import { PlatformLogo } from './PlatformLogo'
import { buttonClass, Spinner } from './ui/Button'

/**
 * "Continue with …" buttons for the namespace's active platforms. Plain links
 * (full page loads): each one leaves the site for IAM and the platform. Once
 * one is clicked, it shows a spinner and the others are disabled until the
 * browser leaves the page.
 */
export function SocialSignIn({ platforms, returnTo }: { platforms: WebLoginPlatform[]; returnTo: string }) {
  const [pending, setPending] = useState<WebLoginPlatform | null>(null)

  // Coming back with the browser's Back button can restore this page from the
  // back/forward cache with the spinner still showing. Reset it.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(null)
    }
    window.addEventListener('pageshow', reset)
    return () => window.removeEventListener('pageshow', reset)
  }, [])

  if (platforms.length === 0) return null
  const query = returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`

  return (
    <div className="grid gap-5">
      <div className="grid gap-3" aria-busy={pending !== null}>
        {platforms.map(id => {
          const isPending = pending === id
          return (
            <a
              key={id}
              href={`/auth/platform/${id}${query}`}
              className={buttonClass({ variant: 'secondary' }, 'w-full')}
              aria-disabled={pending !== null || undefined}
              onClick={event => {
                if (pending) event.preventDefault()
                else setPending(id)
              }}
            >
              {isPending ? <Spinner size={20} /> : <PlatformLogo platformId={id} />}
              {isPending ? `Going to ${WEB_LOGIN_PLATFORMS[id]}…` : `Continue with ${WEB_LOGIN_PLATFORMS[id]}`}
            </a>
          )
        })}
      </div>
      <div className="flex items-center gap-3 text-(length:--ab-font-size-12) text-muted" role="separator">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
