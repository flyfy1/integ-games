import { Room, createRoom, joinRoom, relayAvailable, type JoinFailure, type RoomEntry, type RoomSignal } from '../_shared/rooms';
import { botPlan } from './bot';
import type { Key } from './i18n';
import { createMatch, planFromString, planToString, resolveRound, type Plan, type State } from './sim';

/**
 * Shove Pond over the room relay. Everything that changes the match is in the room log, so every client folds the
 * same log into the same state:
 * - `{ t: 'start', id, seed, n, seats }` (a public message) starts match `id`; `seats[k]` is the room seat playing
 *   frog k, or -1 for a bot. A later joiner takes the lowest bot frog.
 * - Each round is relay round `id * 100 + round`. A client opens it when its reveal has finished (first opener wins
 *   the deadline), then seals `{ p: 'URB' }` on Ready. Seats without a frog seal `{ p: null }` so the relay never
 *   waits on them.
 * - On reveal, a frog whose seat sent no plan plays the deterministic Croaker bot plan on every client.
 * If the room disappears (backend restart, idle expiry) the shell finishes the match against bots.
 */
export type OnlineSeat = { name: string; kind: 'me' | 'remote' | 'bot' };
export type OnlineCallbacks = {
  t(key: Key, vars?: Record<string, string | number>): string;
  name(): string;
  onState(): void;
  onStart(state: State, seats: OnlineSeat[], me: number): void;
  /** A late joiner took over a bot frog: new names and kinds. */
  onSeats(seats: OnlineSeat[]): void;
  onOpen(secondsLeft: number): void;
  onReveal(plans: Plan[]): void;
  onReady(frogs: Set<number>): void;
  onPresence(awayFrogs: Set<number>): void;
  onEmote(frog: number, emote: number): void;
  onGone(): void;
  onLobby(): void;
  isBusy(): boolean;
  currentState(): State | null;
};
type Match = { id: number; seed: number; seats: number[]; state: State; opened: number; openAt: number; openMs: number };

const FIRST_MS = 15000, PLAN_MS = 8000;

