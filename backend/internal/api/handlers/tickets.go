package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kit-solutions/workmate-event/internal/ticketio"
	"github.com/kit-solutions/workmate-event/internal/ws"
	"github.com/kit-solutions/workmate-event/pkg/auth"
	qrcode "github.com/skip2/go-qrcode"
)

type TicketHandler struct {
	db  *sql.DB
	hub *ws.Hub
}

func NewTicketHandler(db *sql.DB, hub *ws.Hub) *TicketHandler {
	return &TicketHandler{db: db, hub: hub}
}

type Ticket struct {
	ID          string     `json:"id"`
	EventID     string     `json:"event_id"`
	Category    string     `json:"category"`
	Price       float64    `json:"price"`
	QRCode      string     `json:"qr_code"`
	Status      string     `json:"status"`
	HolderName  string     `json:"holder_name"`
	HolderEmail string     `json:"holder_email"`
	ScannedAt   *time.Time `json:"scanned_at"`
	ScannedBy   string     `json:"scanned_by"`
	Source      string     `json:"source"`
	ExternalID  string     `json:"external_id,omitempty"`
	SyncPending bool       `json:"sync_pending,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
}

type TicketStats struct {
	Total     int     `json:"total"`
	Scanned   int     `json:"scanned"`
	Valid     int     `json:"valid"`
	Cancelled int     `json:"cancelled"`
	Refunded  int     `json:"refunded"`
	Revenue   float64 `json:"revenue"`
}

const ticketScanCols = ` id, event_id, category, price, qr_code, status,
	holder_name, holder_email, scanned_at, scanned_by,
	source, external_id, sync_pending, created_at `

func scanTicket(rows interface{ Scan(...any) error }) (Ticket, error) {
	var t Ticket
	err := rows.Scan(
		&t.ID, &t.EventID, &t.Category, &t.Price, &t.QRCode, &t.Status,
		&t.HolderName, &t.HolderEmail, &t.ScannedAt, &t.ScannedBy,
		&t.Source, &t.ExternalID, &t.SyncPending, &t.CreatedAt,
	)
	return t, err
}

// List gibt alle Tickets eines Events zurück.
func (h *TicketHandler) List(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	rows, err := h.db.QueryContext(r.Context(),
		"SELECT"+ticketScanCols+"FROM tickets WHERE event_id=? ORDER BY created_at DESC", eventID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	tickets := []Ticket{}
	for rows.Next() {
		t, err := scanTicket(rows)
		if err != nil {
			jsonError(w, "scan error", http.StatusInternalServerError)
			return
		}
		tickets = append(tickets, t)
	}
	jsonOK(w, tickets)
}

// Create legt ein neues Abendkasse-Ticket an und gibt QR-Code-Bild zurück.
func (h *TicketHandler) Create(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	claims := auth.FromContext(r)

	var body struct {
		Category    string  `json:"category"`
		Price       float64 `json:"price"`
		HolderName  string  `json:"holder_name"`
		HolderEmail string  `json:"holder_email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.Category == "" {
		body.Category = "ABENDKASSE"
	}

	t := Ticket{
		ID:          uuid.NewString(),
		EventID:     eventID,
		Category:    body.Category,
		Price:       body.Price,
		Status:      "VALID",
		HolderName:  body.HolderName,
		HolderEmail: body.HolderEmail,
		Source:      "ABENDKASSE",
		CreatedAt:   time.Now().UTC(),
	}
	t.QRCode = t.ID // QR-Inhalt = Ticket-UUID

	if claims != nil {
		t.ScannedBy = "" // Noch nicht gescannt
	}

	// QR-Code als PNG generieren
	pngBytes, err := qrcode.Encode(t.QRCode, qrcode.Medium, 256)
	if err != nil {
		jsonError(w, "qr generation failed", http.StatusInternalServerError)
		return
	}
	qrImage := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)

	_, err = h.db.ExecContext(r.Context(), `
		INSERT INTO tickets (id, event_id, category, price, qr_code, status,
		                     holder_name, holder_email, source, created_at)
		VALUES (?,?,?,?,?,?,?,?,?,?)
	`, t.ID, t.EventID, t.Category, t.Price, t.QRCode, t.Status,
		t.HolderName, t.HolderEmail, t.Source, t.CreatedAt,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, map[string]any{"ticket": t, "qr_image": qrImage})
}

// Sync synchronisiert Tickets von Ticket.io in den lokalen Cache.
func (h *TicketHandler) Sync(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	var tioEventID, tioAPIKey string
	err := h.db.QueryRowContext(r.Context(),
		"SELECT ticketio_event_id, ticketio_api_key FROM events WHERE id=?", eventID,
	).Scan(&tioEventID, &tioAPIKey)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "event not found", http.StatusNotFound)
		return
	}
	if tioEventID == "" || tioAPIKey == "" {
		jsonError(w, "ticket.io nicht konfiguriert für dieses Event", http.StatusBadRequest)
		return
	}

	client := ticketio.NewClient(tioAPIKey)
	remoteTickets, err := client.GetEventTickets(r.Context(), tioEventID)
	if err != nil {
		jsonError(w, "ticket.io error: "+err.Error(), http.StatusBadGateway)
		return
	}

	synced, updated := 0, 0
	for _, rt := range remoteTickets {
		status := mapTicketIOStatus(rt.Status)

		res, err := h.db.ExecContext(r.Context(), `
			UPDATE tickets SET status=?, holder_name=?, holder_email=?
			WHERE event_id=? AND external_id=?
		`, status, rt.HolderName, rt.HolderEmail, eventID, rt.ID)
		if err != nil {
			continue
		}

		if n, _ := res.RowsAffected(); n > 0 {
			updated++
			continue
		}

		// Neu anlegen – QR-Code = Ticket.io ID (damit Ticket.io QRs gescannt werden können)
		_, err = h.db.ExecContext(r.Context(), `
			INSERT OR IGNORE INTO tickets
			  (id, event_id, category, price, qr_code, status,
			   holder_name, holder_email, source, external_id, created_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?)
		`, uuid.NewString(), eventID, rt.Category, rt.Price, rt.ID, status,
			rt.HolderName, rt.HolderEmail, "TICKETIO", rt.ID, time.Now().UTC(),
		)
		if err == nil {
			synced++
		}
	}

	jsonOK(w, map[string]any{
		"total":   len(remoteTickets),
		"new":     synced,
		"updated": updated,
	})
}

