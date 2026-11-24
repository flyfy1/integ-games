package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type relayClient struct {
	t    *testing.T
	base string
}

func newRelay(t *testing.T) (*relayClient, *roomHub) {
	t.Helper()
	s := &server{rooms: newRoomHub()}
	s.rooms.beat = 50 * time.Millisecond
	ts := httptest.NewServer(s.routes())
	t.Cleanup(ts.Close)
	return &relayClient{t: t, base: ts.URL}, s.rooms
}

func (c *relayClient) post(path string, body any, headers ...string) (int, []byte) {
	c.t.Helper()
	raw, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, c.base+path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	for i := 0; i+1 < len(headers); i += 2 {
		req.Header.Set(headers[i], headers[i+1])
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer res.Body.Close()
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(res.Body)
	return res.StatusCode, buf.Bytes()
}

func (c *relayClient) create(name string) joinReply {
	c.t.Helper()
	code, body := c.post("/api/rooms", map[string]string{"name": name})
	if code != 200 {
		c.t.Fatalf("create: %d %s", code, body)
	}
	var j joinReply
	_ = json.Unmarshal(body, &j)
	return j
}

func (c *relayClient) join(room, name string) joinReply {
	c.t.Helper()
	code, body := c.post("/api/rooms/"+room+"/join", map[string]string{"name": name})
	if code != 200 {
		c.t.Fatalf("join: %d %s", code, body)
	}
	var j joinReply
	_ = json.Unmarshal(body, &j)
	return j
}

func (c *relayClient) send(j joinReply, payload map[string]any) int {
	c.t.Helper()
	payload["seat"] = j.Seat
	payload["token"] = j.Token
	code, _ := c.post("/api/rooms/"+j.Code+"/msg", payload)
	return code
}

type stream struct {
	frames chan string
	close  func()
}

// listen opens the SSE stream for a seat and delivers each frame's data line (plus its id, as "id|data").
func (c *relayClient) listen(j joinReply, after int, lastEventID string) *stream {
	c.t.Helper()
	req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("%s/api/rooms/%s/events?seat=%d&token=%s&after=%d", c.base, j.Code, j.Seat, j.Token, after), nil)
	if lastEventID != "" {
		req.Header.Set("Last-Event-ID", lastEventID)
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	if res.StatusCode != 200 {
		c.t.Fatalf("events status %d", res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); ct != "text/event-stream" {
		c.t.Fatalf("content type %q", ct)
	}
	c.t.Cleanup(func() { res.Body.Close() })
	out := make(chan string, 512)
	go func() {
		defer close(out)
		sc := bufio.NewScanner(res.Body)
		id := ""
		for sc.Scan() {
			line := sc.Text()
			switch {
			case strings.HasPrefix(line, "id: "):
				id = strings.TrimPrefix(line, "id: ")
			case strings.HasPrefix(line, "data: "):
				out <- id + "|" + strings.TrimPrefix(line, "data: ")
				id = ""
			case strings.HasPrefix(line, ": hb"):
				out <- "hb|"
			}
		}
	}()
	return &stream{frames: out, close: func() { res.Body.Close() }}
}

// until collects frames until one contains `want` (or fails after a timeout); it returns everything seen.
func (s *stream) until(t *testing.T, want string) []string {
	t.Helper()
	var seen []string
	deadline := time.After(3 * time.Second)
	for {
		select {
		case f, ok := <-s.frames:
			if !ok {
				t.Fatalf("stream closed before %q; saw %v", want, seen)
			}
			seen = append(seen, f)
			if strings.Contains(f, want) {
				return seen
			}
		case <-deadline:
			t.Fatalf("timed out waiting for %q; saw %v", want, seen)
		}
	}
}

func (s *stream) quiet(t *testing.T, d time.Duration) []string {
	t.Helper()
	var seen []string
	end := time.After(d)
	for {
		select {
		case f, ok := <-s.frames:
			if !ok {
				return seen
			}
			seen = append(seen, f)
		case <-end:
			return seen
		}
	}
}

func TestRelayProbeAnswersWithTag(t *testing.T) {
	c, _ := newRelay(t)
	res, err := http.Get(c.base + "/api/rooms")
	if err != nil {
		t.Fatal(err)
	}
	var body map[string]any
	_ = json.NewDecoder(res.Body).Decode(&body)
	if res.StatusCode != 200 || body["relay"] != "rooms/v1" {
		t.Fatalf("probe: %d %v", res.StatusCode, body)
	}
}

func TestSealedPlansNeverLeakBeforeTheReveal(t *testing.T) {
	c, _ := newRelay(t)
	host := c.create("Ann")
	if len(host.Code) != 4 || host.Seat != 0 || host.Token == "" {
		t.Fatalf("bad create reply %#v", host)
	}
	guest := c.join(host.Code, "Bo")
	a := c.listen(host, 0, "")
	defer a.close()
	b := c.listen(guest, 0, "")
	defer b.close()
	a.until(t, `"kind":"hello"`)
	b.until(t, `"kind":"hello"`)
	if code := c.send(host, map[string]any{"kind": "open", "round": 101, "ms": 5000}); code != 204 {
		t.Fatalf("open %d", code)
	}
	if code := c.send(host, map[string]any{"kind": "seal", "round": 101, "body": map[string]string{"p": "SECRET-A1"}}); code != 204 {
		t.Fatalf("seal %d", code)
	}
	// A resend replaces the sealed body.
	c.send(host, map[string]any{"kind": "seal", "round": 101, "body": map[string]string{"p": "SECRET-A2"}})
	seen := b.until(t, `"kind":"sealed"`)
	seen = append(seen, b.quiet(t, 150*time.Millisecond)...)
	late := c.join(host.Code, "Cy")
	_, status := c.post("/api/rooms/"+host.Code, nil)
	res, _ := http.Get(c.base + "/api/rooms/" + host.Code)
	var buf bytes.Buffer
	_, _ = buf.ReadFrom(res.Body)
	replay := c.listen(late, 0, "")
	defer replay.close()
	replayed := replay.until(t, `"kind":"hello"`)
	for _, where := range []string{strings.Join(seen, "\n"), fmt.Sprint(late.Log), string(status), buf.String(), strings.Join(replayed, "\n")} {
		if strings.Contains(where, "SECRET") {
			t.Fatalf("sealed body leaked before the reveal: %s", where)
		}
	}
	// Cy is connected too now, so the reveal waits for both remaining seats.
	c.send(guest, map[string]any{"kind": "seal", "round": 101, "body": map[string]string{"p": "SECRET-B"}})
	if got := strings.Join(b.quiet(t, 150*time.Millisecond), "\n"); strings.Contains(got, `"kind":"reveal"`) {
		t.Fatalf("revealed before every connected seat sealed: %s", got)
	}
	c.send(late, map[string]any{"kind": "seal", "round": 101, "body": nil})
	all := strings.Join(b.until(t, `"kind":"reveal"`), "\n")
	if !strings.Contains(all, "SECRET-A2") || strings.Contains(all, "SECRET-A1") || !strings.Contains(all, "SECRET-B") {
		t.Fatalf("reveal should carry the latest sealed bodies: %s", all)
	}
	if code := c.send(host, map[string]any{"kind": "seal", "round": 101, "body": map[string]string{"p": "late"}}); code != 409 {
		t.Fatalf("sealing a revealed round: %d", code)
	}
}

func TestDeadlineAndDisconnectRevealWithMissingPlans(t *testing.T) {
	c, _ := newRelay(t)
	host := c.create("Ann")
	guest := c.join(host.Code, "Bo")
	a := c.listen(host, 0, "")
	defer a.close()
	b := c.listen(guest, 0, "")
	a.until(t, `"kind":"hello"`)
	c.send(host, map[string]any{"kind": "open", "round": 1, "ms": 60000})
	c.send(host, map[string]any{"kind": "seal", "round": 1, "body": map[string]string{"p": "URB"}})
	if got := strings.Join(a.quiet(t, 100*time.Millisecond), "\n"); strings.Contains(got, `"reveal"`) {
		t.Fatal("revealed while a connected seat had not sealed")
	}
	b.close() // the guest's phone dies mid-round
	got := strings.Join(a.until(t, `"kind":"reveal"`), "\n")
	if !strings.Contains(got, `"plans":{"0":{"p":"URB"}}`) {
		t.Fatalf("reveal after disconnect should hold only the host plan: %s", got)
	}
	// Deadline path: nobody seals, the round reveals empty when time runs out.
	c.send(host, map[string]any{"kind": "open", "round": 2, "ms": 80})
	got = strings.Join(a.until(t, `"kind":"reveal","seat":-1`), "\n")
	if !strings.Contains(got, `"round":2}`) {
		t.Fatalf("deadline reveal should be empty: %s", got)
	}
	// Opening twice keeps the first deadline and logs one open entry.
	c.send(host, map[string]any{"kind": "open", "round": 3, "ms": 5000})
	c.send(guest, map[string]any{"kind": "open", "round": 3, "ms": 9000})
	opens := 0
	for _, f := range a.quiet(t, 150*time.Millisecond) {
		if strings.Contains(f, `"kind":"open","seat":-1`) && strings.Contains(f, `"round":3`) {
			opens++
			if !strings.Contains(f, `"ms":5000`) {
				t.Fatalf("first opener should win: %s", f)
			}
		}
	}
	if opens != 1 {
		t.Fatalf("want one open entry for round 3, got %d", opens)
	}
}

func TestLastEventIDResumesWithoutGapsOrRepeats(t *testing.T) {
	c, _ := newRelay(t)
	host := c.create("Ann")
	for i := 0; i < 5; i++ {
		c.send(host, map[string]any{"kind": "msg", "body": map[string]int{"n": i}})
	}
	// Log: 1 join + 5 msgs. Resume after id 3 via the header (browser reconnect) and via ?after= (fresh EventSource).
	for _, mode := range []string{"header", "query"} {
		var s *stream
		if mode == "header" {
			s = c.listen(host, 0, "3")
		} else {
			s = c.listen(host, 3, "")
		}
		frames := s.until(t, `"kind":"hello"`)
		var ids []string
		for _, f := range frames {
			if id := strings.SplitN(f, "|", 2)[0]; id != "" {
				ids = append(ids, id)
			}
		}
		want := map[string]string{"header": "4,5,6", "query": "4,5,6,7"}[mode] // the header pass posted entry 7
		if strings.Join(ids, ",") != want {
			t.Fatalf("%s resume replayed %v (%v)", mode, ids, frames)
		}
		c.send(host, map[string]any{"kind": "msg", "body": map[string]string{"mode": mode}})
		live := s.until(t, mode)
		if !strings.HasPrefix(live[len(live)-1], "7|") && !strings.HasPrefix(live[len(live)-1], "8|") {
			t.Fatalf("live entry should carry the next id: %v", live)
		}
		s.close()
	}
	// Heartbeats keep the stream alive through idle proxies.
	s := c.listen(host, 100, "")
	defer s.close()
	s.until(t, "hb|")
}

func TestRelayCapsHold(t *testing.T) {
	c, hub := newRelay(t)
	host := c.create("Ann")
	for i := 1; i < roomMaxSeats; i++ {
		c.join(host.Code, fmt.Sprintf("p%d", i))
	}
	if code, _ := c.post("/api/rooms/"+host.Code+"/join", map[string]string{"name": "ninth"}); code != http.StatusConflict {
		t.Fatalf("ninth seat: %d", code)
	}
	// Rejoining with a token keeps the seat even when the room is full.
	code, body := c.post("/api/rooms/"+host.Code+"/join", map[string]string{"token": host.Token})
	var again joinReply
	_ = json.Unmarshal(body, &again)
	if code != 200 || again.Seat != 0 {
		t.Fatalf("token rejoin: %d %s", code, body)
	}
	if code := c.send(host, map[string]any{"kind": "msg", "body": strings.Repeat("x", roomMaxBody+10)}); code != http.StatusRequestEntityTooLarge {
		t.Fatalf("oversized body: %d", code)
	}
	if code, _ := c.post("/api/rooms/"+host.Code+"/msg", map[string]any{"seat": 0, "token": "nope", "kind": "msg"}); code != http.StatusForbidden {
		t.Fatalf("bad token: %d", code)
	}
	limited := 0
	for i := 0; i < roomRatePerSecond+5; i++ {
		if c.send(host, map[string]any{"kind": "emote", "body": 1}) == http.StatusTooManyRequests {
			limited++
		}
	}
	if limited == 0 {
		t.Fatal("rate limit never triggered")
	}
	for i := 0; i < roomCreatePerIP; i++ {
		if code, _ := c.post("/api/rooms", map[string]string{}, "CF-Connecting-IP", "203.0.113.9"); code != 200 && i < roomCreatePerIP-1 {
			t.Fatalf("create %d: %d", i, code)
		}
	}
	if code, _ := c.post("/api/rooms", map[string]string{}, "CF-Connecting-IP", "203.0.113.9"); code != http.StatusTooManyRequests {
		t.Fatalf("per-IP creation limit: %d", code)
	}
	for i := 0; len(hub.rooms) < roomMaxRooms; i++ {
		if code, _ := c.post("/api/rooms", map[string]string{}, "CF-Connecting-IP", fmt.Sprintf("198.51.100.%d", i)); code != 200 {
			t.Fatalf("filling rooms: %d", code)
		}
	}
	if code, _ := c.post("/api/rooms", map[string]string{}, "CF-Connecting-IP", "192.0.2.1"); code != http.StatusServiceUnavailable {
		t.Fatalf("room cap: %d", code)
	}
	// Idle rooms are dropped after ten minutes.
	future := time.Now().Add(roomIdle + time.Minute)
	hub.mu.Lock()
	hub.now = func() time.Time { return future }
	hub.mu.Unlock()
	hub.sweep()
	if code, _ := c.post("/api/rooms/"+host.Code+"/join", map[string]string{"name": "late"}); code != http.StatusNotFound {
		t.Fatalf("idle room should be gone: %d", code)
	}
	hub.mu.Lock()
	n := len(hub.rooms)
	hub.mu.Unlock()
	if n != 0 {
		t.Fatalf("%d rooms survived the sweep", n)
	}
}

func TestRelayTokenStaysOutOfTheLog(t *testing.T) {
	c, _ := newRelay(t)
	host := c.create("Ann")
	guest := c.join(host.Code, "Bo")
	if strings.Contains(fmt.Sprint(guest.Log), host.Token) {
		t.Fatal("a seat token appeared in the log")
	}
	s := c.listen(guest, 0, "")
	defer s.close()
	if strings.Contains(strings.Join(s.until(t, "hello"), ""), host.Token) {
		t.Fatal("a seat token appeared in the stream")
	}
	if code, _ := c.post("/api/rooms/ZZZZ/join", map[string]string{}); code != http.StatusNotFound {
		t.Fatalf("missing room: %d", code)
	}
}

var _ = httptest.NewRecorder