export function createOnline(cb: OnlineCallbacks) {
  let room: Room | null = null;
  let relay: 'checking' | 'up' | 'down' = 'checking';
  let match: Match | null = null;
  const names = new Map<number, string>();
  let unsub: (() => void) | null = null;
  let sealedFor = new Set<number>();

  const rid = (m: Match) => m.id * 100 + m.state.round;
  const frogOfSeat = (seat: number) => (match ? match.seats.indexOf(seat) : -1);

  function fold(e: RoomEntry, live: boolean) {
    if (e.kind === 'join') {
      names.set(e.seat, typeof e.name === 'string' && e.name ? e.name.slice(0, 14) : `Frog ${e.seat + 1}`);
      if (match && !match.state.over && frogOfSeat(e.seat) < 0) {
        const free = match.seats.indexOf(-1);
        if (free >= 0) match.seats[free] = e.seat;
        if (live && free >= 0) cb.onSeats(seatsView());
      }
      if (live) { if (!match || match.state.over) cb.onLobby(); cb.onState(); }
      return;
    }
    if (e.kind === 'msg') {
      const b = e.body as { t?: string; id?: number; seed?: number; n?: number; seats?: number[] } | null;
      if (b?.t !== 'start' || typeof b.id !== 'number' || typeof b.seed !== 'number' || !Array.isArray(b.seats)) return;
      if (match && b.id <= match.id) return;
      const n = Math.max(2, Math.min(6, b.seats.length));
      match = { id: b.id, seed: b.seed >>> 0, seats: b.seats.slice(0, n).map(s => (Number.isInteger(s) ? s : -1)), state: createMatch(b.seed >>> 0, n), opened: 0, openAt: 0, openMs: 0 };
      sealedFor = new Set();
      if (live) { announceStart(); void room?.open(rid(match), FIRST_MS); }
      return;
    }
    if (!match) return;
    if (e.kind === 'open' && e.round === rid(match)) {
      match.opened = e.round; match.openAt = e.at; match.openMs = Number(e.ms) || PLAN_MS;
      sealedFor = new Set();
      if (live) openNow();
      return;
    }
    if (e.kind === 'reveal' && e.round === rid(match)) {
      const before = match.state;
      const plans: Plan[] = before.frogs.map((_, k) => {
        const seat = match!.seats[k];
        const body = seat >= 0 ? (e.plans?.[String(seat)] as { p?: unknown } | undefined) : undefined;
        return planFromString(body?.p) ?? botPlan(before, k, 2);
      });
      match.state = resolveRound(before, plans).state;
      match.opened = 0;
      sealedFor = new Set();
      if (live) cb.onReveal(plans);
    }
  }

  function seatsView(): OnlineSeat[] {
    if (!match || !room) return [];
    return match.seats.map((seat, k) => ({
      name: seat < 0 ? `${['Lily', 'Moss', 'Pip', 'Reed', 'Plum', 'Dot'][k]} 🤖` : (names.get(seat) ?? `Frog ${seat + 1}`),
      kind: seat < 0 ? 'bot' : seat === room!.seat ? 'me' : 'remote'
    }));
  }
  function announceStart() {
    if (!match || !room) return;
    cb.onStart(match.state, seatsView(), frogOfSeat(room.seat));
    presence();
  }
  function openNow() {
    if (!match || !room) return;
    const left = Math.max(0.5, (match.openAt + match.openMs - room.serverNow()) / 1000);
    cb.onOpen(left);
    if (frogOfSeat(room.seat) < 0) void room.seal(match.opened, { p: null });
  }
  function presence() {
    if (!match || !room) return;
    const away = new Set<number>();
    match.seats.forEach((seat, k) => { if (seat >= 0 && !room!.online.has(seat)) away.add(k); });
    cb.onPresence(away);
  }
  function signal(s: RoomSignal) {
    if (s.kind === 'hello' || s.kind === 'presence') { presence(); if (!match || match.state.over) cb.onLobby(); return; }
    if (s.kind === 'sealed' && match && s.round === match.opened) {
      const k = frogOfSeat(s.seat); if (k >= 0) { sealedFor.add(k); cb.onReady(new Set(sealedFor)); }
      return;
    }
    if (s.kind === 'emote') { const k = frogOfSeat(s.seat); const e = (s.body as { e?: number } | null)?.e; if (k >= 0 && typeof e === 'number') cb.onEmote(k, e); }
  }

  function attach(r: Room) {
    leave();
    room = r;
    match = null; names.clear();
    for (const e of r.log) fold(e, false);
    unsub = r.on({ entry: fold, signal, status: (st) => { if (st === 'gone') { const had = !!match && !match.state.over; leave(); if (had) cb.onGone(); else cb.onLobby(); } cb.onState(); } });
    try { history.replaceState(history.state, '', `${location.pathname}?room=${r.code}`); } catch { /* not in a browser */ }
    r.connect();
    const m = match as Match | null;
    if (m && !m.state.over) {
      announceStart();
      if (m.opened === rid(m)) openNow();
      else void r.open(rid(m), m.state.round === 1 ? FIRST_MS : PLAN_MS);
    } else cb.onLobby();
  }

  function leave() {
    unsub?.(); unsub = null;
    room?.close(); room = null;
    match = null;
  }

  const link = {
    get code() { return room?.code ?? ''; },
    get seat() { return room?.seat ?? -1; },
    get inMatch() { return !!match && !match.state.over; },
    /** True when this client controls a frog in the running match. */
    get playing() { return !!match && !!room && frogOfSeat(room.seat) >= 0; },
    /** The lowest connected seat runs the lobby's Start button (seat 0 until anyone is connected). */
    get hostSeat() { const online = room ? [...room.online].sort((a, b) => a - b) : []; return online[0] ?? 0; },
    get isHost() { return !!room && link.hostSeat === room.seat; },
    relayState: () => relay,
    async checkRelay() { relay = (await relayAvailable()) ? 'up' : 'down'; cb.onState(); },
    async create(): Promise<boolean> {
      if (!(await relayAvailable())) { relay = 'down'; return false; }
      const r = await createRoom(cb.name());
      if (typeof r === 'string') return false;
      attach(r); return true;
    },
    async join(code: string): Promise<'ok' | JoinFailure> {
      // The probe answers within 2.5 s even when the backend hangs, so a dead relay is reported quickly.
      if (!(await relayAvailable())) { relay = 'down'; cb.onState(); return 'down'; }
      const r = await joinRoom(code, cb.name());
      if (typeof r === 'string') return r;
      attach(r); return 'ok';
    },
    leave,
    roster(): { seat: number; name: string; online: boolean }[] {
      return [...names.entries()].sort((a, b) => a[0] - b[0]).map(([seat, name]) => ({ seat, name, online: !!room?.online.has(seat) }));
    },
    shareUrl(): string { return room ? `${location.origin}${location.pathname}?room=${room.code}` : location.href; },
    start() {
      if (!room) return;
      const seats = [...names.keys()].sort((a, b) => a - b).filter(s => room!.online.has(s) || s === room!.seat).slice(0, 6);
      while (seats.length < 4) seats.push(-1);
      const seed = (Math.floor(Math.random() * 2 ** 31) ^ Date.now()) >>> 0;
      void room.send({ t: 'start', id: (match?.id ?? 0) + 1, seed, n: seats.length, seats });
    },
    rematch() { link.start(); },
    seal(plan: Plan | null) {
      if (!room || !match || !match.opened) return;
      void room.seal(match.opened, { p: plan ? planToString(plan) : null });
    },
    emote(e: number) { void room?.emote({ e }); },
    /** The shell finished animating a reveal: open the next round. */
    roundDone() {
      if (!room || !match || match.state.over) return;
      if (match.opened === rid(match)) { openNow(); return; }
      void room.open(rid(match), PLAN_MS);
    }
  };
  return link;
}
export type OnlineLink = ReturnType<typeof createOnline>;
