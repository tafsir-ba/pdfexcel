#!/usr/bin/env bash
# Deploy FormBatch with a short restart window: build while the old process still serves traffic.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building (current PM2 process keeps serving)"
pnpm run build

echo "==> Reloading PM2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload ecosystem.config.cjs --update-env
  pm2 save
else
  echo "pm2 not found; start the app manually with: pnpm start"
fi

echo "==> Health check"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:${PORT:-3010}/api/health" >/dev/null 2>&1; then
    echo "Healthy on attempt $i"
    exit 0
  fi
  sleep 1
done
echo "WARNING: health check did not pass within 10s" >&2
exit 1
