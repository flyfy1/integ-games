package main

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Generic room relay for online party games. Guests create or join a room by a 4-letter code and get a seat and
// a random token. Every message lands in one ordered, in-memory log that clients read over Server-Sent Events.
// A "sealed" message for round N is held back until every connected seat has sealed N or N's deadline passes;
// then all sealed bodies are revealed together as one log entry. The relay knows no game rules. Rooms live in
// memory only: a restart drops them and clients finish against bots.

const (
	roomMaxSeats      = 8
	roomMaxBody       = 2048
	roomMaxRequest    = 4096
	roomRatePerSecond = 20
	roomMaxRooms      = 200
	roomIdle          = 10 * time.Minute
	roomMaxLog        = 5000
	roomMaxDeadline   = 30 * time.Second
	roomDefaultMS     = 15000
	roomHeartbeat     = 20 * time.Second
	roomCreatePerIP   = 12
	roomCreateWindow  = 10 * time.Minute
	roomCodeLetters   = "ABCDEFGHJKLMNPQRSTUVWXYZ"
)

type roomEntry struct {
	ID    int                        `json:"id"`
	Kind  string                     `json:"kind"`
	Seat  int                        `json:"seat"`
	At    int64                      `json:"at"`
	Name  string                     `json:"name,omitempty"`
	Body  json.RawMessage            `json:"body,omitempty"`
	Round *int                       `json:"round,omitempty"`
	MS    int                        `json:"ms,omitempty"`
	Plans map[string]json.RawMessage `json:"plans,omitempty"`
}

type roomSeat struct {
	token string
	name  string
	conns int
	sent  []time.Time
}

type sealRound struct {
	deadline time.Time
	plans    map[int]json.RawMessage
	timer    *time.Timer
}

type roomSub struct {
	seat int
	ch   chan []byte
}

type room struct {
	code     string
	seats    []*roomSeat
	log      []roomEntry
	open     map[int]*sealRound
	revealed map[int]bool
	subs     map[int]*roomSub
	nextSub  int
	active   time.Time
}

type roomHub struct {
	mu      sync.Mutex
	rooms   map[string]*room
	created map[string][]time.Time
	now     func() time.Time
	beat    time.Duration
}

func newRoomHub() *roomHub {
	return &roomHub{rooms: map[string]*room{}, created: map[string][]time.Time{}, now: time.Now, beat: roomHeartbeat}
}

func (h *roomHub) routes(m *http.ServeMux) {
	m.HandleFunc("GET /api/rooms", h.info)
	m.HandleFunc("POST /api/rooms", h.create)
	m.HandleFunc("GET /api/rooms/{code}", h.status)
	m.HandleFunc("POST /api/rooms/{code}/join", h.join)
	m.HandleFunc("POST /api/rooms/{code}/msg", h.msg)
	m.HandleFunc("GET /api/rooms/{code}/events", h.events)
}

// janitor drops idle rooms: nobody connected and nothing posted for roomIdle.
func (h *roomHub) janitor(stop <-chan struct{}) {
	t := time.NewTicker(30 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-stop:
			return
		case <-t.C:
			h.sweep()
		}
	}
}

func (h *roomHub) sweep() {
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.now()
	for code, r := range h.rooms {
		if len(r.subs) == 0 && now.Sub(r.active) > roomIdle {
			for _, sr := range r.open {
				if sr.timer != nil {
					sr.timer.Stop()
				}
			}
			delete(h.rooms, code)
		}
	}
	for ip, list := range h.created {
		if keep := recent(list, now, roomCreateWindow); len(keep) == 0 {
			delete(h.created, ip)
		} else {
			h.created[ip] = keep
		}
	}
}

func recent(list []time.Time, now time.Time, window time.Duration) []time.Time {
	out := list[:0]
	for _, t := range list {
		if now.Sub(t) < window {
			out = append(out, t)
		}
	}
	return out
}

