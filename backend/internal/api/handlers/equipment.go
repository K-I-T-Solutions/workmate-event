package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kit-solutions/workmate-event/internal/ws"
)

type EquipmentHandler struct {
	db  *sql.DB
	hub *ws.Hub
}

func NewEquipmentHandler(db *sql.DB, hub *ws.Hub) *EquipmentHandler {
	return &EquipmentHandler{db: db, hub: hub}
}

type Equipment struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Category     string `json:"category"` // NETWORK, AUDIO, DISPLAY, POWER, OTHER
	Status       string `json:"status"`   // AVAILABLE, IN_USE, DEFECT
	SerialNumber string `json:"serial_number"`
	Notes        string `json:"notes"`
}

type EventEquipment struct {
	ID           string `json:"id"`
	EventID      string `json:"event_id"`
	EquipmentID  string `json:"equipment_id"`
	Quantity     int    `json:"quantity"`
	CheckedOut   bool   `json:"checked_out"`
	CheckedIn    bool   `json:"checked_in"`
	Condition    string `json:"condition"` // OK, DAMAGED
	// Joins
	Name         string `json:"name,omitempty"`
	Category     string `json:"category,omitempty"`
	SerialNumber string `json:"serial_number,omitempty"`
	EqStatus     string `json:"equipment_status,omitempty"`
}

// ListAll gibt den gesamten Equipment-Bestand zurück.
func (h *EquipmentHandler) ListAll(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.QueryContext(r.Context(),
		`SELECT id, name, category, status, serial_number, notes FROM equipment ORDER BY category, name`)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []Equipment{}
	for rows.Next() {
		var e Equipment
		if err := rows.Scan(&e.ID, &e.Name, &e.Category, &e.Status, &e.SerialNumber, &e.Notes); err != nil {
			jsonError(w, "scan error", http.StatusInternalServerError)
			return
		}
		items = append(items, e)
	}
	jsonOK(w, items)
}

// Create legt neues Equipment an.
func (h *EquipmentHandler) Create(w http.ResponseWriter, r *http.Request) {
	var e Equipment
	if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if e.Category == "" {
		e.Category = "OTHER"
	}
	if e.Status == "" {
		e.Status = "AVAILABLE"
	}
	e.ID = uuid.NewString()

	_, err := h.db.ExecContext(r.Context(),
		`INSERT INTO equipment (id, name, category, status, serial_number, notes) VALUES (?,?,?,?,?,?)`,
		e.ID, e.Name, e.Category, e.Status, e.SerialNumber, e.Notes,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, e)
}

// Update bearbeitet ein Equipment-Element (Name, Status, Notizen).
func (h *EquipmentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var e Equipment
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id, name, category, status, serial_number, notes FROM equipment WHERE id=?`, id,
	).Scan(&e.ID, &e.Name, &e.Category, &e.Status, &e.SerialNumber, &e.Notes)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	var patch map[string]any
	if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if v, ok := patch["name"].(string); ok {
		e.Name = v
	}
	if v, ok := patch["category"].(string); ok {
		e.Category = v
	}
	if v, ok := patch["status"].(string); ok {
		e.Status = v
	}
	if v, ok := patch["serial_number"].(string); ok {
		e.SerialNumber = v
	}
	if v, ok := patch["notes"].(string); ok {
		e.Notes = v
	}

	_, err = h.db.ExecContext(r.Context(),
		`UPDATE equipment SET name=?, category=?, status=?, serial_number=?, notes=? WHERE id=?`,
		e.Name, e.Category, e.Status, e.SerialNumber, e.Notes, e.ID,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, e)
}

// ListForEvent gibt Equipment-Zuweisungen für ein Event zurück (mit Equipment-Details).
func (h *EquipmentHandler) ListForEvent(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT ee.id, ee.event_id, ee.equipment_id, ee.quantity,
		       ee.checked_out, ee.checked_in, ee.condition,
		       e.name, e.category, e.serial_number, e.status
		FROM event_equipment ee
		JOIN equipment e ON e.id = ee.equipment_id
		WHERE ee.event_id = ?
		ORDER BY e.category, e.name
	`, eventID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := []EventEquipment{}
	for rows.Next() {
		var ee EventEquipment
		if err := rows.Scan(
			&ee.ID, &ee.EventID, &ee.EquipmentID, &ee.Quantity,
			&ee.CheckedOut, &ee.CheckedIn, &ee.Condition,
			&ee.Name, &ee.Category, &ee.SerialNumber, &ee.EqStatus,
		); err != nil {
			jsonError(w, "scan error", http.StatusInternalServerError)
			return
		}
		items = append(items, ee)
	}
	jsonOK(w, items)
}

// AssignToEvent weist Equipment einem Event zu.
func (h *EquipmentHandler) AssignToEvent(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	var body struct {
		EquipmentID string `json:"equipment_id"`
		Quantity    int    `json:"quantity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.EquipmentID == "" {
		jsonError(w, "equipment_id erforderlich", http.StatusBadRequest)
		return
	}
	if body.Quantity <= 0 {
		body.Quantity = 1
	}

	ee := EventEquipment{
		ID:          uuid.NewString(),
		EventID:     eventID,
		EquipmentID: body.EquipmentID,
		Quantity:    body.Quantity,
		Condition:   "OK",
	}
	_, err := h.db.ExecContext(r.Context(),
		`INSERT INTO event_equipment (id, event_id, equipment_id, quantity, condition) VALUES (?,?,?,?,?)`,
		ee.ID, ee.EventID, ee.EquipmentID, ee.Quantity, ee.Condition,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonOK(w, ee)
}

// UpdateAssignment setzt Checkout/Checkin Status und Zustand.
func (h *EquipmentHandler) UpdateAssignment(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	eqID := chi.URLParam(r, "eq_id")

	var body struct {
		CheckedOut *bool  `json:"checked_out"`
		CheckedIn  *bool  `json:"checked_in"`
		Condition  string `json:"condition"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	var ee EventEquipment
	err := h.db.QueryRowContext(r.Context(),
		`SELECT id, equipment_id, checked_out, checked_in, condition FROM event_equipment WHERE id=? AND event_id=?`,
		eqID, eventID,
	).Scan(&ee.ID, &ee.EquipmentID, &ee.CheckedOut, &ee.CheckedIn, &ee.Condition)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "not found", http.StatusNotFound)
		return
	}

	// Condition zuerst anwenden, damit Checkin-Logik den neuen Zustand sieht
	if body.Condition != "" {
		ee.Condition = body.Condition
	}
	if body.CheckedOut != nil {
		ee.CheckedOut = *body.CheckedOut
		if ee.CheckedOut {
			h.db.ExecContext(r.Context(), `UPDATE equipment SET status='IN_USE' WHERE id=?`, ee.EquipmentID)
		}
	}
	if body.CheckedIn != nil {
		ee.CheckedIn = *body.CheckedIn
		if ee.CheckedIn {
			newStatus := "AVAILABLE"
			if ee.Condition == "DAMAGED" {
				newStatus = "DEFECT"
			}
			h.db.ExecContext(r.Context(), `UPDATE equipment SET status=? WHERE id=?`, newStatus, ee.EquipmentID)
		}
	}

	_, err = h.db.ExecContext(r.Context(),
		`UPDATE event_equipment SET checked_out=?, checked_in=?, condition=? WHERE id=?`,
		ee.CheckedOut, ee.CheckedIn, ee.Condition, ee.ID,
	)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	jsonOK(w, ee)
}
