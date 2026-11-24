/**
 * Checks the .env setup against AGS from the server side, using the same SDK
 * wrapper as the app:
 *   1. IAM is reachable.
 *   2. IAM accepts an authorization request for this client and redirect URI
 *      (the first step of sign-in). The redirect is read, not followed.
 *
 * Run: npm run check:ags
 */
import { createHash, randomBytes } from 'node:crypto'
import { OAuth20Api } from '@accelbyte/sdk-iam'
import { createAgsSdk } from '../app/server/ags.server'
import { getEnv, getRedirectUri } from '../app/server/env.server'

const env = getEnv()
console.log(`AGS: ${env.agsBaseUrl} (namespace ${env.agsNamespace})`)

const jwks = await OAuth20Api(createAgsSdk()).getOauthJwks_v3()
console.log(`✓ IAM reachable (${jwks.data.keys?.length ?? 0} signing keys)`)

const verifier = randomBytes(32).toString('base64url')
const authorize = new URL('/iam/v3/oauth/authorize', env.agsBaseUrl)
authorize.search = new URLSearchParams({
  response_type: 'code',
  client_id: env.agsClientId,
  redirect_uri: getRedirectUri(),
  state: randomBytes(16).toString('base64url'),
  code_challenge: createHash('sha256').update(verifier).digest('base64url'),
  code_challenge_method: 'S256'
}).toString()

const response = await fetch(authorize, { redirect: 'manual' })
const location = new URL(response.headers.get('Location') ?? '', env.agsBaseUrl)
if (response.status === 302 && location.searchParams.get('request_id')) {
  console.log(`✓ Client ${env.agsClientId} accepted, IAM redirects sign-in to ${location.origin}${location.pathname}`)
} else {
  const error = location.searchParams.get('error') ?? `HTTP ${response.status}`
  console.error(
    `✗ Authorization request rejected (${error}). Check AGS_CLIENT_ID and that the client's redirect URI is ${getRedirectUri()}.`
  )
  process.exit(1)
}
