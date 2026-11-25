import { redirect } from 'react-router'
import { revokeToken } from '~/server/iam.server'
import { clearSession, readSession, setCookieHeaders } from '~/server/session.server'
import type { Route } from './+types/logout'

/** Sign out is a POST, so a link or image on another site can't sign a player out. */
export async function action({ request }: Route.ActionArgs) {
  const { accessToken, refreshToken } = readSession(request)
  await Promise.all([refreshToken && revokeToken(refreshToken), accessToken && revokeToken(accessToken)])
  return redirect('/', { headers: setCookieHeaders(clearSession()) })
}

export function loader() {
  return redirect('/')
}
