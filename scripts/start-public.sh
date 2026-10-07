#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Puts the app on the internet for free, from this computer, through a
# Cloudflare quick tunnel (https://<random>.trycloudflare.com).
#
#   ./scripts/start-public.sh            # build + start everything, print the URLs
#   ./scripts/start-public.sh --no-build # start without rebuilding
#
# What runs:  backend (NODE_ENV=production, :3001)  ←  vite preview of the
# built frontend (:4173, proxies /api)  ←  cloudflared ×3  ←  the internet.
# Three tunnels give three separate addresses — one to hand to the admin
# staff, one to teachers, one to students. They all reach the same app; after
# signing in, each person lands in their own cabinet (admin panel, ustoz
# kabineti, o'quvchi kabineti), so a link never grants more than the login does.
# Ctrl+C stops everything. The sites are only up while this computer and this
# script are running, and the URLs change every time the tunnels restart.
# Needs: Docker (Postgres/Redis), Node, cloudflared in PATH, backend/.env with
# strong JWT_ACCESS_SECRET and CREDENTIALS_ENCRYPTION_KEY.
# -----------------------------------------------------------------------------
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGS="$ROOT/.public-logs"
mkdir -p "$LOGS"

command -v cloudflared >/dev/null || { echo "cloudflared topilmadi — https://github.com/cloudflare/cloudflared/releases"; exit 1; }
for port in 3001 4173; do
  if ss -ltn | grep -q ":$port "; then echo "Port $port band — avval uni ishlatayotgan dasturni to'xtating."; exit 1; fi
done

pids=()
cleanup() {
  echo; echo "To'xtatilmoqda..."
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

echo "1/4 Postgres va Redis..."
docker compose -f "$ROOT/docker-compose.yml" up -d >/dev/null

if [[ "${1:-}" != "--no-build" ]]; then
  echo "2/4 Build (backend + frontend)..."
  (cd "$ROOT/backend" && npm run build >"$LOGS/backend-build.log" 2>&1)
  (cd "$ROOT/frontend" && npm run build >"$LOGS/frontend-build.log" 2>&1)
else
  echo "2/4 Build o'tkazib yuborildi"
fi

echo "3/4 Backend va frontend ishga tushirilmoqda..."
# TRUST_PROXY=1: the only hop the backend trusts is vite preview, so req.ip is
# the visitor's real IP from Cloudflare's X-Forwarded-For (login rate limits stay per-visitor).
(cd "$ROOT/backend" && NODE_ENV=production TRUST_PROXY=1 exec node dist/main.js >"$LOGS/backend.log" 2>&1) &
pids+=($!)
for _ in $(seq 1 60); do curl -fsS http://localhost:3001/api/v1/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://localhost:3001/api/v1/health >/dev/null || { echo "Backend ishga tushmadi — $LOGS/backend.log ni ko'ring"; exit 1; }

(cd "$ROOT/frontend" && exec npx vite preview >"$LOGS/frontend.log" 2>&1) &
pids+=($!)

echo "4/4 Cloudflare tunnellari ochilmoqda (admin, ustoz, o'quvchi)..."
names=(admin ustoz oquvchi)
labels=("Admin paneli     " "Ustozlar sayti   " "O'quvchilar sayti")
for name in "${names[@]}"; do
  cloudflared tunnel --no-autoupdate --url http://localhost:4173 >"$LOGS/tunnel-$name.log" 2>&1 &
  pids+=($!)
done
urls=()
for name in "${names[@]}"; do
  url=""
  for _ in $(seq 1 60); do
    url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel-$name.log" | head -1 || true)"
    [[ -n "$url" ]] && break
    sleep 1
  done
  [[ -n "$url" ]] || { echo "Tunnel manzili olinmadi — $LOGS/tunnel-$name.log ni ko'ring"; exit 1; }
  urls+=("$url")
done

echo
for i in "${!names[@]}"; do echo "  ${labels[$i]}:  ${urls[$i]}"; done
printf '%s\n' "${urls[@]}" >"$LOGS/urls.txt"
echo "  (To'xtatish uchun Ctrl+C)"
echo
wait
