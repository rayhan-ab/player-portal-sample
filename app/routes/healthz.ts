import { OAuth20Api } from '@accelbyte/sdk-iam'
import { createAgsSdk } from '~/server/ags.server'

/**
 * Health check for load balancers and uptime monitors. Reports whether AGS IAM
 * is reachable from this server. Never returns configuration or secrets.
 */
export async function loader() {
  try {
    await OAuth20Api(createAgsSdk()).getOauthJwks_v3()
    return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ status: 'degraded', reason: 'AGS IAM unreachable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
