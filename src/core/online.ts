export type Player = { id: number; name: string };
export type LeaderboardEntry = { name: string; score: number; games: number };

const tokenKey = 'integ-games:session';
const apiBase = import.meta.env.VITE_GAMES_API || (['localhost', '127.0.0.1'].includes(location.hostname) ? 'http://127.0.0.1:8104' : 'https://games-api.integ.life');
let player: Player | undefined;

export function consumeLoginResult(): string | undefined {
  const values = new URLSearchParams(location.hash.startsWith('#/?') ? location.hash.slice(3) : '');
  const token = values.get('games_token');
  const error = values.get('auth_error') ?? undefined;
  if (token) localStorage.setItem(tokenKey, token);
  if (token || error) history.replaceState({}, '', `${location.pathname}${location.search}`);
  return error;
}

function token(): string | null { return localStorage.getItem(tokenKey); }
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const session = token();
  if (session) headers.set('Authorization', `Bearer ${session}`);
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (response.status === 401) { localStorage.removeItem(tokenKey); player = undefined; }
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

export async function loadPlayer(): Promise<Player | undefined> {
  if (!token()) return undefined;
  try { player = await api<Player>('/api/me'); } catch { player = undefined; }
  return player;
}
export function currentPlayer(): Player | undefined { return player; }
export function login(): void { location.assign(`${apiBase}/api/auth/integ/start`); }
export async function logout(): Promise<void> { try { await api('/api/logout', { method: 'POST' }); } finally { localStorage.removeItem(tokenKey); player = undefined; } }
export async function submitScore(game: string, score: number): Promise<void> {
  if (!token() || !Number.isFinite(score) || score < 0) return;
  try { await api('/api/scores', { method: 'POST', body: JSON.stringify({ game, score: Math.round(score) }) }); } catch { /* local score remains available offline */ }
}
export async function leaderboard(): Promise<LeaderboardEntry[]> { try { return await api('/api/leaderboard'); } catch { return []; } }
