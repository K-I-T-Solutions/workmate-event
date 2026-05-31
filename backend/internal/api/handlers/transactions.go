package handlers

import (
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/kit-solutions/workmate-event/internal/sumup"
	"github.com/kit-solutions/workmate-event/internal/tse"
	"github.com/kit-solutions/workmate-event/internal/ws"
	"github.com/kit-solutions/workmate-event/pkg/auth"
	"github.com/kit-solutions/workmate-event/pkg/config"
	qrcode "github.com/skip2/go-qrcode"
)

type TransactionHandler struct {
	db  *sql.DB
	hub *ws.Hub
	tse tse.Service
	cfg *config.Config
}

func NewTransactionHandler(db *sql.DB, hub *ws.Hub, tseSvc tse.Service, cfg *config.Config) *TransactionHandler {
	return &TransactionHandler{db: db, hub: hub, tse: tseSvc, cfg: cfg}
}

type Transaction struct {
	ID            string     `json:"id"`
	EventID       string     `json:"event_id"`
	TicketID      string     `json:"ticket_id"`
	Amount        float64    `json:"amount"`
	PaymentMethod string     `json:"payment_method"`
	Status        string     `json:"status"`
	TSESignature  string     `json:"tse_signature,omitempty"`
	TSESerial     string     `json:"tse_serial,omitempty"`
	TSETimestamp  *time.Time `json:"tse_timestamp,omitempty"`
	SumUpID       string     `json:"sumup_id,omitempty"`
	CashierID     string     `json:"cashier_id"`
	SyncPending   bool       `json:"sync_pending,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
}

type DailyReport struct {
	EventID        string        `json:"event_id"`
	EventName      string        `json:"event_name"`
	Date           time.Time     `json:"date"`
	GeneratedAt    time.Time     `json:"generated_at"`
	TotalRevenue   float64       `json:"total_revenue"`
	CashRevenue    float64       `json:"cash_revenue"`
	CardRevenue    float64       `json:"card_revenue"`
	TicketsSold    int           `json:"tickets_sold"`
	TicketsScanned int           `json:"tickets_scanned"`
	Refunds        float64       `json:"refunds"`
	Transactions   []Transaction `json:"transactions"`
	DSFinVK        string        `json:"dsfinvk_export"`
}

// List gibt alle Transaktionen eines Events zurück.
func (h *TransactionHandler) List(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, event_id, ticket_id, amount, payment_method, status,
		       tse_signature, tse_serial, tse_timestamp, sumup_id, cashier_id, sync_pending, created_at
		FROM transactions WHERE event_id=? ORDER BY created_at DESC
	`, eventID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	txs := []Transaction{}
	for rows.Next() {
		var tx Transaction
		if err := rows.Scan(
			&tx.ID, &tx.EventID, &tx.TicketID, &tx.Amount, &tx.PaymentMethod, &tx.Status,
			&tx.TSESignature, &tx.TSESerial, &tx.TSETimestamp, &tx.SumUpID,
			&tx.CashierID, &tx.SyncPending, &tx.CreatedAt,
		); err != nil {
			jsonError(w, "scan error", http.StatusInternalServerError)
			return
		}
		txs = append(txs, tx)
	}
	jsonOK(w, txs)
}

