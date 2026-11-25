import { AccelByte, type AccelByteSDK } from '@accelbyte/sdk'
import { getEnv, getRedirectUri } from './env.server'

/**
 * The one place this app talks to AGS.
 *
 * Every call to AGS happens on the server, in a loader or an action, using the
 * official AccelByte TypeScript SDK. The browser never calls AGS directly and
 * never sees a token, so the namespace needs no CORS setup.
 *
 * Usage:
 *   const sdk = createAgsSdk({ accessToken });
 *   const { data } = await UsersApi(sdk).getUsersMe_v3();
 */
export function createAgsSdk(options: { accessToken?: string } = {}): AccelByteSDK {
  const env = getEnv()
  // A new SDK instance per request: the token is per player, so an instance
  // must never be shared between requests.
  const sdk = AccelByte.SDK({
    coreConfig: {
      baseURL: env.agsBaseUrl,
      clientId: env.agsClientId,
      namespace: env.agsNamespace,
      redirectURI: getRedirectUri()
    },
    axiosConfig: {
      request: {
        timeout: 15_000,
        // Browser-only setting; IAM's own cookies are never used here.
        withCredentials: false
      }
    }
  })
  if (options.accessToken) sdk.setToken({ accessToken: options.accessToken })
  return sdk
}

/**
 * Basic auth for this app's IAM client, for the IAM endpoints that ask for it
 * (revoke). The client is public, so the password part is empty. Pass it per
 * call: OAuth20Api(sdk, clientAuth()).postOauthRevoke_v3({...})
 */
export function clientAuth() {
  const basic = Buffer.from(`${getEnv().agsClientId}:`).toString('base64')
  return { axiosConfig: { request: { headers: { Authorization: `Basic ${basic}` } } } }
}

/** What AGS answered to a failed SDK call: HTTP status, AGS error code and message. */
export function agsError(error: unknown): { status: number; errorCode: number; message: string } {
  const response = (error as { response?: { status?: number; data?: Record<string, unknown> } }).response
  const body = response?.data ?? {}
  return {
    status: response?.status ?? 502,
    errorCode: Number(body.errorCode ?? 0),
    message: String(body.errorMessage ?? body.error_description ?? (error as Error).message ?? 'Unknown error')
  }
}
