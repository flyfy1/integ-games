import { apiBase } from '../../core/online';

/**
 * Client kit for the backend's generic room relay (backend/rooms.go): guests create or join a room by a 4-letter
 * code, every message lands in one ordered log, and "sealed" messages for a round stay hidden on the server until
 * every connected seat has sent one or the round's deadline passes; then they are revealed together in one entry.
 * The relay knows no game rules: each client runs the same deterministic sim from the log.
 *
 * Transport: POST for writes, Server-Sent Events for the log. The stream resumes from the last entry id (the
 * `after` query parameter, and Last-Event-ID on the browser's own reconnects). The stream is closed while the tab
 * is hidden, so the relay stops waiting for this seat (games let a bot play it) and reopens on return.
 * If the relay is missing (old backend, offline), `relayAvailable` answers false within the timeout and games keep
 * their offline modes.
 */
export type RoomEntry = {
  id: number;
  kind: 'join' | 'msg' | 'open' | 'reveal';
  seat: number;
  /** Server time in ms. */
  at: number;
  name?: string;
  body?: unknown;
  round?: number;
  ms?: number;
  /** For `reveal`: seat number (as a string key) -> that seat's sealed body. */
  plans?: Record<string, unknown>;
};
export type RoomSignal =
  | { kind: 'hello'; now: number; online: number[] }
  | { kind: 'presence'; online: number[] }
  | { kind: 'sealed'; seat: number; round: number }
  | { kind: 'emote'; seat: number; body: unknown };
export type RoomStatus = 'connecting' | 'live' | 'away' | 'reconnecting' | 'gone';
export type JoinFailure = 'full' | 'missing' | 'down' | 'limit';
export type RoomListener = {
  entry?(entry: RoomEntry, live: boolean): void;
  signal?(signal: RoomSignal): void;
  status?(status: RoomStatus): void;
};

