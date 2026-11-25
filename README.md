# Player Portal Sample

A sample website for AccelByte Gaming Services (AGS) public cloud: a Login
Website and a Player Portal, built with React Router (framework mode) as a
backend-for-frontend. Every AGS call runs on the server. The player's tokens
live in an HttpOnly cookie, so page scripts never see them. There is no
database, no Redis and no secret to configure.

> Work in progress. See [PLAN.md](PLAN.md) for scope and milestones.

## Quick start

Requirements: Node 22.22 or later.

1. Install dependencies: `npm install`
2. Create the IAM client and `.env`. With the
   [AGS CLI](https://github.com/AccelByte/ags-cli) signed in (`ags auth login`)
   as an admin of your namespace:

   ```sh
   scripts/create-iam-client.sh <your-game-namespace> http://localhost:5173
   ```

   Or create a **Public** client in the Admin Portal with redirect URI
   `http://localhost:5173/auth/callback`, then copy `.env.example` to `.env`
   and fill it in.
3. Check the setup: `npm run check:ags`
4. Run it: `npm run dev`, then open http://localhost:5173

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm start` | Serve the production build (reads `.env` if present) |
| `npm run typecheck` | Generate route types and run TypeScript |
| `npm test` | Unit tests |
| `npm run check:ags` | Check IAM is reachable and accepts the client and redirect URI |
| `npm run format` | Format with oxfmt |

## Not covered

This sample shows a few common flows, not every AGS feature. If your namespace
turns these on, add them yourself:

- **Two-factor authentication.** Players with 2FA on see "This account uses
  two-factor authentication, which this sample does not support."
- **Login queue.** When the queue is active, sign-in shows "Too many players are
  signing in right now."
- **Legal documents.** Registration doesn't ask players to accept terms or a
  privacy policy.

## Security notes

- The IAM client is Public: there is no AGS secret. Sign-in runs on the server
  with PKCE. Give the client player-level permissions only, never admin ones.
- Tokens are in an HttpOnly cookie, sent only to this app. The server never
  trusts the cookie's contents for anything AGS doesn't check itself.
