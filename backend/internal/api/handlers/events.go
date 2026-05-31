package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type EventHandler struct {
	db *sql.DB
}

func NewEventHandler(db *sql.DB) *EventHandler {
	return &EventHandler{db: db}
}

type Event struct {
	ID               string    `json:"id"`
	Name             string    `json:"name"`
	Date             time.Time `json:"date"`
	Location         string    `json:"location"`
	Description      string    `json:"description"`
	Capacity         int       `json:"capacity"`
	Status           string    `json:"status"`
	OrganizerName    string    `json:"organizer_name"`
	OrganizerEmail   string    `json:"organizer_email"`
	OrganizerPhone   string    `json:"organizer_phone"`
	StreamEnabled    bool      `json:"stream_enabled"`
	StreamPlatform   string    `json:"stream_platform"`
	TicketIOEventID  string    `json:"ticketio_event_id"`
	TicketIOAPIKey   string    `json:"ticketio_api_key,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

func (h *EventHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, name, date, location, description, capacity, status,
		       organizer_name, organizer_email, organizer_phone,
		       stream_enabled, stream_platform, ticketio_event_id, created_at, updated_at
		FROM events ORDER BY date DESC
	`)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	events := []Event{}
	for rows.Next() {
		var e Event
		if err := rows.Scan(
			&e.ID, &e.Name, &e.Date, &e.Location, &e.Description, &e.Capacity, &e.Status,
			&e.OrganizerName, &e.OrganizerEmail, &e.OrganizerPhone,
			&e.StreamEnabled, &e.StreamPlatform, &e.TicketIOEventID, &e.CreatedAt, &e.UpdatedAt,
		); err != nil {
			jsonError(w, "scan error", http.StatusInternalServerError)
			return
		}
		events = append(events, e)
	}
	jsonOK(w, events)
}

func (h *EventHandler) Create(w http.ResponseWriter, r *http.Request) {
	var e Event
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	e.ID = uuid.NewString()
	e.Status = "PLANNING"
	e.CreatedAt = time.Now().UTC()
	e.UpdatedAt = e.CreatedAt

	_, err := h.db.ExecContext(r.Context(), `
		INSERT INTO events (id, name, date, location, description, capacity, status,
		                    organizer_name, organizer_email, organizer_phone,
		                    stream_enabled, stream_platform,
		                    ticketio_event_id, ticketio_api_key,
		                    created_at, updated_at)
		VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
	`, e.ID, e.Name, e.Date, e.Location, e.Description, e.Capacity, e.Status,
		e.OrganizerName, e.OrganizerEmail, e.OrganizerPhone,
		e.StreamEnabled, e.StreamPlatform,
		e.TicketIOEventID, e.TicketIOAPIKey,
		e.CreatedAt, e.UpdatedAt,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	jsonOK(w, e)
}

func (h *EventHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var e Event
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, name, date, location, description, capacity, status,
		       organizer_name, organizer_email, organizer_phone,
		       stream_enabled, stream_platform,
		       ticketio_event_id, ticketio_api_key,
		       created_at, updated_at
		FROM events WHERE id = ?
	`, id).Scan(
		&e.ID, &e.Name, &e.Date, &e.Location, &e.Description, &e.Capacity, &e.Status,
		&e.OrganizerName, &e.OrganizerEmail, &e.OrganizerPhone,
		&e.StreamEnabled, &e.StreamPlatform,
		&e.TicketIOEventID, &e.TicketIOAPIKey,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, e)
}

func (h *EventHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var patch map[string]any
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	var e Event
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, name, date, location, description, capacity, status,
		       organizer_name, organizer_email, organizer_phone,
		       stream_enabled, stream_platform,
		       ticketio_event_id, ticketio_api_key,
		       created_at, updated_at
		FROM events WHERE id = ?
	`, id).Scan(
		&e.ID, &e.Name, &e.Date, &e.Location, &e.Description, &e.Capacity, &e.Status,
		&e.OrganizerName, &e.OrganizerEmail, &e.OrganizerPhone,
		&e.StreamEnabled, &e.StreamPlatform,
		&e.TicketIOEventID, &e.TicketIOAPIKey,
		&e.CreatedAt, &e.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	// Patch anwenden – nur gelieferte Felder überschreiben
	if v, ok := patch["name"].(string); ok {
		e.Name = v
	}
	if v, ok := patch["location"].(string); ok {
		e.Location = v
	}
	if v, ok := patch["description"].(string); ok {
		e.Description = v
	}
	if v, ok := patch["capacity"].(float64); ok {
		e.Capacity = int(v)
	}
	if v, ok := patch["organizer_name"].(string); ok {
		e.OrganizerName = v
	}
	if v, ok := patch["organizer_email"].(string); ok {
		e.OrganizerEmail = v
	}
	if v, ok := patch["organizer_phone"].(string); ok {
		e.OrganizerPhone = v
	}
	if v, ok := patch["stream_enabled"].(bool); ok {
		e.StreamEnabled = v
	}
	if v, ok := patch["stream_platform"].(string); ok {
		e.StreamPlatform = v
	}
	if v, ok := patch["date"].(string); ok {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			e.Date = t
		}
	}
	if v, ok := patch["ticketio_event_id"].(string); ok {
		e.TicketIOEventID = v
	}
	if v, ok := patch["ticketio_api_key"].(string); ok {
		e.TicketIOAPIKey = v
	}
	e.UpdatedAt = time.Now().UTC()

	_, err = h.db.ExecContext(r.Context(), `
		UPDATE events SET name=?, date=?, location=?, description=?, capacity=?,
		                  organizer_name=?, organizer_email=?, organizer_phone=?,
		                  stream_enabled=?, stream_platform=?,
		                  ticketio_event_id=?, ticketio_api_key=?,
		                  updated_at=?
		WHERE id=?
	`, e.Name, e.Date, e.Location, e.Description, e.Capacity,
		e.OrganizerName, e.OrganizerEmail, e.OrganizerPhone,
		e.StreamEnabled, e.StreamPlatform,
		e.TicketIOEventID, e.TicketIOAPIKey,
		e.UpdatedAt, e.ID,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, e)
}

func (h *EventHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	res, err := h.db.ExecContext(r.Context(), `DELETE FROM events WHERE id = ?`, id)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

var validStatuses = map[string]bool{
	"PLANNING": true, "ACTIVE": true, "COMPLETED": true, "CANCELLED": true,
}

func (h *EventHandler) SetStatus(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || !validStatuses[body.Status] {
		jsonError(w, "invalid status", http.StatusBadRequest)
		return
	}

	res, err := h.db.ExecContext(r.Context(),
		`UPDATE events SET status=?, updated_at=? WHERE id=?`,
		body.Status, time.Now().UTC(), id,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]string{"id": id, "status": body.Status})
}
