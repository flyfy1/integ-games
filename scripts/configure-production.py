#!/usr/bin/env python3
"""Configure the Games OAuth client and service env without printing secrets."""

import json
import os
import re
import secrets
import shlex
from pathlib import Path

AUTH_ENV = Path("/etc/integ-auth.env")
GAMES_ENV = Path("/etc/integ-games.env")
CALLBACK = "https://games-api.integ.life/api/auth/integ/callback"


def env_value(text: str, key: str) -> str:
    match = re.search(rf"(?m)^{re.escape(key)}=(.*)$", text)
    if not match:
        raise RuntimeError(f"missing {key}")
    return shlex.split(match.group(1), posix=True)[0]


def replace_env(text: str, key: str, value: str) -> str:
    line = f"{key}={shlex.quote(value)}"
    pattern = rf"(?m)^{re.escape(key)}=.*$"
    if re.search(pattern, text):
        return re.sub(pattern, line, text)
    return text.rstrip() + "\n" + line + "\n"


auth_text = AUTH_ENV.read_text()
clients = json.loads(env_value(auth_text, "INTEG_AUTH_CLIENTS"))
existing = next((client for client in clients if client.get("id") == "games"), None)
secret = existing.get("secret") if existing else secrets.token_urlsafe(48)
entry = {"id": "games", "redirect_uri": CALLBACK, "secret": secret}
clients = [client for client in clients if client.get("id") != "games"] + [entry]
AUTH_ENV.write_text(replace_env(auth_text, "INTEG_AUTH_CLIENTS", json.dumps(clients, separators=(",", ":"))))
os.chmod(AUTH_ENV, 0o600)

games = {
    "GAMES_ADDR": "127.0.0.1:8104",
    "GAMES_DB_PATH": "/var/lib/integ-games/games.db",
    "GAMES_FRONTEND_URI": "https://games.integ.life/",
    "INTEG_AUTH_ISSUER": "https://auth.integ.life",
    "INTEG_AUTH_CLIENT_ID": "games",
    "INTEG_AUTH_CLIENT_SECRET": secret,
    "INTEG_AUTH_REDIRECT_URI": CALLBACK,
}
GAMES_ENV.write_text("".join(f"{key}={shlex.quote(value)}\n" for key, value in games.items()))
os.chmod(GAMES_ENV, 0o600)
print("configured games auth client and service environment")
