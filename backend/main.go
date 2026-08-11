package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	_ "modernc.org/sqlite"
)

var validGames = map[string]bool{"merge-2048": true, "block-drop": true, "snake": true, "mines": true, "solitaire": true, "sudoku": true, "word-grid": true, "memory": true, "stack": true, "flap": true, "breakout": true, "invaders": true, "runner": true, "platformer": true, "drive": true, "fruit-merge": true, "bubble": true, "hex-puzzle": true, "knife": true, "arena": true}

type server struct {
	db   *sql.DB
	auth authConfig
}
type authConfig struct{ issuer, clientID, secret, callback, frontend string }
type profile struct {
	Subject string `json:"sub"`
	Email   string `json:"email"`
}
type contextKey string

const userKey contextKey = "user"

func main() {
	dbPath := env("GAMES_DB_PATH", "games.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatal(err)
	}
	if err := migrate(db); err != nil {
		log.Fatal(err)
	}
	s := &server{db: db, auth: authConfig{strings.TrimRight(env("INTEG_AUTH_ISSUER", "https://auth.integ.life"), "/"), os.Getenv("INTEG_AUTH_CLIENT_ID"), os.Getenv("INTEG_AUTH_CLIENT_SECRET"), os.Getenv("INTEG_AUTH_REDIRECT_URI"), env("GAMES_FRONTEND_URI", "https://games.integ.life/")}}
	addr := env("GAMES_ADDR", "127.0.0.1:8104")
	log.Printf("games backend listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, s.routes()))
}

func (s *server) routes() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET /api/health", func(w http.ResponseWriter, _ *http.Request) { writeJSON(w, 200, map[string]string{"status": "ok"}) })
	m.HandleFunc("GET /api/version", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, 200, currentBuildVersion("flyfy1/integ-games", "games-api"))
	})
	m.HandleFunc("GET /api/auth/integ/start", s.authStart)
	m.HandleFunc("GET /api/auth/integ/callback", s.authCallback)
	m.Handle("GET /api/me", s.requireUser(http.HandlerFunc(s.me)))
	m.Handle("POST /api/logout", s.requireUser(http.HandlerFunc(s.logout)))
	m.Handle("POST /api/scores", s.requireUser(http.HandlerFunc(s.score)))
	m.HandleFunc("GET /api/leaderboard", s.leaderboard)
	return security(m)
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, subject TEXT NOT NULL UNIQUE, email TEXT NOT NULL, display_name TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS scores(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game_slug TEXT NOT NULL, best_score INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id, game_slug));
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS scores_rank ON scores(best_score DESC);`)
	return err
}

func (s *server) authStart(w http.ResponseWriter, r *http.Request) {
	if !s.auth.valid() {
		problem(w, 503, "login is not configured")
		return
	}
	state, _ := randomToken(16)
	verifier, _ := randomToken(32)
	secure := strings.HasPrefix(s.auth.callback, "https://")
	setCookie(w, "games_auth_state", state, secure)
	setCookie(w, "games_auth_verifier", verifier, secure)
	h := sha256.Sum256([]byte(verifier))
	q := url.Values{"response_type": {"code"}, "client_id": {s.auth.clientID}, "redirect_uri": {s.auth.callback}, "state": {state}, "code_challenge": {base64.RawURLEncoding.EncodeToString(h[:])}, "code_challenge_method": {"S256"}, "theme": {"games"}}
	http.Redirect(w, r, s.auth.issuer+"/authorize?"+q.Encode(), http.StatusFound)
}

func (s *server) authCallback(w http.ResponseWriter, r *http.Request) {
	secure := strings.HasPrefix(s.auth.callback, "https://")
	defer clearCookie(w, "games_auth_state", secure)
	defer clearCookie(w, "games_auth_verifier", secure)
	state, e1 := r.Cookie("games_auth_state")
	verifier, e2 := r.Cookie("games_auth_verifier")
	if e1 != nil || e2 != nil || subtle.ConstantTimeCompare([]byte(state.Value), []byte(r.URL.Query().Get("state"))) != 1 {
		s.authRedirect(w, r, "", "Login expired. Please try again.")
		return
	}
	access, err := s.exchange(r.URL.Query().Get("code"), verifier.Value)
	if err != nil {
		s.authRedirect(w, r, "", "Login failed. Please try again.")
		return
	}
	p, err := s.userinfo(access)
	if err != nil {
		s.authRedirect(w, r, "", "Could not read your account.")
		return
	}
	name := strings.Split(strings.ToLower(strings.TrimSpace(p.Email)), "@")[0]
	if len(name) > 24 {
		name = name[:24]
	}
	var uid int64
	err = s.db.QueryRow(`INSERT INTO users(subject,email,display_name,created_at) VALUES(?,?,?,?) ON CONFLICT(subject) DO UPDATE SET email=excluded.email RETURNING id`, p.Subject, p.Email, name, time.Now().UnixMilli()).Scan(&uid)
	if err != nil {
		s.authRedirect(w, r, "", "Could not create your player profile.")
		return
	}
	token, _ := randomToken(32)
	_, err = s.db.Exec(`INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)`, token, uid, time.Now().Add(30*24*time.Hour).UnixMilli())
	if err != nil {
		s.authRedirect(w, r, "", "Could not create your session.")
		return
	}
	s.authRedirect(w, r, token, "")
}

func (s *server) exchange(code, verifier string) (string, error) {
	if code == "" {
		return "", errors.New("missing code")
	}
	f := url.Values{"grant_type": {"authorization_code"}, "code": {code}, "redirect_uri": {s.auth.callback}, "code_verifier": {verifier}}
	req, _ := http.NewRequest("POST", s.auth.issuer+"/token", strings.NewReader(f.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.SetBasicAuth(s.auth.clientID, s.auth.secret)
	res, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return "", fmt.Errorf("token status %d", res.StatusCode)
	}
	var out struct {
		Access string `json:"access_token"`
	}
	err = json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&out)
	if out.Access == "" {
		return "", errors.New("missing token")
	}
	return out.Access, err
}
func (s *server) userinfo(token string) (profile, error) {
	req, _ := http.NewRequest("GET", s.auth.issuer+"/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res, err := (&http.Client{Timeout: 10 * time.Second}).Do(req)
	if err != nil {
		return profile{}, err
	}
	defer res.Body.Close()
	if res.StatusCode/100 != 2 {
		return profile{}, errors.New("userinfo failed")
	}
	var p profile
	err = json.NewDecoder(io.LimitReader(res.Body, 64<<10)).Decode(&p)
	if p.Subject == "" || !strings.Contains(p.Email, "@") {
		return p, errors.New("invalid profile")
	}
	return p, err
}
func (a authConfig) valid() bool {
	u, e1 := url.Parse(a.callback)
	i, e2 := url.Parse(a.issuer)
	return a.clientID != "" && len(a.secret) >= 32 && e1 == nil && e2 == nil && safeURL(u) && safeURL(i)
}
func safeURL(u *url.URL) bool {
	if u == nil || u.Host == "" {
		return false
	}
	return u.Scheme == "https" || (u.Scheme == "http" && (u.Hostname() == "localhost" || net.ParseIP(u.Hostname()).IsLoopback()))
}

func (s *server) authRedirect(w http.ResponseWriter, r *http.Request, token, msg string) {
	u, _ := url.Parse(s.auth.frontend)
	q := url.Values{}
	if token != "" {
		q.Set("games_token", token)
	}
	if msg != "" {
		q.Set("auth_error", msg)
	}
	u.Fragment = "/?" + q.Encode()
	http.Redirect(w, r, u.String(), 302)
}
func (s *server) requireUser(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		var id int64
		var name string
		err := s.db.QueryRow(`SELECT users.id,display_name FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires_at>?`, token, time.Now().UnixMilli()).Scan(&id, &name)
		if err != nil {
			problem(w, 401, "login required")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey, struct {
			ID   int64
			Name string
		}{id, name})))
	})
}
func current(r *http.Request) struct {
	ID   int64
	Name string
} {
	return r.Context().Value(userKey).(struct {
		ID   int64
		Name string
	})
}
func (s *server) me(w http.ResponseWriter, r *http.Request) {
	u := current(r)
	writeJSON(w, 200, map[string]any{"id": u.ID, "name": u.Name})
}
func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	s.db.Exec(`DELETE FROM sessions WHERE token=?`, token)
	w.WriteHeader(204)
}
func (s *server) score(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Game  string `json:"game"`
		Score int64  `json:"score"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); err != nil || !validGames[in.Game] || in.Score < 0 || in.Score > 1_000_000_000 {
		problem(w, 400, "invalid score")
		return
	}
	u := current(r)
	_, err := s.db.Exec(`INSERT INTO scores(user_id,game_slug,best_score,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id,game_slug) DO UPDATE SET best_score=MAX(best_score,excluded.best_score),updated_at=excluded.updated_at`, u.ID, in.Game, in.Score, time.Now().UnixMilli())
	if err != nil {
		problem(w, 500, "could not save score")
		return
	}
	w.WriteHeader(204)
}
func (s *server) leaderboard(w http.ResponseWriter, _ *http.Request) {
	rows, err := s.db.Query(`SELECT display_name,SUM(best_score) total,COUNT(*) games FROM users JOIN scores ON users.id=scores.user_id GROUP BY users.id ORDER BY total DESC,display_name LIMIT 20`)
	if err != nil {
		problem(w, 500, "could not load leaderboard")
		return
	}
	defer rows.Close()
	type entry struct {
		Name  string `json:"name"`
		Score int64  `json:"score"`
		Games int    `json:"games"`
	}
	out := []entry{}
	for rows.Next() {
		var e entry
		rows.Scan(&e.Name, &e.Score, &e.Games)
		out = append(out, e)
	}
	writeJSON(w, 200, out)
}

func security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "https://games.integ.life" || origin == "http://localhost:5173" || origin == "http://127.0.0.1:5173" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}
func setCookie(w http.ResponseWriter, n, v string, secure bool) {
	http.SetCookie(w, &http.Cookie{Name: n, Value: v, Path: "/api/auth/integ", MaxAge: 600, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
}
func clearCookie(w http.ResponseWriter, n string, secure bool) {
	http.SetCookie(w, &http.Cookie{Name: n, Path: "/api/auth/integ", MaxAge: -1, HttpOnly: true, Secure: secure, SameSite: http.SameSiteLaxMode})
}
func randomToken(n int) (string, error) {
	b := make([]byte, n)
	_, e := rand.Read(b)
	return hex.EncodeToString(b), e
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}
func problem(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
func env(k, d string) string {
	if v := strings.TrimSpace(os.Getenv(k)); v != "" {
		return v
	}
	return d
}
