# Integ Games backend

Small Go + SQLite service for Integ Auth login, authenticated best scores, and the public overall leaderboard.

## Configuration

- `GAMES_ADDR` (default `127.0.0.1:8104`)
- `GAMES_DB_PATH` (default `games.db`)
- `GAMES_FRONTEND_URI` (default `https://games.integ.life/`)
- `INTEG_AUTH_ISSUER` (default `https://auth.integ.life`)
- `INTEG_AUTH_CLIENT_ID`
- `INTEG_AUTH_CLIENT_SECRET`
- `INTEG_AUTH_REDIRECT_URI` (production: `https://games-api.integ.life/api/auth/integ/callback`)

The production Auth client must use the exact callback above. The API allows browser requests only from `https://games.integ.life`.

## Local verification

```sh
go test ./...
GAMES_ADDR=127.0.0.1:8104 GAMES_DB_PATH=/tmp/integ-games.db go run .
```