// Create legt eine neue Transaktion an (Bargeld oder Karte).
// Bei Bargeld: sofort abgeschlossen + TSE signiert.
// Bei Karte: SumUp Checkout angelegt, Status PENDING.
func (h *TransactionHandler) Create(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	claims := auth.FromContext(r)

	var body struct {
		TicketID       string  `json:"ticket_id"`
		TicketCategory string  `json:"ticket_category"`
		TicketPrice    float64 `json:"ticket_price"`
		HolderName     string  `json:"holder_name"`
		HolderEmail    string  `json:"holder_email"`
		Amount         float64 `json:"amount"`
		PaymentMethod  string  `json:"payment_method"` // CASH, CARD
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}
	if body.PaymentMethod != "CASH" && body.PaymentMethod != "CARD" {
		jsonError(w, "payment_method muss CASH oder CARD sein", http.StatusBadRequest)
		return
	}

	cashierID := ""
	if claims != nil {
		cashierID = claims.Username
	}

	// Ticket anlegen oder verlinken
	ticketID := body.TicketID
	var ticketQR string
	if ticketID == "" {
		// Neues Abendkasse-Ticket erstellen
		ticketID = uuid.NewString()
		ticketQR = ticketID
		cat := body.TicketCategory
		if cat == "" {
			cat = "ABENDKASSE"
		}
		_, err := h.db.ExecContext(r.Context(), `
			INSERT INTO tickets (id, event_id, category, price, qr_code, status,
			                     holder_name, holder_email, source, created_at)
			VALUES (?,?,?,?,?,?,?,?,?,?)
		`, ticketID, eventID, cat, body.TicketPrice, ticketQR,
			"VALID", body.HolderName, body.HolderEmail, "ABENDKASSE", time.Now().UTC(),
		)
		if err != nil {
			jsonError(w, "ticket creation failed", http.StatusInternalServerError)
			return
		}
	} else {
		// Bestehendes Ticket prüfen
		var status string
		err := h.db.QueryRowContext(r.Context(),
			"SELECT status, qr_code FROM tickets WHERE id=? AND event_id=?", ticketID, eventID,
		).Scan(&status, &ticketQR)
		if errors.Is(err, sql.ErrNoRows) {
			jsonError(w, "ticket not found", http.StatusNotFound)
			return
		}
		if status != "VALID" {
			jsonError(w, "ticket is not VALID", http.StatusUnprocessableEntity)
			return
		}
	}

	tx := Transaction{
		ID:            uuid.NewString(),
		EventID:       eventID,
		TicketID:      ticketID,
		Amount:        body.Amount,
		PaymentMethod: body.PaymentMethod,
		Status:        "PENDING",
		CashierID:     cashierID,
		CreatedAt:     time.Now().UTC(),
	}

	// In DB speichern (PENDING)
	if _, err := h.db.ExecContext(r.Context(), `
		INSERT INTO transactions (id, event_id, ticket_id, amount, payment_method, status,
		                          cashier_id, created_at)
		VALUES (?,?,?,?,?,?,?,?)
	`, tx.ID, tx.EventID, tx.TicketID, tx.Amount, tx.PaymentMethod, tx.Status,
		tx.CashierID, tx.CreatedAt,
	); err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}

	switch body.PaymentMethod {
	case "CASH":
		result, err := h.completeCash(r, tx, ticketQR, eventID)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		jsonOK(w, result)

	case "CARD":
		result, err := h.initiateCard(r, tx, eventID, body.HolderName)
		if err != nil {
			jsonError(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusCreated)
		jsonOK(w, result)
	}
}

func (h *TransactionHandler) completeCash(r *http.Request, tx Transaction, ticketQR, eventID string) (map[string]any, error) {
	// TSE signieren
	sig, err := h.tse.Sign(tx.ID, tx.Amount, "CASH")
	if err != nil {
		return nil, fmt.Errorf("TSE Fehler: %w", err)
	}

	// Transaktion auf COMPLETED setzen
	_, err = h.db.ExecContext(r.Context(), `
		UPDATE transactions
		SET status='COMPLETED', tse_signature=?, tse_serial=?, tse_timestamp=?
		WHERE id=?
	`, sig.Signature, sig.Serial, sig.Timestamp, tx.ID)
	if err != nil {
		return nil, fmt.Errorf("db update: %w", err)
	}

	tx.Status = "COMPLETED"
	tx.TSESignature = sig.Signature
	tx.TSESerial = sig.Serial
	tx.TSETimestamp = &sig.Timestamp

	// QR-Code Bild für Ticket generieren
	pngBytes, _ := qrcode.Encode(ticketQR, qrcode.Medium, 256)
	qrImage := "data:image/png;base64," + base64.StdEncoding.EncodeToString(pngBytes)

	h.hub.Broadcast("transaction.completed", map[string]any{
		"tx_id":          tx.ID,
		"event_id":       eventID,
		"amount":         tx.Amount,
		"payment_method": "CASH",
		"cashier_id":     tx.CashierID,
	})

	return map[string]any{
		"transaction": tx,
		"tse": map[string]any{
			"signature":    sig.Signature,
			"serial":       sig.Serial,
			"timestamp":    sig.Timestamp,
			"tx_number":    sig.TxNumber,
			"process_type": sig.ProcessType,
			"process_data": sig.ProcessData,
		},
		"qr_image": qrImage,
	}, nil
}