func clientIP(r *http.Request) string {
	// Production sits behind a Cloudflare tunnel bound to loopback, so the edge's header is the real client.
	if ip := strings.TrimSpace(r.Header.Get("CF-Connecting-IP")); ip != "" {
		return ip
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func newCode(exists func(string) bool) string {
	b := make([]byte, 4)
	for {
		_, _ = rand.Read(b)
		code := make([]byte, 4)
		for i := range b {
			code[i] = roomCodeLetters[int(b[i])%len(roomCodeLetters)]
		}
		if !exists(string(code)) {
			return string(code)
		}
	}
}

func cleanName(s string) string {
	s = strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(s, "\n", " "), "\r", " "))
	if r := []rune(s); len(r) > 14 {
		s = string(r[:14])
	}
	return s
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, roomMaxRequest))
	if err != nil {
		problem(w, http.StatusRequestEntityTooLarge, "request too large")
		return false
	}
	if len(bytes.TrimSpace(body)) == 0 {
		body = []byte("{}")
	}
	if err := json.Unmarshal(body, v); err != nil {
		problem(w, http.StatusBadRequest, "invalid json")
		return false
	}
	return true
}

type joinReply struct {
	Code  string      `json:"code"`
	Seat  int         `json:"seat"`
	Token string      `json:"token"`
	Now   int64       `json:"now"`
	Log   []roomEntry `json:"log"`
}

func (h *roomHub) info(w http.ResponseWriter, _ *http.Request) {
	h.mu.Lock()
	n := len(h.rooms)
	h.mu.Unlock()
	writeJSON(w, 200, map[string]any{"relay": "rooms/v1", "rooms": n, "maxRooms": roomMaxRooms})
}

func (h *roomHub) create(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	now := h.now()
	ip := clientIP(r)
	list := recent(h.created[ip], now, roomCreateWindow)
	if len(list) >= roomCreatePerIP {
		h.created[ip] = list
		problem(w, http.StatusTooManyRequests, "too many rooms from this address")
		return
	}
	if len(h.rooms) >= roomMaxRooms {
		problem(w, http.StatusServiceUnavailable, "the pond is full, try again soon")
		return
	}
	h.created[ip] = append(list, now)
	code := newCode(func(c string) bool { return h.rooms[c] != nil })
	rm := &room{code: code, open: map[int]*sealRound{}, revealed: map[int]bool{}, subs: map[int]*roomSub{}, active: now}
	h.rooms[code] = rm
	seat, token := h.addSeatLocked(rm, cleanName(req.Name))
	writeJSON(w, 200, joinReply{Code: code, Seat: seat, Token: token, Now: now.UnixMilli(), Log: append([]roomEntry{}, rm.log...)})
}

func (h *roomHub) addSeatLocked(rm *room, name string) (int, string) {
	token, _ := randomToken(16)
	seat := len(rm.seats)
	if name == "" {
		name = fmt.Sprintf("Frog %d", seat+1)
	}
	rm.seats = append(rm.seats, &roomSeat{token: token, name: name})
	h.appendLocked(rm, roomEntry{Kind: "join", Seat: seat, Name: name})
	return seat, token
}

