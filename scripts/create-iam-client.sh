#!/usr/bin/env bash
# Create the IAM client this sample signs players in with, and write .env.
#
# The client is Public (no client secret): the app's server runs the OAuth
# flow with PKCE and keeps the tokens, so no AGS secret is needed anywhere.
#
# Needs the AGS CLI (https://github.com/AccelByte/ags-cli), signed in with
# `ags auth login` as an admin who may create clients in the namespace. Uses
# the active CLI profile (`ags profile list`).
#
# Usage: scripts/create-iam-client.sh <namespace> <app-url>
#   scripts/create-iam-client.sh my-game http://localhost:5173
set -euo pipefail

NAMESPACE="${1:?namespace required}"
APP_URL="${2:?app URL required, e.g. http://localhost:5173}"
APP_URL="${APP_URL%/}"
ENV_FILE="${ENV_FILE:-.env}"

if [[ -e "$ENV_FILE" ]] && grep -q '^AGS_CLIENT_ID=.\+' "$ENV_FILE"; then
  echo "$ENV_FILE already has AGS_CLIENT_ID. Remove that line first to create a new client." >&2
  exit 1
fi

# IAM wants a UUIDv4 without hyphens as the client ID.
client_id="$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
base_url="$(ags --format json auth status 2>/dev/null | python3 -c 'import json,sys; print(json.load(sys.stdin).get("base_url",""))' || true)"

python3 - "$client_id" "$NAMESPACE" "$APP_URL" <<'PY' | ags --quiet --yes iam clients create --namespace "$NAMESPACE" --json @- >/dev/null
import json, sys
client_id, namespace, app_url = sys.argv[1:4]
print(json.dumps({
    "clientId": client_id,
    "clientName": "Player Portal Sample",
    "description": "Public client for the player portal sample. Sign-in runs on the app server with PKCE.",
    "namespace": namespace,
    "oauthClientType": "Public",
    "secret": "",
    "redirectUri": f"{app_url}/auth/callback",
    "baseUri": app_url,
    "audiences": [],
    "clientPlatform": "",
    "skipLoginQueue": False,
    "clientPermissions": [],
}))
PY

umask 077
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
{
  grep -v -E '^(APP_URL|AGS_BASE_URL|AGS_NAMESPACE|AGS_CLIENT_ID)=' "$ENV_FILE" || true
  echo "APP_URL=$APP_URL"
  [[ -n "$base_url" ]] && echo "AGS_BASE_URL=$base_url"
  echo "AGS_NAMESPACE=$NAMESPACE"
  echo "AGS_CLIENT_ID=$client_id"
} > "$ENV_FILE.tmp"
mv "$ENV_FILE.tmp" "$ENV_FILE"

echo "Created public IAM client $client_id in $NAMESPACE."
echo "Redirect URI: $APP_URL/auth/callback"
echo "Settings written to $ENV_FILE."
