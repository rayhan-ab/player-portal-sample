import { data, Link, redirect } from 'react-router'
import { AuthLayout } from '~/components/AuthLayout'
import { continueSignIn } from '~/server/auth.server'
import { redeemQueueTicket, refreshQueueTicket } from '~/server/iam.server'
import { commitSession, readSession, setCookieHeaders } from '~/server/session.server'
import type { Route } from './+types/login.queue'

/**
 * The namespace's login queue is full and the player holds a ticket. The page
 * reloads itself at the interval the queue asks for; each load checks the
 * ticket and finishes sign-in once the player reaches the front.
 */
export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: 'Waiting to sign in · Player Portal' },
  { httpEquiv: 'refresh', content: String(loaderData?.pollSeconds ?? 5) }
]

export async function loader({ request }: Route.LoaderArgs) {
  const pending = readSession(request)?.pendingSignIn
  if (!pending?.queue) throw redirect('/login?error=expired')

  const ticket = await refreshQueueTicket(pending.queue.ticket)
  if (!ticket) throw redirect('/login?error=expired')

  if (ticket.position <= 0) {
    const outcome = await redeemQueueTicket(ticket.ticket, pending.codeVerifier)
    // Not quite ready yet: keep waiting instead of failing the sign-in.
    if (outcome.kind !== 'error') throw continueSignIn(request, pending, outcome)
  }

  return data(
    { position: ticket.position, waitSeconds: ticket.estimatedWaitingTimeInSeconds, pollSeconds: ticket.playerPollingTimeInSeconds },
    { headers: setCookieHeaders(commitSession(request, { pendingSignIn: { ...pending, queue: ticket } })) }
  )
}

function formatWait(seconds: number): string {
  if (seconds < 60) return 'less than a minute'
  const minutes = Math.round(seconds / 60)
  return minutes === 1 ? 'about a minute' : `about ${minutes} minutes`
}

export default function Queue({ loaderData }: Route.ComponentProps) {
  return (
    <AuthLayout title="You're in the queue" intro="Lots of players are signing in right now. Keep this page open; it updates by itself.">
      <dl className="m-0 grid grid-cols-2 gap-4">
        <div className="grid gap-1 rounded-(--ab-radius-12) border border-border bg-surface-raised p-4">
          <dt className="text-(length:--ab-font-size-12) text-muted">Your position</dt>
          <dd className="m-0 font-mono text-(length:--ab-font-size-24)" aria-live="polite">
            {loaderData.position.toLocaleString('en-US')}
          </dd>
        </div>
        <div className="grid gap-1 rounded-(--ab-radius-12) border border-border bg-surface-raised p-4">
          <dt className="text-(length:--ab-font-size-12) text-muted">Estimated wait</dt>
          <dd className="m-0 text-(length:--ab-font-size-18)">{formatWait(loaderData.waitSeconds)}</dd>
        </div>
      </dl>
      <p className="m-0 text-(length:--ab-font-size-14) text-secondary">
        <Link to="/login">Cancel and go back</Link>
      </p>
    </AuthLayout>
  )
}
