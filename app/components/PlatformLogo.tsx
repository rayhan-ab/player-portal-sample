import { AmazonLogoIcon, GameControllerIcon, type Icon } from '@phosphor-icons/react'

/** Logos from the AccelByte Admin Portal (public/icons). */
const IMAGES: Record<string, string> = {
  google: '/icons/google.svg',
  twitch: '/icons/twitch.svg',
  discord: '/icons/discord.svg',
  steamopenid: '/icons/steam.svg',
  steam: '/icons/steam.svg',
  epicgames: '/icons/epicgames.svg',
  facebook: '/icons/fb.svg',
  xblweb: '/icons/xbox.svg',
  ps4web: '/icons/psn.svg',
  oculusweb: '/icons/meta-quest.svg',
  snapchat: '/icons/snapchat.svg',
  azure: '/icons/microsoft.svg',
  apple: '/icons/apple.svg'
}

const ICONS: Record<string, Icon> = {
  amazon: AmazonLogoIcon
}

/** A platform's logo. Platforms without one get a game controller. */
export function PlatformLogo({ platformId, size = 20 }: { platformId: string; size?: number }) {
  const image = IMAGES[platformId]
  if (image) return <img src={image} alt="" width={size} height={size} className="object-contain" style={{ width: size, height: size }} />
  const PlatformIcon = ICONS[platformId] ?? GameControllerIcon
  return <PlatformIcon aria-hidden size={size} weight="bold" />
}
