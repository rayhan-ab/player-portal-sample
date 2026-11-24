import {
  AmazonLogoIcon,
  DiscordLogoIcon,
  FacebookLogoIcon,
  GameControllerIcon,
  GoogleLogoIcon,
  MetaLogoIcon,
  SnapchatLogoIcon,
  SteamLogoIcon,
  TwitchLogoIcon,
  WindowsLogoIcon,
  type Icon
} from '@phosphor-icons/react'
import { WEB_LOGIN_PLATFORMS, type WebLoginPlatform } from '~/lib/platforms'
import { buttonClass } from './ui/Button'

const ICONS: Partial<Record<WebLoginPlatform, Icon>> = {
  google: GoogleLogoIcon,
  discord: DiscordLogoIcon,
  steamopenid: SteamLogoIcon,
  twitch: TwitchLogoIcon,
  facebook: FacebookLogoIcon,
  amazon: AmazonLogoIcon,
  snapchat: SnapchatLogoIcon,
  oculusweb: MetaLogoIcon,
  azure: WindowsLogoIcon
}

/**
 * "Continue with …" buttons for the namespace's active platforms. Plain links
 * (full page loads): each one leaves the site for IAM and the platform.
 */
export function SocialSignIn({ platforms, returnTo }: { platforms: WebLoginPlatform[]; returnTo: string }) {
  if (platforms.length === 0) return null
  const query = returnTo === '/' ? '' : `?returnTo=${encodeURIComponent(returnTo)}`

  return (
    <div className="grid gap-5">
      <div className="grid gap-3">
        {platforms.map(id => {
          const PlatformIcon = ICONS[id] ?? GameControllerIcon
          return (
            <a key={id} href={`/auth/platform/${id}${query}`} className={buttonClass({ variant: 'secondary' }, 'w-full')}>
              <PlatformIcon aria-hidden size={20} weight="bold" />
              Continue with {WEB_LOGIN_PLATFORMS[id]}
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
