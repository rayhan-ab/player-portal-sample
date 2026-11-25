import { index, layout, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('login', 'routes/login.tsx'),
  // IAM's reset email links to "<login website URL>reset-password", so the
  // same page is served there too (see the module).
  route('login/reset-password', 'routes/forgot-password.tsx', { id: 'reset-password' }),
  route('register', 'routes/register.tsx'),
  route('forgot-password', 'routes/forgot-password.tsx'),
  layout('routes/account-layout.tsx', [route('account', 'routes/account.tsx'), route('account/linked-accounts', 'routes/linked.tsx')]),
  route('upgrade', 'routes/upgrade.tsx'),
  route('auth/start', 'routes/auth.start.ts'),
  route('auth/callback', 'routes/auth.callback.ts'),
  route('auth/platform/:platformId', 'routes/auth.platform.ts'),
  route('logout', 'routes/logout.ts'),
  route('healthz', 'routes/healthz.ts')
] satisfies RouteConfig
