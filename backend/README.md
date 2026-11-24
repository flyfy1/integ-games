# Integ Games backend

Small Go + SQLite service for Integ Auth login, authenticated best scores, the public overall leaderboard, and a generic in-memory room relay for online party games (Shove Pond).

## Configuration

- `GAMES_ADDR` (default `127.0.0.1:8104`)
- `GAMES_DB_PATH` (default `games.db`)
- `GAMES_FRONTEND_URI` (default `https://games.integ.life/`)
- `INTEG_AUTH_ISSUER` (default `https://auth.integ.life`)
- `INTEG_AUTH_CLIENT_ID`
- `INTEG_AUTH_CLIENT_SECRET`
- `INTEG_AUTH_REDIRECT_URI` (production: `https://games-api.integ.life/api/auth/integ/callback`)
- `GAMES_EXTRA_ORIGINS` (optional, comma separated): extra browser origins for local development, e.g. `http://127.0.0.1:5231`

The production Auth client must use the exact callback above. The API allows browser requests only from `https://games.integ.life`.

## Local verification

```sh
go test ./...
GAMES_ADDR=127.0.0.1:8104 GAMES_DB_PATH=/tmp/integ-games.db go run .
```

## Room relay (`rooms.go`)

Guest rooms for online party games; no account needed and nothing is written to SQLite.

- `GET /api/rooms` → `{"relay":"rooms/v1"}`: the client's availability probe (an older binary answers 404).
- `POST /api/rooms` `{name}` → `{code, seat, token, now, log}`; `POST /api/rooms/{code}/join` `{name, token?}` (a known token returns the same seat).
- `GET /api/rooms/{code}/events?seat=&token=&after=` is the SSE stream: the log after `after` / `Last-Event-ID`, then live entries, a heartbeat every 20 s, and unlogged signals (`hello`, `presence`, `sealed`, `emote`).
- `POST /api/rooms/{code}/msg` `{seat, token, kind, body, round, ms}` with `kind` `msg` (logged), `open` (start a sealed round with a deadline; first opener wins), `seal` (held until every connected seat has sealed that round or the deadline passes, then revealed in one `reveal` entry), `emote` (not logged).
- Caps: 8 seats, 2 KB bodies, 20 messages/s per seat, 200 rooms, 12 new rooms per IP per 10 min (`CF-Connecting-IP`), 5,000 log entries; rooms idle for 10 min are dropped. Rooms live in memory, so a restart ends them and clients finish against bots.
