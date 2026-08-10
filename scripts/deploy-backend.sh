#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target="${1:-integ-prod}"
build_file="${TMPDIR:-/tmp}/integ-games-linux-amd64"

cd "$repo_dir/backend"
go test ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags="-s -w" -o "$build_file" .

scp "$build_file" "$target:/tmp/integ-games"
scp "$repo_dir/deploy/integ-games.service" "$target:/tmp/integ-games.service"
scp "$repo_dir/deploy/games.integ.life.caddy" "$target:/tmp/integ-games.caddy"

ssh "$target" '
  set -eu
  sudo test -s /etc/integ-games.env
  id integ-games >/dev/null 2>&1 || sudo useradd --system --home /var/lib/integ-games --shell /usr/sbin/nologin integ-games
  sudo install -d -m 0755 -o root -g root /opt/integ-games
  sudo install -d -m 0750 -o integ-games -g integ-games /var/lib/integ-games
  sudo install -m 0755 -o root -g root /tmp/integ-games /opt/integ-games/integ-games
  sudo install -m 0644 -o root -g root /tmp/integ-games.service /etc/systemd/system/integ-games.service
  sudo install -m 0644 -o root -g root /tmp/integ-games.caddy /etc/caddy/sites-enabled/integ-games.caddy
  sudo systemctl daemon-reload
  sudo systemctl enable integ-games.service
  sudo systemctl restart integ-games.service
  sudo caddy validate --config /etc/caddy/Caddyfile
  sudo systemctl reload caddy
  curl -fsS http://127.0.0.1:8104/api/health
'
