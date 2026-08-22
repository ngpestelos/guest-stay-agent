#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

if ! npx wrangler whoami 2>/dev/null | grep -qE 'Account|email|@'; then
  if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "Not authenticated. npx wrangler login  or  export CLOUDFLARE_API_TOKEN=..."
    exit 1
  fi
fi

echo "==> Tests"
node scripts/run-guest-tests.mjs
node scripts/run-guest-propose-tests.mjs

echo "==> Dry-run"
npx wrangler deploy --dry-run --outdir /tmp/guest-stay-agent-dry-run

echo "==> Deploy"
npx wrangler deploy

echo "https://guest-agent-demo.ngpcloud.org/"
echo "Secret (once): npx wrangler secret put NOUS_API_KEY"