func (h *roomHub) join(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name  string `json:"name"`
		Token string `json:"token"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	rm := h.rooms[strings.ToUpper(r.PathValue("code"))]
	if rm == nil {
		problem(w, http.StatusNotFound, "room not found")
		return
	}
	now := h.now()
	if req.Token != "" {
		for i, s := range rm.seats {
			if s.token == req.Token {
				rm.active = now
				writeJSON(w, 200, joinReply{Code: rm.code, Seat: i, Token: s.token, Now: now.UnixMilli(), Log: append([]roomEntry{}, rm.log...)})
				return
			}
		}
	}
	if len(rm.seats) >= roomMaxSeats {
		problem(w, http.StatusConflict, "room is full")
		return
	}
	if len(rm.log) >= roomMaxLog {
		problem(w, http.StatusConflict, "room log is full")
		return
	}
	seat, token := h.addSeatLocked(rm, cleanName(req.Name))
	writeJSON(w, 200, joinReply{Code: rm.code, Seat: seat, Token: token, Now: now.UnixMilli(), Log: append([]roomEntry{}, rm.log[:len(rm.log)]...)})
}

func (h *roomHub) status(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	defer h.mu.Unlock()
	rm := h.rooms[strings.ToUpper(r.PathValue("code"))]
	if rm == nil {
		problem(w, http.StatusNotFound, "room not found")
		return
	}
	writeJSON(w, 200, map[string]any{"code": rm.code, "seats": len(rm.seats), "online": onlineSeats(rm), "lastId": len(rm.log)})
}

func onlineSeats(rm *room) []int {
	out := []int{}
	for i, s := range rm.seats {
		if s.conns > 0 {
			out = append(out, i)
		}
	}
	return out
}

// seatFor checks a seat number and its token in constant-ish time per seat.
func seatFor(rm *room, seat int, token string) *roomSeat {
	if seat < 0 || seat >= len(rm.seats) || token == "" {
		return nil
	}
	s := rm.seats[seat]
	if len(s.token) != len(token) || s.token != token {
		return nil
	}
	return s
}

func (h *roomHub) msg(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Seat  int             `json:"seat"`
		Token string          `json:"token"`
		Kind  string          `json:"kind"`
		Body  json.RawMessage `json:"body"`
		Round int             `json:"round"`
		MS    int             `json:"ms"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if len(req.Body) > roomMaxBody {
		problem(w, http.StatusRequestEntityTooLarge, "message too large")
		return
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	rm := h.rooms[strings.ToUpper(r.PathValue("code"))]
	if rm == nil {
		problem(w, http.StatusNotFound, "room not found")
		return
	}
	s := seatFor(rm, req.Seat, req.Token)
	if s == nil {
		problem(w, http.StatusForbidden, "bad seat token")
		return
	}
	now := h.now()
	s.sent = recent(s.sent, now, time.Second)
	if len(s.sent) >= roomRatePerSecond {
		problem(w, http.StatusTooManyRequests, "slow down")
		return
	}
	s.sent = append(s.sent, now)
	rm.active = now
	if req.Kind != "emote" && len(rm.log) >= roomMaxLog {
		problem(w, http.StatusConflict, "room log is full")
		return
	}
	switch req.Kind {
	case "msg":
		h.appendLocked(rm, roomEntry{Kind: "msg", Seat: req.Seat, Body: req.Body})
	case "emote":
		h.signalLocked(rm, map[string]any{"kind": "emote", "seat": req.Seat, "body": req.Body})
	case "open":
		h.openLocked(rm, req.Round, req.MS)
	case "seal":
		if rm.revealed[req.Round] {
			problem(w, http.StatusConflict, "round already revealed")
			return
		}
		sr := rm.open[req.Round]
		if sr == nil {
			sr = h.openLocked(rm, req.Round, roomDefaultMS)
		}
		body := req.Body
		if len(body) == 0 {
			body = json.RawMessage("null")
		}
		sr.plans[req.Seat] = append(json.RawMessage{}, body...)
		h.signalLocked(rm, map[string]any{"kind": "sealed", "seat": req.Seat, "round": req.Round})
		h.maybeRevealLocked(rm, req.Round)
	default:
		problem(w, http.StatusBadRequest, "unknown kind")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// openLocked opens a sealed round with a deadline; the first opener wins and later calls change nothing.
func (h *roomHub) openLocked(rm *room, round, ms int) *sealRound {
	if sr := rm.open[round]; sr != nil || rm.revealed[round] {
		return sr
	}
	d := time.Duration(ms) * time.Millisecond
	if d <= 0 {
		d = roomDefaultMS * time.Millisecond
	}
	if d > roomMaxDeadline {
		d = roomMaxDeadline
	}
	sr := &sealRound{deadline: h.now().Add(d), plans: map[int]json.RawMessage{}}
	rm.open[round] = sr
	rnd := round
	h.appendLocked(rm, roomEntry{Kind: "open", Seat: -1, Round: &rnd, MS: int(d / time.Millisecond)})
	code := rm.code
	sr.timer = time.AfterFunc(d, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if cur := h.rooms[code]; cur == rm {
			h.revealLocked(rm, rnd)
		}
	})
	return sr
}

func (h *roomHub) maybeRevealLocked(rm *room, round int) {
	sr := rm.open[round]
	if sr == nil {
		return
	}
	connected := 0
	for i, s := range rm.seats {
		if s.conns > 0 {
			connected++
			if _, ok := sr.plans[i]; !ok {
				return
			}
		}
	}
	if connected == 0 {
		return // nobody is watching: wait for the deadline
	}
	h.revealLocked(rm, round)
}

func (h *roomHub) revealLocked(rm *room, round int) {
	sr := rm.open[round]
	if sr == nil {
		return
	}
	if sr.timer != nil {
		sr.timer.Stop()
	}
	delete(rm.open, round)
	rm.revealed[round] = true
	plans := map[string]json.RawMessage{}
	for seat, body := range sr.plans {
		plans[strconv.Itoa(seat)] = body
	}
	rnd := round
	h.appendLocked(rm, roomEntry{Kind: "reveal", Seat: -1, Round: &rnd, Plans: plans})
}

func (h *roomHub) appendLocked(rm *room, e roomEntry) {
	e.ID = len(rm.log) + 1
	e.At = h.now().UnixMilli()
	rm.log = append(rm.log, e)
	raw, _ := json.Marshal(e)
	h.broadcastLocked(rm, []byte(fmt.Sprintf("id: %d\ndata: %s\n\n", e.ID, raw)))
}

func (h *roomHub) signalLocked(rm *room, v any) {
	raw, _ := json.Marshal(v)
	h.broadcastLocked(rm, []byte(fmt.Sprintf("data: %s\n\n", raw)))
}

func (h *roomHub) broadcastLocked(rm *room, frame []byte) {
	for id, sub := range rm.subs {
		select {
		case sub.ch <- frame:
		default:
			// A subscriber this far behind is dropped; its client resumes from Last-Event-ID.
			close(sub.ch)
			delete(rm.subs, id)
			h.disconnectLocked(rm, sub.seat)
		}
	}
}

func (h *roomHub) disconnectLocked(rm *room, seat int) {
	if seat >= 0 && seat < len(rm.seats) && rm.seats[seat].conns > 0 {
		rm.seats[seat].conns--
	}
	h.signalLocked(rm, map[string]any{"kind": "presence", "online": onlineSeats(rm)})
	for round := range rm.open {
		h.maybeRevealLocked(rm, round)
	}
}

func (h *roomHub) events(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		problem(w, http.StatusInternalServerError, "streaming is unavailable")
		return
	}
	q := r.URL.Query()
	seat, err := strconv.Atoi(q.Get("seat"))
	if err != nil {
		problem(w, http.StatusBadRequest, "bad seat")
		return
	}
	after, _ := strconv.Atoi(q.Get("after"))
	if v, err := strconv.Atoi(strings.TrimSpace(r.Header.Get("Last-Event-ID"))); err == nil && v > after {
		after = v
	}
	h.mu.Lock()
	rm := h.rooms[strings.ToUpper(r.PathValue("code"))]
	if rm == nil {
		h.mu.Unlock()
		problem(w, http.StatusNotFound, "room not found")
		return
	}
	s := seatFor(rm, seat, q.Get("token"))
	if s == nil {
		h.mu.Unlock()
		problem(w, http.StatusForbidden, "bad seat token")
		return
	}
	if after < 0 {
		after = 0
	}
	var backlog bytes.Buffer
	for _, e := range rm.log {
		if e.ID > after {
			raw, _ := json.Marshal(e)
			fmt.Fprintf(&backlog, "id: %d\ndata: %s\n\n", e.ID, raw)
		}
	}
	sub := &roomSub{seat: seat, ch: make(chan []byte, 256)}
	rm.nextSub++
	subID := rm.nextSub
	rm.subs[subID] = sub
	s.conns++
	rm.active = h.now()
	hello, _ := json.Marshal(map[string]any{"kind": "hello", "now": h.now().UnixMilli(), "online": onlineSeats(rm)})
	fmt.Fprintf(&backlog, "retry: 2000\ndata: %s\n\n", hello)
	h.signalLocked(rm, map[string]any{"kind": "presence", "online": onlineSeats(rm)})
	beat := h.beat
	h.mu.Unlock()

	defer func() {
		h.mu.Lock()
		if cur, ok := rm.subs[subID]; ok && cur == sub {
			delete(rm.subs, subID)
			h.disconnectLocked(rm, seat)
		}
		rm.active = h.now()
		h.mu.Unlock()
	}()

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	if _, err := w.Write(backlog.Bytes()); err != nil {
		return
	}
	flusher.Flush()
	heartbeat := time.NewTicker(beat)
	defer heartbeat.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case frame, open := <-sub.ch:
			if !open {
				return
			}
			if _, err := w.Write(frame); err != nil {
				return
			}
			flusher.Flush()
		case <-heartbeat.C:
			if _, err := io.WriteString(w, ": hb\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