func (h *TransactionHandler) initiateCard(r *http.Request, tx Transaction, eventID, holderName string) (map[string]any, error) {
	if h.cfg.SumUp.APIKey == "" {
		// Kein SumUp konfiguriert → direkt als COMPLETED markieren (Demo-Modus)
		_, _ = h.db.ExecContext(r.Context(),
			"UPDATE transactions SET status='COMPLETED' WHERE id=?", tx.ID)
		tx.Status = "COMPLETED"
		return map[string]any{
			"transaction": tx,
			"note":        "SumUp nicht konfiguriert – Transaktion simuliert abgeschlossen",
		}, nil
	}

	client := sumup.NewClient(h.cfg.SumUp.APIKey)
	checkout, err := client.CreateCheckout(r.Context(),
		"TX-"+tx.ID[:8],
		tx.Amount,
		fmt.Sprintf("Eintritt %s – %s", eventID[:8], holderName),
	)
	if err != nil {
		return nil, fmt.Errorf("SumUp: %w", err)
	}

	_, _ = h.db.ExecContext(r.Context(),
		"UPDATE transactions SET sumup_id=? WHERE id=?", checkout.ID, tx.ID)
	tx.SumUpID = checkout.ID

	return map[string]any{
		"transaction":  tx,
		"checkout_url": checkout.PaymentURL,
		"checkout_id":  checkout.ID,
	}, nil
}

// Refund storniert eine Transaktion.
func (h *TransactionHandler) Refund(w http.ResponseWriter, r *http.Request) {
	txID := chi.URLParam(r, "id")

	var tx Transaction
	err := h.db.QueryRowContext(r.Context(), `
		SELECT id, event_id, ticket_id, amount, payment_method, status, sumup_id, cashier_id, created_at
		FROM transactions WHERE id=?
	`, txID).Scan(
		&tx.ID, &tx.EventID, &tx.TicketID, &tx.Amount, &tx.PaymentMethod,
		&tx.Status, &tx.SumUpID, &tx.CashierID, &tx.CreatedAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		jsonError(w, "transaction not found", http.StatusNotFound)
		return
	}
	if tx.Status == "REFUNDED" {
		jsonError(w, "already refunded", http.StatusConflict)
		return
	}
	if tx.Status != "COMPLETED" {
		jsonError(w, "only COMPLETED transactions can be refunded", http.StatusUnprocessableEntity)
		return
	}

	// Kartenzahlung: SumUp Storno
	if tx.PaymentMethod == "CARD" && tx.SumUpID != "" && h.cfg.SumUp.APIKey != "" {
		client := sumup.NewClient(h.cfg.SumUp.APIKey)
		if err := client.RefundCheckout(r.Context(), tx.SumUpID, tx.Amount); err != nil {
			jsonError(w, "SumUp refund failed: "+err.Error(), http.StatusBadGateway)
			return
		}
	}

	// TSE-Storno signieren (KassenSichV)
	sig, _ := h.tse.Sign(tx.ID+"-STORNO", -tx.Amount, tx.PaymentMethod)

	// Transaktion auf REFUNDED setzen
	_, _ = h.db.ExecContext(r.Context(), `
		UPDATE transactions SET status='REFUNDED', tse_signature=?, tse_serial=?, tse_timestamp=?
		WHERE id=?
	`, sig.Signature, sig.Serial, sig.Timestamp, tx.ID)

	// Ticket zurücksetzen
	_, _ = h.db.ExecContext(r.Context(),
		"UPDATE tickets SET status='REFUNDED' WHERE id=?", tx.TicketID)

	h.hub.Broadcast("transaction.completed", map[string]any{
		"tx_id":    tx.ID,
		"event_id": tx.EventID,
		"amount":   -tx.Amount,
		"status":   "REFUNDED",
	})

	tx.Status = "REFUNDED"
	jsonOK(w, tx)
}

