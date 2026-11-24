/**
 * Third-party platforms a player can sign in with from a website: the ones
 * IAM's platform authorize endpoint sends to the platform's own login page.
 * The namespace decides which of these are switched on.
 */
export const WEB_LOGIN_PLATFORMS = {
  google: 'Google',
  discord: 'Discord',
  steamopenid: 'Steam',
  epicgames: 'Epic Games',
  twitch: 'Twitch',
  facebook: 'Facebook',
  xblweb: 'Xbox',
  ps4web: 'PlayStation',
  amazon: 'Amazon',
  snapchat: 'Snapchat',
  oculusweb: 'Meta Quest',
  azure: 'Microsoft'
} as const satisfies Record<string, string>

export type WebLoginPlatform = keyof typeof WEB_LOGIN_PLATFORMS

export function isWebLoginPlatform(id: string): id is WebLoginPlatform {
  return Object.hasOwn(WEB_LOGIN_PLATFORMS, id)
}
