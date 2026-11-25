# Player Portal Sample — Plan

Status: M2 done, 2026-11-25. Owner: Rayhan.
Origin: Slack thread with William Wu (#C0CAB50EHB3, 2026-11-24).

## 1. Goal

A public sample, on GitHub, that AGS public cloud clients can run in minutes and copy into their own sites. It shows how a website calls AGS player-facing features with proper, secure session handling. It ships with:

- the **Login Website** (sign in, register, social login), and
- the **Player Portal** (account management and player self-service).

AccelByte also hosts a **live demo** of it.

Non-goals: replacing the existing `justice-playerportal-website` or `justice-login-website`, reaching feature parity with them, and admin features.

## 2. Principles

1. **Secure by default.** Clients will copy this as it is. Tokens never reach the browser.
2. **Easy to start.** Clone, fill in `.env`, run one command. No Docker required.
3. **Easy to read.** One feature lives in one route module. AGS calls are wrapped in one thin, obvious layer.
4. **Easy to re-skin.** The look comes from one token layer that a client swaps for their own brand.
5. **Few, current dependencies.** Pin exact versions and avoid extra libraries that aren't needed.

## 3. Scope

### v1 (William's list)

| Area | Features |
|---|---|
| Login Website | Email/username + password sign-in, registration (with email verification), forgot/reset password, social login (start with Google + one more, e.g. Discord or Steam), sign out |
| Account upgrade | Upgrade a headless (platform-only) account to a full account |
| Account linking | List linked platforms, link a new platform, unlink. A headless account (no email and password, only platform sign-in) can't unlink: hide Unlink and refuse it in the action too, or the player loses the only way into the account. Show "Upgrade your account" instead |
| Account management | View/edit profile (display name, etc.), change password, change email |
| Redeem code | Redeem a code and show what was granted |
| GDPR | Request account deletion (and cancel it), request a personal data download |

### Cut from v1 (decided 2026-11-25)

Scope is William's Slack list and nothing more; Phil asked for "a few key, frequently used flows and not the kitchen sink". So these are cut, and listed in the README as not covered:

- **2FA challenge** at sign-in. A namespace with 2FA on gets a clear error message instead.
- **Login queue** at sign-in. Same: a clear "try again" message.
- **Legal agreements** at registration.

Forgot/reset password stays: it isn't on William's list, but every login website has it. IAM emails a code and a link to `<login website URL>reset-password?code=…&email=…` (`justice-iam-service` `pkg/account/api/usercommonhandlers.go:384`); the sample serves that page at `/login/reset-password`, and players can also type the code on `/forgot-password`.

### Later

Entitlements and wallet view, MFA setup/management, ban status display, localization.

## 4. Architecture

**Stack:** React Router v8 in framework mode (`ssr: true`). One app holds both the frontend and the backend. Node ≥ 22.22, Vite 7+, TypeScript, Tailwind v4 carrying the design-system tokens. npm for installs and scripts.

**Pattern:** backend-for-frontend (BFF), stateless: no database, no Redis.

```
Browser ──(HttpOnly session cookie)──▶ Sample app server (loaders/actions)
                                              │  cookie holds { access, refresh, expiry }
                                              │  public IAM client, auth code + PKCE run by the server
                                              ▼
                                            AGS (IAM, Platform, GDPR, Basic)
                                            calls carry Authorization: Bearer <access token>
```

- **AGS SDK:** the official TypeScript SDK, used on the server only: `@accelbyte/sdk` 4.3.4, `@accelbyte/sdk-iam` 6.3.7, `@accelbyte/sdk-platform` 6.3.7, `@accelbyte/sdk-gdpr` 5.3.7, `@accelbyte/sdk-basic` 6.2.9 (latest on npm, 2026-11-24). Fall back to plain `fetch` only where the SDK gets in the way of server-side use. Prove this in M0.
- **Session:** the tokens go in HttpOnly cookies as they are (no encryption, no secret): `session_access` (expires a minute before the token, so its absence triggers a refresh), `session_refresh`, and `session_signin` for a sign-in in progress. One token per cookie keeps each under 4 KB. Page scripts never read them. Encrypting would not stop a stolen cookie being replayed, and IAM sets its own token cookies the same way. The server treats the cookie as browser input: AGS validates the token, `returnTo` is checked against open redirects, and no user ID is stored beside the token. No store, so it runs on any host, serverless included. Trade-off: a session can't be killed server-side, only by revoking its tokens at IAM (sign-out does this).
- **IAM client:** Public, no secret. The tokens never leave the server, so a confidential client added little, and a public one removes the leaked-secret and admin-permission risks.
- **No browser → AGS calls.** Everything goes through loaders and actions. So no CORS setup is needed on the namespace, and IAM's Referer check never triggers.

### Facts from `justice-iam-service` this design relies on

- The Referer check only applies when IAM reads the token from **its own cookie**: `access_token` (`pkg/apicommon/authfilter.go:56`, `:204`), or a refresh request that has no `refresh_token` in the body (`pkg/oauth/api/v3handlers.go:7706`). Bearer headers and a `refresh_token` sent in the body skip it.
- IAM's cookies are `SameSite=None` and host-only on the IAM domain (`utils/cookie/cookie.go:83`), so they are third-party on a client's domain. Don't rely on them.
- A used refresh token is revoked (`pkg/oauth/model/jwtstore.go:555`). This needs a refresh lock.
- PKCE is required for public clients (`pkg/oauth/api/api.go:288`). Confidential clients authenticate with Basic auth (`v3handlers.go:4125`).
- **The custom login website URL is not in prod yet.** The code exists (set per studio through Config Service, `pkg/apicommon/apicommon.go:1809`, `:1877`), but until it ships, `/oauth/authorize` sends browsers to the AccelByte login site. The sample supports the redirect flow (IAM → our `/login?request_id=…`) as its main Login Website role. It also has a fallback: the server starts the authorize request itself and reads `request_id` from IAM's redirect `Location` without following it (`request_id` is set at `v3handlers.go:4587`). The fallback is what keeps it working in prod until the feature ships.

## 5. Auth flows

1. **Sign in (authorization code + PKCE, public client)**
   One `/login` page acts as a real Login Website and has two ways in. Both end in the same form and action:
   1. **Redirect from IAM (the primary flow, the Login Website role).** `/auth/start` creates the `state` and PKCE verifier, stores them in a short-lived pre-session, and redirects the browser to `GET /iam/v3/oauth/authorize`. IAM redirects to the studio's login website, which is our `/login?request_id=…`, and the page uses that `request_id`. This needs the studio's custom login website URL set to `https://<host>/login/`, which is not in prod yet. The trailing slash matters: IAM appends `reset-password` to it for the reset email link.
   2. **No `request_id` in the URL (fallback, needed in prod today).** If a player opens `/login` directly, or IAM is still sending browsers to the AccelByte login site, the `/login` loader starts the authorize request from the server. It creates `state` + PKCE the same way, calls `GET /iam/v3/oauth/authorize` without following the redirect, and takes the `request_id` from the `Location` header.
   3. The `/login` action posts the credentials to IAM `POST /iam/v3/authenticate` (with `request_id`), from the server, and reads `code` from IAM's redirect. A 2FA or login-queue answer becomes an error message (both are cut from v1).
   4. `/auth/callback` checks `state`, exchanges `code` + verifier at `/iam/v3/oauth/token`, stores the tokens, sets the cookie and redirects into the portal.
2. **Social login:** `/login` offers the platform buttons and sends the browser to IAM `GET /iam/v3/oauth/platforms/{platformId}/authorize?request_id=…`. IAM handles the platform callback and returns to `/auth/callback` with a code. "Not linked" and "create account" outcomes go to the register or link screens. **Verify in M3:** some of these outcomes may redirect to the login website, which is the AccelByte login site in prod today. If so, use the platform token grant from the server for those platforms instead (as type-so-fast does for Google). Decided 2026-11-24: Google also goes through IAM's redirect, like every other platform, because that's how a Login Website normally works. The ID-token flow type-so-fast uses is not the default (see section 9 for the setup it needs instead).
3. **Registration:** a server action creates the user (IAM v4 public users), runs email verification by code, then signs the player in.
4. **Refresh:** done on the server, in the root middleware, so each request refreshes at most once (React Router's single fetch sends one request per navigation). Replace both tokens and treat a failed refresh as signed out. IAM revokes a used refresh token, so two parallel requests both refreshing would sign the player out: refresh a little before expiry, and keep an in-process lock keyed by refresh token for same-instance races.
5. **Sign out:** revoke the token at IAM (`/iam/v3/oauth/revoke`), delete the session and clear the cookie.

Exact endpoints, request shapes and SDK method names get confirmed against the AGS API docs and the SDK in M0/M1. IAM has the needed routes (authorize, authenticate, token, revoke, platform authorize/link/unlink, headless upgrade, `users/me`, password), but this plan doesn't depend on their exact paths.

## 6. Security checklist (acceptance criteria)

- [ ] Session cookies `session_*`: `HttpOnly; Secure; SameSite=Lax; Path=/`. Contents validated on read; `returnTo` passes `safeReturnTo()`.
- [ ] No AGS token in the HTML, JS, `localStorage`, `sessionStorage` or loader data sent to the browser. Add a test that greps rendered output for JWT patterns.
- [ ] `state` and PKCE are checked on callback. `redirect_uri` is exact-match registered on the IAM client.
- [ ] CSRF: React Router rejects posts whose `Origin` doesn't match (400), on top of `SameSite=Lax`.
- [ ] Security headers: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`. No CSP, to keep the sample simple (decided 2026-11-25).
- [ ] No `VITE_`-prefixed variables that hold anything sensitive.
- [ ] The IAM client has player-level permissions only. The README warns against admin permissions.
- [ ] Concurrent refreshes don't revoke each other (see Refresh).
- [ ] Sign-out revokes the token at IAM.
- [ ] Credentials are never logged, and neither are tokens or personal data.
- [ ] Rate-limit hints for `/login` and `/register` in the README (per-host).

## 7. UI — AccelByte Web Design System

Source: the organization's default Design System artifact, https://claude.ai/artifact/HcsDRzQs7eHwcLSuKUhC5d. It's a marketing system built from the Astro site in `accelbyte-website-hubspot-theme`, so it's used as a base, not as a complete app kit.

- **Take:**
  - Color tokens (AccelBlue ramp, blue-cast neutrals, feedback colors, alphas).
  - Themes: Dark is the default. Pick Dark or Light for the portal, decided in M1.
  - Type scale and fonts (Martian Grotesk for headings, Inter for body and controls, Martian Mono for codes such as redeem codes).
  - Spacing, radius and motion tokens.
  - Phosphor icons.
  - Component styling for Button, Badge, Tag, Card, Callout, Tabs, Accordion, Field, Input, Select, Checkbox, Radio, Container, Stack, Cluster, Grid.
- **How:**
  - The tokens become one CSS file (`app/styles/tokens.css`), mapped into Tailwind v4 `@theme`.
  - The components are rebuilt as small local React components in `app/components/ui/` that follow the system's anatomy and token names.
  - A client re-skins by editing `tokens.css` alone.
- **Build ourselves** (the system has no app patterns): account layout with sidebar navigation, linked-account list rows, status and empty states, confirmation dialog, toasts, form error summary.
- **Don't take:** marketing patterns (Hero, LogoRail, CtaBand, etc.), customer logos and imagery, the Silkscreen font.
- **Check before publishing:** font licenses for redistribution in a public repo (Inter is OFL; confirm Martian Grotesk / Martian Mono). AccelByte logo usage in a sample clients fork.

## 8. Project structure (proposed)

```
player-portal-sample/
  app/
    root.tsx
    routes.ts
    routes/
      _auth.login.tsx  _auth.register.tsx  _auth.forgot.tsx  _auth.reset.tsx
      auth.start.ts  auth.callback.ts  auth.logout.ts        # resource routes
      _portal.tsx                                             # requires session
      _portal.account.tsx  _portal.security.tsx  _portal.linked.tsx
      _portal.redeem.tsx   _portal.privacy.tsx  _portal.upgrade.tsx
    server/                 # never imported by client code (*.server.ts)
      ags.server.ts         # SDK setup per request with the session's token
      session.server.ts     # HttpOnly cookie session
      security.server.ts    # headers, origin check
    components/ui/          # design-system components
    styles/tokens.css
  react-router.config.ts
  vite.config.ts
  .env.example
  README.md                 # setup, AGS config, deploy, security notes
```

## 9. AGS setup a client needs (documented in README)

1. A namespace (studio + game) on AGS public cloud.
2. An IAM **public** client:
   - Redirect URI: `https://<host>/auth/callback`.
   - Player-level permissions for the features in use.
3. The studio's custom login website URL set to `https://<host>/login/` (with the trailing slash, see section 3), once that's available in prod. It enables the redirect flow. Until then, the sample uses its fallback.
4. Third-party platform credentials (Google, etc.) configured in the namespace for social login and linking, set up for **web login**, not the game-client setup. For Google, the Admin Portal's default in a game namespace is the game-client setup (Redirect URI `http://127.0.0.1`), which fails here with `redirect_uri_mismatch`. Instead:
   - In AGS, set the Google Redirect URI to `<IAM base URL>/iam/v3/platforms/google/authenticate`. IAM builds that address from its own base URL, which has no studio label (e.g. `https://internal.gamingservices.accelbyte.io/...`).
   - In Google Cloud Console, add that address under Authorized redirect URIs, plus `<IAM base URL>/iam/v3/public/namespaces/<namespace>/users/me/platforms/google/web/link/establish` and `.../web/reauth/establish` for linking. Keep any existing entries, such as `http://127.0.0.1`, so other apps on the same Google client still work.
   - One namespace stores one Redirect URI per platform, so a game-client Google sign-in that relies on `127.0.0.1` can't share the namespace. A web app that uses Google's ID-token sign-in (like type-so-fast) is unaffected, since that flow never uses the Redirect URI.
5. Optional, per feature: redeem code campaigns (Platform), GDPR configuration.

An AGS CLI script (or step-by-step commands) in `scripts/` sets up steps 2–4 where the CLI supports them.

## 10. Hosting and live demo

- **Clients:** one-click deploy instructions for at least two hosts (e.g. Vercel and a Node container), plus a generic `npm run build && npm start`.
- **AccelByte demo:** host still to be decided.
- **Dev environment:** internal env, studio namespace `bahlil` ("Evergrande Studio"), base URL `https://bahlil.internal.gamingservices.accelbyte.io`, AGS CLI profile `bahlil`. The portal runs at the studio level because it's the account home shared by every game (full accounts, cross-game linking, headless upgrade), and the custom login website URL is a studio setting. Moved from game namespace `bahlil-lahadalia` on 2026-11-24. Internal supports the custom login website URL, so the redirect flow is built and tested here.
- **Trap to avoid:** AGS public cloud runs on `*.gamingservices.accelbyte.io`. A demo on `*.accelbyte.io` is **same-site** with IAM, which can make cookie-based mistakes appear to work. Test the demo on a non-`accelbyte.io` domain too, at least in CI or staging.

## 11. Milestones

| # | Deliverable |
|---|---|
| M0 | Scaffold (React Router v8, Tailwind v4, tokens), env config, AGS TS SDK proven server-side, HttpOnly cookie session, security headers. **Done 2026-11-24.** |
| M1 | Sign in / sign out end to end (authorize → `/login` → callback → portal), refresh with lock. **Done.** |
| M2 | Registration with email verification, forgot/reset password. **Done 2026-11-25.** |
| M3 | Social login + account linking/unlinking (headless accounts can't unlink), headless account upgrade |
| M4 | Account management (profile, password, email) |
| M5 | Redeem code, GDPR deletion and data download |
| M6 | README, AGS setup script, deploy guides, security test pass, demo deployment, publish to GitHub |

**Next (2026-11-26):** make responses readable for developers trying the sample. React Router returns loader and action data from `.data` requests as turbo-stream (a flat array with references by index), which can't be switched to JSON and is hard to read in the network tab. Goal: plain JSON in the browser's network tab, with no React DevTools needed. Likely route: resource routes that return `Response.json(...)`, with the pages calling them. Check first how React Router 8 sends a resource route's response to `useFetcher` and forms (as is, or wrapped in turbo-stream). Approach to be agreed first.

## 12. Notes from M0

- IAM client `37ebc71cc6ef441983d474f81fa6e13a` (Public, no permissions) created in `bahlil` by `scripts/create-iam-client.sh` (replacing `0f1b91db4a614cc0875f9750621d9e12` in `bahlil-lahadalia`). Redirect URI `http://localhost:5173/auth/callback`. (A first, confidential client was deleted when the design moved to a public client.)
- IAM validates the client ID as a UUIDv4 without hyphens.
- `npm run check:ags` confirms `/oauth/authorize` with PKCE answers 302 with a `request_id`, read without following the redirect. That is the fallback flow in section 4. It currently redirects to the AccelByte login site, because the studio's custom login website URL isn't set yet (set it in M1).
- **Check in M1:** IAM's revoke endpoint asks for Basic auth from the client that issued the token; `clientAuth()` sends `clientId:` with an empty password.
- React Router 8 rejects document action requests whose `Origin` doesn't match the request URL (400) before middleware runs. That is the CSRF check.
- `@accelbyte/sdk` adds no interceptors by default, so a fresh instance per request with `setToken()` is clean.

## 13. Open questions

- Demo hosting: AccelByte AWS or a hosting service (team question).
- Google and other login platforms at the studio level, and a Legal Documents menu in the studio namespace (team question): see [TEAM-DISCUSSION.md](TEAM-DISCUSSION.md).
- Second social platform for v1 (Discord? Steam? Apple?).
- Portal theme: Dark (design-system default) or Light.
- Font and logo licensing for the public repo.
- License for the repo (MIT or Apache-2.0?).
- Whether the AGS CLI can set platform credentials, or the README needs Admin Portal steps. (It can create clients.)
