package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testServer(t *testing.T) *server {
	t.Helper()
	db, err := sql.Open("sqlite", t.TempDir()+"/games.db")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := migrate(db); err != nil {
		t.Fatal(err)
	}
	return &server{db: db}
}

func TestScoreKeepsPerGameBestAndBuildsOverallLeaderboard(t *testing.T) {
	s := testServer(t)
	result, err := s.db.Exec(`INSERT INTO users(subject,email,display_name,created_at) VALUES('subject','player@example.com','player',?)`, time.Now().UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	uid, _ := result.LastInsertId()
	_, _ = s.db.Exec(`INSERT INTO sessions(token,user_id,expires_at) VALUES('session',?,?)`, uid, time.Now().Add(time.Hour).UnixMilli())

	for _, body := range []string{`{"game":"snake","score":120}`, `{"game":"snake","score":40}`, `{"game":"mines","score":30}`} {
		r := httptest.NewRequest(http.MethodPost, "/api/scores", strings.NewReader(body))
		r.Header.Set("Authorization", "Bearer session")
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		if w.Code != http.StatusNoContent {
			t.Fatalf("score status %d: %s", w.Code, w.Body.String())
		}
	}
	w := httptest.NewRecorder()
	s.routes().ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/leaderboard", nil))
	var board []struct {
		Name  string `json:"name"`
		Score int64  `json:"score"`
		Games int    `json:"games"`
	}
	if err := json.NewDecoder(w.Body).Decode(&board); err != nil {
		t.Fatal(err)
	}
	if len(board) != 1 || board[0].Name != "player" || board[0].Score != 150 || board[0].Games != 2 {
		t.Fatalf("unexpected leaderboard: %#v", board)
	}
}

func TestScoreRequiresLogin(t *testing.T) {
	s := testServer(t)
	for _, test := range []struct {
		body, token string
		want        int
	}{
		{`{"game":"snake","score":10}`, "", http.StatusUnauthorized},
		{`{"game":"unknown","score":10}`, "missing", http.StatusUnauthorized},
	} {
		r := httptest.NewRequest(http.MethodPost, "/api/scores", strings.NewReader(test.body))
		if test.token != "" {
			r.Header.Set("Authorization", "Bearer "+test.token)
		}
		w := httptest.NewRecorder()
		s.routes().ServeHTTP(w, r)
		if w.Code != test.want {
			t.Fatalf("status %d, want %d", w.Code, test.want)
		}
	}
}