const RELAY_TAG = 'rooms/v1';
const tokenKey = (code: string) => `integ-games:room:${code}`;

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 4000): Promise<{ status: number; data: T | null }> {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiBase}${path}`, {
      method, signal: controller?.signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data: T | null = null;
    try { data = await res.json() as T; } catch { data = null; }
    return { status: res.status, data };
  } finally { clearTimeout(timer); }
}

let probe: Promise<boolean> | null = null;
/** True when the backend serves the room relay. Cached per page; answers within `timeoutMs` either way. */
export function relayAvailable(timeoutMs = 2500, fresh = false): Promise<boolean> {
  if (probe && !fresh) return probe;
  probe = call<{ relay?: string }>('GET', '/api/rooms', undefined, timeoutMs)
    .then(r => r.status === 200 && r.data?.relay === RELAY_TAG)
    .catch(() => false);
  void probe.then(ok => { if (!ok) setTimeout(() => { probe = null; }, 15000); });
  return probe;
}

type JoinReply = { code: string; seat: number; token: string; now: number; log: RoomEntry[] };
function failure(status: number): JoinFailure { return status === 404 ? 'missing' : status === 409 ? 'full' : status === 429 ? 'limit' : 'down'; }

export async function createRoom(name: string): Promise<Room | JoinFailure> {
  try {
    const r = await call<JoinReply>('POST', '/api/rooms', { name });
    if (r.status !== 200 || !r.data) return failure(r.status);
    return new Room(r.data);
  } catch { return 'down'; }
}

export async function joinRoom(code: string, name: string): Promise<Room | JoinFailure> {
  const upper = code.toUpperCase();
  let token: string | undefined;
  try { token = (JSON.parse(localStorage.getItem(tokenKey(upper)) ?? 'null') as { token?: string } | null)?.token; } catch { token = undefined; }
  try {
    const r = await call<JoinReply>('POST', `/api/rooms/${upper}/join`, { name, token });
    if (r.status !== 200 || !r.data) return failure(r.status);
    return new Room(r.data);
  } catch { return 'down'; }
}

export class Room {
  readonly code: string;
  readonly seat: number;
  readonly token: string;
  readonly log: RoomEntry[];
  online = new Set<number>();
  status: RoomStatus = 'connecting';
  /** serverTime - Date.now(), in ms. */
  offset: number;
  private es: EventSource | null = null;
  private listeners: RoomListener[] = [];
  private closed = false;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisibility = () => {
    if (this.closed) return;
    if (document.visibilityState === 'hidden') { this.dropStream(); this.setStatus('away'); }
    else this.connect();
  };

  constructor(reply: JoinReply) {
    this.code = reply.code; this.seat = reply.seat; this.token = reply.token;
    this.log = Array.isArray(reply.log) ? reply.log.slice() : [];
    this.offset = (Number(reply.now) || Date.now()) - Date.now();
    try { localStorage.setItem(tokenKey(this.code), JSON.stringify({ seat: this.seat, token: this.token, at: Date.now() })); } catch { /* storage is optional */ }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this.onVisibility);
  }

  get lastId(): number { return this.log.length ? this.log[this.log.length - 1].id : 0; }
  serverNow(): number { return Date.now() + this.offset; }
  on(listener: RoomListener): () => void { this.listeners.push(listener); return () => { this.listeners = this.listeners.filter(l => l !== listener); }; }

  connect(): void {
    if (this.closed || this.es || typeof EventSource === 'undefined') return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { this.setStatus('away'); return; }
    const q = new URLSearchParams({ seat: String(this.seat), token: this.token, after: String(this.lastId) });
    const es = new EventSource(`${apiBase}/api/rooms/${this.code}/events?${q}`);
    this.es = es;
    if (this.status !== 'live') this.setStatus(this.status === 'connecting' ? 'connecting' : 'reconnecting');
    es.onopen = () => { if (this.es === es) this.setStatus('live'); };
    es.onmessage = (ev) => { if (this.es === es) this.receive(ev.data); };
    es.onerror = () => {
      if (this.es !== es) return;
      this.setStatus('reconnecting');
      // EventSource retries by itself, but cannot see status codes: ask whether the room still exists.
      void this.check().then(alive => {
        if (this.es !== es) return;
        if (!alive) { this.dropStream(); this.setStatus('gone'); return; }
        if (es.readyState === EventSource.CLOSED) { this.dropStream(); this.retry = setTimeout(() => this.connect(), 1500); }
      });
    };
  }

  /** Whether the room still exists on the relay (false after a backend restart or idle expiry). */
  async check(): Promise<boolean> {
    try { const r = await call('GET', `/api/rooms/${this.code}`, undefined, 3000); return r.status !== 404; } catch { return true; }
  }

  private receive(raw: string) {
    let data: (RoomEntry | RoomSignal) & { id?: number };
    try { data = JSON.parse(raw); } catch { return; }
    if (typeof data.id === 'number') {
      const entry = data as RoomEntry;
      if (entry.id <= this.lastId) return;
      this.log.push(entry);
      for (const l of this.listeners) l.entry?.(entry, true);
      return;
    }
    const sig = data as RoomSignal;
    if (sig.kind === 'hello') { this.offset = sig.now - Date.now(); this.online = new Set(sig.online); }
    if (sig.kind === 'presence') this.online = new Set(sig.online);
    for (const l of this.listeners) l.signal?.(sig);
  }

  private setStatus(s: RoomStatus) {
    if (this.status === s || this.status === 'gone') return;
    this.status = s;
    for (const l of this.listeners) l.status?.(s);
  }

  private dropStream() { if (this.retry) { clearTimeout(this.retry); this.retry = null; } this.es?.close(); this.es = null; }

  private async post(payload: Record<string, unknown>): Promise<boolean> {
    if (this.closed) return false;
    try {
      const r = await call('POST', `/api/rooms/${this.code}/msg`, { seat: this.seat, token: this.token, ...payload });
      if (r.status === 404) { this.dropStream(); this.setStatus('gone'); }
      return r.status >= 200 && r.status < 300;
    } catch { return false; }
  }
  /** Append a public message to the log. */
  send(body: unknown) { return this.post({ kind: 'msg', body }); }
  /** Seal this seat's body for `round` (a resend replaces it until the reveal). */
  seal(round: number, body: unknown) { return this.post({ kind: 'seal', round, body }); }
  /** Open `round` with a deadline `ms` from now; the first opener wins, later calls are no-ops. */
  open(round: number, ms: number) { return this.post({ kind: 'open', round, ms }); }
  /** A fire-and-forget signal (not logged). */
  emote(body: unknown) { return this.post({ kind: 'emote', body }); }

  close(): void {
    this.closed = true;
    this.dropStream();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    this.listeners = [];
  }
}
