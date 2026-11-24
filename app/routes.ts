import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/home.tsx'),
  route('login', 'routes/login.tsx'),
  route('login/2fa', 'routes/login.2fa.tsx'),
  route('login/queue', 'routes/login.queue.tsx'),
  route('register', 'routes/register.tsx'),
  route('account', 'routes/account.tsx'),
  route('auth/start', 'routes/auth.start.ts'),
  route('auth/callback', 'routes/auth.callback.ts'),
  route('auth/platform/:platformId', 'routes/auth.platform.ts'),
  route('logout', 'routes/logout.ts'),
  route('healthz', 'routes/healthz.ts')
] satisfies RouteConfig