// Scan validiert einen QR-Code und markiert das Ticket als eingelöst.
func (h *TicketHandler) Scan(w http.ResponseWriter, r *http.Request) {
	qr := chi.URLParam(r, "qr")
	claims := auth.FromContext(r)

	var t Ticket
	err := h.db.QueryRowContext(r.Context(),
		"SELECT"+ticketScanCols+"FROM tickets WHERE qr_code=?", qr,
	).Scan(
		&t.ID, &t.EventID, &t.Category, &t.Price, &t.QRCode, &t.Status,
		&t.HolderName, &t.HolderEmail, &t.ScannedAt, &t.ScannedBy,
		&t.Source, &t.ExternalID, &t.SyncPending, &t.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "ticket not found", http.StatusNotFound)
		return
	}
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	switch t.Status {
	case "SCANNED":
		jsonError(w, "ticket already scanned", http.StatusConflict)
		return
	case "CANCELLED", "REFUNDED":
		jsonError(w, "ticket "+t.Status, http.StatusUnprocessableEntity)
		return
	}

	// Ticket.io Validierung (best-effort, Offline-Fallback)
	syncPending := false
	if t.ExternalID != "" {
		var tioAPIKey string
		h.db.QueryRowContext(r.Context(),
			"SELECT ticketio_api_key FROM events WHERE id=?", t.EventID,
		).Scan(&tioAPIKey)

		if tioAPIKey != "" {
			client := ticketio.NewClient(tioAPIKey)
			if err := client.RedeemTicket(r.Context(), t.ExternalID); err != nil {
				if errors.Is(err, ticketio.ErrAlreadyRedeemed) {
					jsonError(w, "ticket already redeemed at ticket.io", http.StatusConflict)
					return
				}
				// API nicht erreichbar → Offline-Modus
				syncPending = true
			}
		}
	}

	now := time.Now().UTC()
	scannedBy := ""
	if claims != nil {
		scannedBy = claims.Username
	}

	_, err = h.db.ExecContext(r.Context(), `
		UPDATE tickets SET status='SCANNED', scanned_at=?, scanned_by=?, sync_pending=?
		WHERE id=?
	`, now, scannedBy, syncPending, t.ID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	t.Status = "SCANNED"
	t.ScannedAt = &now
	t.ScannedBy = scannedBy
	t.SyncPending = syncPending

	// WebSocket Broadcast
	h.hub.Broadcast("ticket.scanned", map[string]any{
		"ticket_id":  t.ID,
		"event_id":   t.EventID,
		"category":   t.Category,
		"holder":     t.HolderName,
		"scanned_by": scannedBy,
		"scanned_at": now,
	})

	jsonOK(w, map[string]any{
		"ticket":       t,
		"offline_mode": syncPending,
	})
}

// Stats gibt Live-Statistiken für ein Event zurück.
func (h *TicketHandler) Stats(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	var stats TicketStats
	err := h.db.QueryRowContext(r.Context(), `
		SELECT
			COUNT(*) as total,
			SUM(CASE WHEN status='SCANNED'   THEN 1 ELSE 0 END) as scanned,
			SUM(CASE WHEN status='VALID'     THEN 1 ELSE 0 END) as valid,
			SUM(CASE WHEN status='CANCELLED' THEN 1 ELSE 0 END) as cancelled,
			SUM(CASE WHEN status='REFUNDED'  THEN 1 ELSE 0 END) as refunded,
			COALESCE(SUM(price), 0) as revenue
		FROM tickets WHERE event_id=?
	`, eventID).Scan(
		&stats.Total, &stats.Scanned, &stats.Valid,
		&stats.Cancelled, &stats.Refunded, &stats.Revenue,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, stats)
}

// QRImage gibt das QR-Code-Bild für ein Ticket als PNG zurück.
func (h *TicketHandler) QRImage(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")

	var qrContent string
	err := h.db.QueryRowContext(r.Context(),
		"SELECT qr_code FROM tickets WHERE id=?", ticketID,
	).Scan(&qrContent)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	pngBytes, err := qrcode.Encode(qrContent, qrcode.Medium, 256)
	if err != nil {
		jsonError(w, "qr error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/png")
	w.Write(pngBytes)
}

func mapTicketIOStatus(s string) string {
	switch s {
	case "redeemed":
		return "SCANNED"
	case "cancelled":
		return "CANCELLED"
	default:
		return "VALID"
	}
}
