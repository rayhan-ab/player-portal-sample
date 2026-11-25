import { UsersApi } from '@accelbyte/sdk-iam'
import { data, Form, redirect, useNavigation } from 'react-router'
import { PlatformLogo } from '~/components/PlatformLogo'
import { Button, ButtonLink, Spinner } from '~/components/ui/Button'
import { Callout } from '~/components/ui/Callout'
import { Card, CardTitle } from '~/components/ui/Card'
import { WEB_LOGIN_PLATFORMS, isWebLoginPlatform } from '~/lib/platforms'
import { agsError, createAgsSdk } from '~/server/ags.server'
import { getUser, requireUser, signInHref } from '~/server/auth.server'
import { getEnv, getRedirectUri } from '~/server/env.server'
import { getSocialPlatforms, isSocialPlatform } from '~/server/iam-config.server'
import type { Route } from './+types/linked'

/**
 * Linked platforms: list, link, unlink.
 *
 * Linking goes through IAM's web link flow:
 *   1. The action asks IAM for the platform's login URL and sends the browser there.
 *   2. The platform sends the player back to IAM, which links the account.
 *   3. IAM sends the browser to our redirect URI (/auth/callback, already
 *      registered on the client) with a `request_id`. The callback forwards it
 *      here, and the loader asks IAM how the link went.
 *
 * A headless account (no email and password) signs in only through its linked
 * platforms, so it can't unlink: that could lock the player out.
 */

export const meta: Route.MetaFunction = () => [{ title: 'Linked accounts · Player Portal' }]

function platformName(id: string): string {
  return isWebLoginPlatform(id) ? WEB_LOGIN_PLATFORMS[id] : id
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = getUser(context)
  if (!user) return { signedIn: false as const, signInHref: signInHref('/account/linked-accounts') }

  const users = UsersApi(createAgsSdk({ accessToken: user.accessToken }))
  const requestId = new URL(request.url).searchParams.get('request_id')
  const [{ data: me }, { data: linked }, platforms, linkStatus] = await Promise.all([
    users.getUsersMe_v3(),
    users.getPlatforms_ByUserId_v3(user.userId),
    getSocialPlatforms(),
    requestId ? users.getAsyncStatus_ByRequestId_v3(requestId).then(r => r.data) : null
  ])

  const linkedIds = new Set(linked.data.map(p => p.platformId))
  return {
    signedIn: true as const,
    headless: !me.emailAddress,
    linked: linked.data
      .filter(p => p.platformId)
      .map(p => ({ id: p.platformId!, name: platformName(p.platformId!), account: p.displayName || p.emailAddress || p.platformUserId })),
    available: platforms.filter(id => !linkedIds.has(id)).map(id => ({ id, name: platformName(id) })),
    // IAM's verdict on the link it just processed, and its error if it failed.
    linkResult: linkStatus && { status: linkStatus.status, error: linkStatus.error?.errorMessage ?? null }
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireUser(context, request)
  const users = UsersApi(createAgsSdk({ accessToken: user.accessToken }))
  const form = await request.formData()
  const platformId = String(form.get('platformId') ?? '')

  if (form.get('intent') === 'link') {
    if (!(await isSocialPlatform(platformId))) return data({ error: 'This platform is not available.' }, { status: 400 })
    const { data: link } = await users.getWebLinkMeUsers_ByPlatformId_v3(platformId, {
      clientId: getEnv().agsClientId,
      redirectUri: getRedirectUri()
    })
    throw redirect(link.third_party_url)
  }

  // Unlink. Checked here too, not only by hiding the button.
  const { data: me } = await users.getUsersMe_v3()
  if (!me.emailAddress) return data({ error: 'Upgrade your account before you unlink a platform.' }, { status: 400 })
  try {
    await users.deleteUserMePlatform_ByPlatformId_v3(platformId, {})
  } catch (error) {
    const { status, message } = agsError(error)
    return data({ error: message }, { status })
  }
  return data({ error: null })
}

export default function Linked({ loaderData, actionData }: Route.ComponentProps) {
  // Which button is busy: match the intent and the platform, so only the
  // pressed button shows a spinner.
  const navigation = useNavigation()
  const busy = (intent: string, platformId: string) =>
    navigation.formData?.get('intent') === intent && navigation.formData?.get('platformId') === platformId

  if (!loaderData.signedIn) {
    return (
      <Card>
        <CardTitle>Sign in to see your linked accounts</CardTitle>
        <div>
          <ButtonLink to={loaderData.signInHref}>Sign in</ButtonLink>
        </div>
      </Card>
    )
  }

  const { headless, linked, available, linkResult } = loaderData
  return (
    <>
      <h1 className="m-0 text-(length:--ab-font-size-32)">Linked accounts</h1>
      {actionData?.error ? <Callout tone="error">{actionData.error}</Callout> : null}
      {linkResult?.status === 'SUCCESS' ? <Callout tone="success">Account linked.</Callout> : null}
      {linkResult && linkResult.status !== 'SUCCESS' ? (
        <Callout tone="error">{linkResult.error ?? `Linking ended with status ${linkResult.status}.`}</Callout>
      ) : null}
      {headless ? (
        <Callout tone="info">
          You sign in only with a linked account, so you can't unlink one yet. <a href="/upgrade">Add an email and password</a> first.
        </Callout>
      ) : null}

      <Card className="gap-0 p-0 sm:p-0">
        {linked.length === 0 ? <p className="m-0 p-6 text-secondary">You have no linked accounts.</p> : null}
        <ul className="m-0 list-none p-0">
          {linked.map(p => (
            <li key={p.id} className="flex items-center gap-4 border-b border-border px-6 py-4 last:border-b-0">
              <PlatformLogo platformId={p.id} size={24} />
              <div className="grid min-w-0 flex-1">
                <strong>{p.name}</strong>
                <span className="truncate text-(length:--ab-font-size-14) text-secondary">{p.account}</span>
              </div>
              {headless ? null : (
                <Form method="post">
                  <input type="hidden" name="platformId" value={p.id} />
                  <Button type="submit" name="intent" value="unlink" variant="link" loading={busy('unlink', p.id)}>
                    Unlink
                  </Button>
                </Form>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {available.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="m-0 text-(length:--ab-font-size-18)">Link another account</h2>
          <div className="flex flex-wrap gap-3">
            {available.map(p => (
              <Form method="post" key={p.id}>
                <input type="hidden" name="platformId" value={p.id} />
                <button
                  type="submit"
                  name="intent"
                  value="link"
                  aria-label={`Link ${p.name}`}
                  title={p.name}
                  disabled={busy('link', p.id)}
                  className="grid size-12 cursor-pointer place-items-center rounded-card border border-border-strong bg-surface hover:bg-surface-hover disabled:opacity-70"
                >
                  {busy('link', p.id) ? <Spinner size={20} /> : <PlatformLogo platformId={p.id} size={24} />}
                </button>
              </Form>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}
