package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"net/http"
	"sort"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	qrcode "github.com/skip2/go-qrcode"
	"github.com/kit-solutions/workmate-event/pkg/config"
)

type ProgramHandler struct {
	db  *sql.DB
	cfg *config.Config
}

func NewProgramHandler(db *sql.DB, cfg *config.Config) *ProgramHandler {
	return &ProgramHandler{db: db, cfg: cfg}
}

type ProgramItem struct {
	ID          string `json:"id"`
	Time        string `json:"time"`        // "18:00"
	Title       string `json:"title"`
	Description string `json:"description"`
	Location    string `json:"location"`
	Order       int    `json:"order"`
}

type EventProgram struct {
	ID        string        `json:"id"`
	EventID   string        `json:"event_id"`
	EventName string        `json:"event_name,omitempty"`
	QRCode    string        `json:"qr_code"` // URL zur öffentlichen Seite
	Items     []ProgramItem `json:"items"`
	UpdatedAt time.Time     `json:"updated_at"`
}

// Get gibt das Programm eines Events zurück (JSON, Auth erforderlich).
func (h *ProgramHandler) Get(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	prog, err := h.loadProgram(r, eventID)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "kein Programm angelegt", http.StatusNotFound)
		return
	}
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, prog)
}

// Upsert legt das Programm an oder aktualisiert es (inkl. aller Items).
func (h *ProgramHandler) Upsert(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	var body struct {
		Items []ProgramItem `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	publicURL := h.publicURL(r)
	qrURL := fmt.Sprintf("%s/program/%s", publicURL, eventID)
	now := time.Now().UTC()

	// Programm-ID ermitteln (existiert bereits?)
	var progID string
	h.db.QueryRowContext(r.Context(),
		"SELECT id FROM event_programs WHERE event_id=?", eventID,
	).Scan(&progID)

	if progID == "" {
		progID = uuid.NewString()
		_, err := h.db.ExecContext(r.Context(),
			`INSERT INTO event_programs (id, event_id, qr_code, updated_at) VALUES (?,?,?,?)`,
			progID, eventID, qrURL, now,
		)
		if err != nil {
			jsonError(w, "db error", http.StatusInternalServerError)
			return
		}
	} else {
		h.db.ExecContext(r.Context(),
			`UPDATE event_programs SET qr_code=?, updated_at=? WHERE id=?`,
			qrURL, now, progID,
		)
	}

	// Alle Items ersetzen
	h.db.ExecContext(r.Context(), `DELETE FROM program_items WHERE program_id=?`, progID)
	for i, item := range body.Items {
		if item.ID == "" {
			item.ID = uuid.NewString()
		}
		if item.Order == 0 {
			item.Order = i + 1
		}
		h.db.ExecContext(r.Context(), `
			INSERT INTO program_items (id, program_id, time, title, description, location, sort_order)
			VALUES (?,?,?,?,?,?,?)
		`, item.ID, progID, item.Time, item.Title, item.Description, item.Location, item.Order)
	}

	prog, _ := h.loadProgram(r, eventID)
	jsonOK(w, prog)
}

// QRCode gibt das QR-Code-PNG für die öffentliche Programm-Seite zurück.
func (h *ProgramHandler) QRCode(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	publicURL := h.publicURL(r)
	qrURL := fmt.Sprintf("%s/program/%s", publicURL, eventID)

	pngBytes, err := qrcode.Encode(qrURL, qrcode.Medium, 300)
	if err != nil {
		jsonError(w, "qr error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="programm-%s.png"`, eventID[:8]))
	w.Write(pngBytes)
}