// Report gibt den Tagesabschluss eines Events zurück.
func (h *TransactionHandler) Report(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	var report DailyReport
	report.EventID = eventID
	report.GeneratedAt = time.Now().UTC()

	// Event-Name
	h.db.QueryRowContext(r.Context(), "SELECT name, date FROM events WHERE id=?", eventID).
		Scan(&report.EventName, &report.Date)

	// Transaktionen laden
	rows, err := h.db.QueryContext(r.Context(), `
		SELECT id, event_id, ticket_id, amount, payment_method, status,
		       tse_signature, tse_serial, tse_timestamp, sumup_id, cashier_id, sync_pending, created_at
		FROM transactions WHERE event_id=? ORDER BY created_at
	`, eventID)
	if err != nil {
		jsonError(w, "db error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var tx Transaction
		if err := rows.Scan(
			&tx.ID, &tx.EventID, &tx.TicketID, &tx.Amount, &tx.PaymentMethod, &tx.Status,
			&tx.TSESignature, &tx.TSESerial, &tx.TSETimestamp, &tx.SumUpID,
			&tx.CashierID, &tx.SyncPending, &tx.CreatedAt,
		); err != nil {
			continue
		}
		report.Transactions = append(report.Transactions, tx)

		if tx.Status == "REFUNDED" {
			report.Refunds += tx.Amount
			continue
		}
		if tx.Status != "COMPLETED" {
			continue
		}

		report.TotalRevenue += tx.Amount
		switch tx.PaymentMethod {
		case "CASH":
			report.CashRevenue += tx.Amount
		case "CARD":
			report.CardRevenue += tx.Amount
		}
	}

	// Tickets-Statistiken
	h.db.QueryRowContext(r.Context(), `
		SELECT
			SUM(CASE WHEN source='ABENDKASSE' THEN 1 ELSE 0 END),
			SUM(CASE WHEN status='SCANNED'    THEN 1 ELSE 0 END)
		FROM tickets WHERE event_id=?
	`, eventID).Scan(&report.TicketsSold, &report.TicketsScanned)

	// DSFinV-K Export (vereinfacht – enthält alle KassenSichV-relevanten Felder)
	report.DSFinVK = h.buildDSFinVK(report)

	jsonOK(w, report)
}

// SumUpWebhook verarbeitet eingehende SumUp-Zahlungsbestätigungen.
func (h *TransactionHandler) SumUpWebhook(w http.ResponseWriter, r *http.Request) {
	var event sumup.WebhookEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	// Transaktion per SumUp-ID finden
	var txID, eventID string
	err := h.db.QueryRowContext(r.Context(),
		"SELECT id, event_id FROM transactions WHERE sumup_id=?", event.ID,
	).Scan(&txID, &eventID)
	if errors.Is(err, sql.ErrNoRows) {
		// Unbekannte Zahlung – ignorieren
		w.WriteHeader(http.StatusOK)
		return
	}

	if event.Status == "PAID" {
		sig, _ := h.tse.Sign(txID, event.Amount, "CARD")
		h.db.ExecContext(r.Context(), `
			UPDATE transactions
			SET status='COMPLETED', tse_signature=?, tse_serial=?, tse_timestamp=?
			WHERE id=?
		`, sig.Signature, sig.Serial, sig.Timestamp, txID)

		h.hub.Broadcast("transaction.completed", map[string]any{
			"tx_id":          txID,
			"event_id":       eventID,
			"amount":         event.Amount,
			"payment_method": "CARD",
		})
	}

	w.WriteHeader(http.StatusOK)
}

// buildDSFinVK generiert einen vereinfachten DSFinV-K JSON-Export (Kassabschluss).
func (h *TransactionHandler) buildDSFinVK(r DailyReport) string {
	type dsfinvkTx struct {
		BelegNr     int     `json:"beleg_nr"`
		Datum       string  `json:"datum"`
		Betrag      float64 `json:"betrag"`
		Zahlart     string  `json:"zahlart"`
		Status      string  `json:"status"`
		TSESignatur string  `json:"tse_signatur,omitempty"`
		TSESerial   string  `json:"tse_serial,omitempty"`
	}
	type dsfinvk struct {
		Version        string      `json:"version"`
		KassenID       string      `json:"kassen_id"`
		EventID        string      `json:"event_id"`
		AbschlussDatum string      `json:"abschluss_datum"`
		Waehrung       string      `json:"waehrung"`
		Gesamtumsatz   float64     `json:"gesamtumsatz"`
		Bareinnahmen   float64     `json:"bareinnahmen"`
		Karteneinnahmen float64    `json:"karteneinnahmen"`
		Stornos        float64     `json:"stornos"`
		TSESerial      string      `json:"tse_serial"`
		Belege         []dsfinvkTx `json:"belege"`
	}

	serial := h.tse.SerialNumber()
	belege := make([]dsfinvkTx, 0, len(r.Transactions))
	for i, tx := range r.Transactions {
		belege = append(belege, dsfinvkTx{
			BelegNr:     i + 1,
			Datum:       tx.CreatedAt.Format(time.RFC3339),
			Betrag:      tx.Amount,
			Zahlart:     tx.PaymentMethod,
			Status:      tx.Status,
			TSESignatur: tx.TSESignature,
			TSESerial:   tx.TSESerial,
		})
	}

	export := dsfinvk{
		Version:         "DSFinV-K 2.3 (vereinfacht)",
		KassenID:        "WORKMATE-EVENT-" + r.EventID[:8],
		EventID:         r.EventID,
		AbschlussDatum:  r.GeneratedAt.Format(time.RFC3339),
		Waehrung:        "EUR",
		Gesamtumsatz:    r.TotalRevenue,
		Bareinnahmen:    r.CashRevenue,
		Karteneinnahmen: r.CardRevenue,
		Stornos:         r.Refunds,
		TSESerial:       serial,
		Belege:          belege,
	}

	out, _ := json.MarshalIndent(export, "", "  ")
	return string(out)
}
