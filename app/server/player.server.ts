import { UsersApi } from '@accelbyte/sdk-iam'
import { createAgsSdk } from './ags.server'
import type { SignedInUser } from './auth.server'

/**
 * The name to greet a player by when their account has none of its own. A
 * headless account (made by signing in with a platform such as Google) has no
 * display name, but the platform account linked to it usually does.
 */
export async function getLinkedPlatformName(user: SignedInUser): Promise<string | null> {
  try {
    const { data } = await UsersApi(createAgsSdk({ accessToken: user.accessToken })).getPlatforms_ByUserId_v3(user.userId)
    return data.data.find(p => p.displayName)?.displayName ?? null
  } catch {
    // A missing name is not worth failing the page over.
    return null
  }
}
