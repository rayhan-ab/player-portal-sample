import { redirect } from 'react-router'
import { revokeToken } from '~/server/iam.server'
import { destroySession, readSession, setCookieHeaders } from '~/server/session.server'
import type { Route } from './+types/logout'

/** Sign out is a POST, so a link or image on another site can't sign a player out. */
export async function action({ request }: Route.ActionArgs) {
  const tokens = readSession(request)?.tokens
  if (tokens) await Promise.all([revokeToken(tokens.refreshToken), revokeToken(tokens.accessToken)])
  return redirect('/', { headers: setCookieHeaders(destroySession(request)) })
}

export function loader() {
  return redirect('/')
}
