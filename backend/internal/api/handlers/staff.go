package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kit-solutions/workmate-event/internal/ws"
)

type StaffHandler struct {
	db  *sql.DB
	hub *ws.Hub
}

func NewStaffHandler(db *sql.DB, hub *ws.Hub) *StaffHandler {
	return &StaffHandler{db: db, hub: hub}
}

type StaffAssignment struct {
	ID         string     `json:"id"`
	EventID    string     `json:"event_id"`
	Name       string     `json:"name"`
	Role       string     `json:"role"` // EINLASS, KASSE, TECHNIKER, AUFBAU
	Phone      string     `json:"phone"`
	Agency     string     `json:"agency"`
	HourlyRate float64    `json:"hourly_rate"`
	StartTime  time.Time  `json:"start_time"`
	EndTime    time.Time  `json:"end_time"`
	CheckedIn  bool       `json:"checked_in"`
	CheckedOut bool       `json:"checked_out"`
	CheckInAt  *time.Time `json:"checkin_at,omitempty"`
	CheckOutAt *time.Time `json:"checkout_at,omitempty"`
	Notes      string     `json:"notes"`
}

// List gibt alle Personalzuweisungen für ein Event zurück.
func (h *StaffHandler) List(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, event_id, name, role, phone, agency, hourly_rate,
		       start_time, end_time, checked_in, checked_out,
		       checkin_at, checkout_at, notes
		FROM staff_assignments WHERE event_id=? ORDER BY role, name
	`, eventID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	staff := []StaffAssignment{}
	for rows.Next() {
		var s StaffAssignment
		if err := rows.Scan(
			&s.ID, &s.EventID, &s.Name, &s.Role, &s.Phone, &s.Agency, &s.HourlyRate,
			&s.StartTime, &s.EndTime, &s.CheckedIn, &s.CheckedOut,
			&s.CheckInAt, &s.CheckOutAt, &s.Notes,
		); err != nil {
			jsonError(w, "scan error", http.StatusInternalServerError)
			return
		}
		staff = append(staff, s)
	}
	jsonOK(w, staff)
}

// Add fügt eine Personalzuweisung zu einem Event hinzu.
func (h *StaffHandler) Add(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	var s StaffAssignment
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if s.Role == "" {
		s.Role = "EINLASS"
	}
	s.ID = uuid.NewString()
	s.EventID = eventID

	_, err := h.db.ExecContext(r.Context(), `
		INSERT INTO staff_assignments
		  (id, event_id, name, role, phone, agency, hourly_rate,
		   start_time, end_time, notes)
		VALUES (?,?,?,?,?,?,?,?,?,?)
	`, s.ID, s.EventID, s.Name, s.Role, s.Phone, s.Agency, s.HourlyRate,
		s.StartTime, s.EndTime, s.Notes,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, s)
}

// Update setzt Checkin/Checkout oder bearbeitet Personal-Daten.
func (h *StaffHandler) Update(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	staffID := chi.URLParam(r, "staff_id")

	var s StaffAssignment
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, event_id, name, role, phone, agency, hourly_rate,
		       start_time, end_time, checked_in, checked_out,
		       checkin_at, checkout_at, notes
		FROM staff_assignments WHERE id=? AND event_id=?
	`, staffID, eventID).Scan(
		&s.ID, &s.EventID, &s.Name, &s.Role, &s.Phone, &s.Agency, &s.HourlyRate,
		&s.StartTime, &s.EndTime, &s.CheckedIn, &s.CheckedOut,
		&s.CheckInAt, &s.CheckOutAt, &s.Notes,
	)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	var patch map[string]any
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	now := time.Now().UTC()

	if v, ok := patch["checked_in"].(bool); ok {
		s.CheckedIn = v
		if v && s.CheckInAt == nil {
			s.CheckInAt = &now
			h.hub.Broadcast("staff.checkin", map[string]any{
				"staff_id": s.ID,
				"event_id": s.EventID,
				"name":     s.Name,
				"role":     s.Role,
				"action":   "checkin",
			})
		}
	}
	if v, ok := patch["checked_out"].(bool); ok {
		s.CheckedOut = v
		if v && s.CheckOutAt == nil {
			s.CheckOutAt = &now
			h.hub.Broadcast("staff.checkin", map[string]any{
				"staff_id": s.ID,
				"event_id": s.EventID,
				"name":     s.Name,
				"role":     s.Role,
				"action":   "checkout",
			})
		}
	}
	if v, ok := patch["notes"].(string); ok {
		s.Notes = v
	}
	if v, ok := patch["phone"].(string); ok {
		s.Phone = v
	}
	if v, ok := patch["hourly_rate"].(float64); ok {
		s.HourlyRate = v
	}

	_, err = h.db.ExecContext(r.Context(), `
		UPDATE staff_assignments
		SET checked_in=?, checked_out=?, checkin_at=?, checkout_at=?, notes=?, phone=?, hourly_rate=?
		WHERE id=?
	`, s.CheckedIn, s.CheckedOut, s.CheckInAt, s.CheckOutAt, s.Notes, s.Phone, s.HourlyRate, s.ID,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, s)
}

// Remove entfernt eine Personalzuweisung.
func (h *StaffHandler) Remove(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	staffID := chi.URLParam(r, "staff_id")

	res, err := h.db.ExecContext(r.Context(),
		`DELETE FROM staff_assignments WHERE id=? AND event_id=?`, staffID, eventID)
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