// PublicPage gibt die öffentliche HTML-Programmseite zurück (kein Auth).
func (h *ProgramHandler) PublicPage(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "event_id")

	prog, err := h.loadProgramDirect(r, eventID)
	if errors.Is(err, sql.ErrNoRows) || prog == nil {
		http.Error(w, "Programm nicht gefunden", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprintf(w, publicPageHTML(prog))
}

func (h *ProgramHandler) loadProgram(r *http.Request, eventID string) (*EventProgram, error) {
	return h.loadProgramDirect(r, eventID)
}

func (h *ProgramHandler) loadProgramDirect(r *http.Request, eventID string) (*EventProgram, error) {
	prog := &EventProgram{EventID: eventID}

	err := h.db.QueryRowContext(r.Context(),
		`SELECT ep.id, ep.qr_code, ep.updated_at, COALESCE(e.name,'')
		 FROM event_programs ep
		 LEFT JOIN events e ON e.id = ep.event_id
		 WHERE ep.event_id=?`, eventID,
	).Scan(&prog.ID, &prog.QRCode, &prog.UpdatedAt, &prog.EventName)
	if err != nil {
		return nil, err
	}

	rows, err := h.db.QueryContext(r.Context(),
		`SELECT id, time, title, description, location, sort_order
		 FROM program_items WHERE program_id=? ORDER BY sort_order`, prog.ID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var item ProgramItem
		if err := rows.Scan(&item.ID, &item.Time, &item.Title, &item.Description,
			&item.Location, &item.Order); err != nil {
			continue
		}
		prog.Items = append(prog.Items, item)
	}
	if prog.Items == nil {
		prog.Items = []ProgramItem{}
	}
	sort.Slice(prog.Items, func(i, j int) bool {
		return prog.Items[i].Order < prog.Items[j].Order
	})
	return prog, nil
}

func (h *ProgramHandler) publicURL(r *http.Request) string {
	if h.cfg.Server.PublicURL != "" {
		return h.cfg.Server.PublicURL
	}
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	return fmt.Sprintf("%s://%s", scheme, r.Host)
}

func publicPageHTML(prog *EventProgram) string {
	items := ""
	for _, item := range prog.Items {
		loc := ""
		if item.Location != "" {
			loc = fmt.Sprintf(`<span class="loc">📍 %s</span>`, html.EscapeString(item.Location))
		}
		desc := ""
		if item.Description != "" {
			desc = fmt.Sprintf(`<p class="desc">%s</p>`, html.EscapeString(item.Description))
		}
		items += fmt.Sprintf(`
		<div class="item">
			<div class="time">%s</div>
			<div class="content">
				<h3>%s</h3>
				%s%s
			</div>
		</div>`, html.EscapeString(item.Time), html.EscapeString(item.Title), loc, desc)
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Programm – %s</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, sans-serif; background: #0f172a; color: #f1f5f9; min-height: 100vh; }
  header { background: #1e293b; padding: 1.5rem; border-bottom: 2px solid #3b82f6; }
  header h1 { font-size: 1.4rem; color: #f1f5f9; }
  header p { color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem; }
  .items { padding: 1rem; max-width: 640px; margin: 0 auto; }
  .item { display: flex; gap: 1rem; padding: 1rem 0; border-bottom: 1px solid #1e293b; }
  .time { min-width: 3.5rem; font-weight: 700; color: #3b82f6; font-size: 0.9rem; padding-top: 2px; }
  .content h3 { font-size: 1rem; font-weight: 600; color: #f1f5f9; }
  .loc { font-size: 0.8rem; color: #64748b; display: block; margin-top: 0.2rem; }
  .desc { font-size: 0.875rem; color: #94a3b8; margin-top: 0.4rem; }
  footer { text-align: center; padding: 1.5rem; color: #475569; font-size: 0.75rem; }
</style>
</head>
<body>
<header>
  <h1>%s</h1>
  <p>Tagesablauf</p>
</header>
<div class="items">%s</div>
<footer>K.I.T. Solutions · Workmate Event</footer>
</body>
</html>`,
		html.EscapeString(prog.EventName),
		html.EscapeString(prog.EventName),
		items,
	)
}
