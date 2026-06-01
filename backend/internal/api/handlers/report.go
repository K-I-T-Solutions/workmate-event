package handlers

import (
	"bytes"
	"database/sql"
	"fmt"
	"html/template"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

type ReportHandler struct {
	db *sql.DB
}

func NewReportHandler(db *sql.DB) *ReportHandler {
	return &ReportHandler{db: db}
}

type reportTx struct {
	Nr            int
	Time          string
	Amount        string
	PaymentMethod string
	Status        string
	StatusColor   string
	CashierID     string
	TSESignature  string
}

type reportData struct {
	EventName      string
	EventDate      string
	Location       string
	GeneratedAt    string
	TotalRevenue   string
	CashRevenue    string
	CardRevenue    string
	Refunds        string
	TxCount        int
	NetRevenue     string
	TicketsSold    int
	TicketsScanned int
	Transactions   []reportTx
}

var reportTmpl = template.Must(template.New("report").Parse(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bericht – {{.EventName}}</title>
<style>
  @page { margin: 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, Arial, sans-serif; font-size: 12px; color: #1e293b; background: #fff; }
  header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
  header h1 { font-size: 22px; color: #0f172a; }
  header p { color: #64748b; margin-top: 4px; }
  .meta { display: flex; gap: 24px; margin-bottom: 20px; font-size: 11px; color: #475569; }
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
  .stat { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #94a3b8; }
  .stat-value { font-size: 20px; font-weight: 700; margin-top: 2px; }
  .green { color: #059669; }
  .blue  { color: #2563eb; }
  .red   { color: #dc2626; }
  .amber { color: #d97706; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th { background: #f8fafc; text-align: left; padding: 6px 8px; border-bottom: 2px solid #e2e8f0;
       font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #64748b; }
  td { padding: 5px 8px; border-bottom: 1px solid #f1f5f9; }
  tr:hover td { background: #f8fafc; }
  footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0;
           font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
  @media print { body { font-size: 11px; } .stat-value { font-size: 16px; } }
</style>
</head>
<body>
<header>
  <h1>Tagesabschluss – {{.EventName}}</h1>
  <p>Erstellt: {{.GeneratedAt}}</p>
</header>
<div class="meta">
  <span>📅 {{.EventDate}}</span>
  <span>📍 {{.Location}}</span>
  <span>🎫 {{.TicketsSold}} Tickets verkauft · {{.TicketsScanned}} gescannt</span>
</div>
<div class="stats">
  <div class="stat"><div class="stat-label">Gesamtumsatz</div><div class="stat-value amber">{{.TotalRevenue}} €</div></div>
  <div class="stat"><div class="stat-label">Bareinnahmen</div><div class="stat-value green">{{.CashRevenue}} €</div></div>
  <div class="stat"><div class="stat-label">Karteneinnahmen</div><div class="stat-value blue">{{.CardRevenue}} €</div></div>
  <div class="stat"><div class="stat-label">Stornos</div><div class="stat-value red">{{.Refunds}} €</div></div>
  <div class="stat"><div class="stat-label">Transaktionen</div><div class="stat-value">{{.TxCount}}</div></div>
  <div class="stat"><div class="stat-label">Netto</div><div class="stat-value">{{.NetRevenue}} €</div></div>
</div>

<h2 style="font-size:13px;margin-bottom:8px;color:#475569;text-transform:uppercase;letter-spacing:.05em">Transaktionen</h2>
<table>
  <thead>
    <tr>
      <th>#</th><th>Uhrzeit</th><th>Betrag</th><th>Zahlart</th><th>Status</th><th>Kassierer</th><th>TSE-Signatur</th>
    </tr>
  </thead>
  <tbody>
    {{range .Transactions}}
    <tr>
      <td>{{.Nr}}</td>
      <td>{{.Time}}</td>
      <td style="font-weight:600">{{.Amount}} €</td>
      <td>{{.PaymentMethod}}</td>
      <td style="color:{{.StatusColor}}">{{.Status}}</td>
      <td>{{.CashierID}}</td>
      <td style="font-family:monospace;font-size:10px;color:#64748b">{{.TSESignature}}</td>
    </tr>
    {{end}}
  </tbody>
</table>

<footer>
  <span>K.I.T. Solutions · Workmate Event</span>
  <span>KassenSichV-konform · TSE signiert</span>
</footer>
</body>
</html>`))

func (h *ReportHandler) PDF(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")

	var eventName, location string
	var eventDate time.Time
	h.db.QueryRowContext(r.Context(), "SELECT name, date, location FROM events WHERE id=?", eventID).
		Scan(&eventName, &eventDate, &location)
	if eventName == "" {
		http.Error(w, "Event nicht gefunden", http.StatusNotFound)
		return
	}

	rows, err := h.db.QueryContext(r.Context(), `
		SELECT amount, payment_method, status, cashier_id,
		       COALESCE(tse_serial,''), COALESCE(tse_signature,''), created_at
		FROM transactions WHERE event_id=? ORDER BY created_at
	`, eventID)
	if err != nil {
		http.Error(w, "DB Fehler", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var txs []reportTx
	var totalRevenue, cashRevenue, cardRevenue, refunds float64

	i := 0
	for rows.Next() {
		var amount float64
		var method, status, cashier, serial, sig string
		var createdAt time.Time
		if err := rows.Scan(&amount, &method, &status, &cashier, &serial, &sig, &createdAt); err != nil {
			continue
		}
		i++

		statusColor := "#1e293b"
		switch status {
		case "COMPLETED":
			statusColor = "#059669"
		case "REFUNDED":
			statusColor = "#ef4444"
		}

		sigShort := sig
		if len(sigShort) > 12 {
			sigShort = sigShort[:12] + "…"
		}

		txs = append(txs, reportTx{
			Nr:            i,
			Time:          createdAt.Local().Format("15:04:05"),
			Amount:        fmt.Sprintf("%.2f", amount),
			PaymentMethod: method,
			Status:        status,
			StatusColor:   statusColor,
			CashierID:     cashier,
			TSESignature:  sigShort,
		})

		switch status {
		case "COMPLETED":
			totalRevenue += amount
			if method == "CASH" {
				cashRevenue += amount
			} else {
				cardRevenue += amount
			}
		case "REFUNDED":
			refunds += amount
		}
	}

	var ticketsSold, ticketsScanned int
	h.db.QueryRowContext(r.Context(), `
		SELECT
			COALESCE(SUM(CASE WHEN source='ABENDKASSE' THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN status='SCANNED'    THEN 1 ELSE 0 END), 0)
		FROM tickets WHERE event_id=?
	`, eventID).Scan(&ticketsSold, &ticketsScanned)

	data := reportData{
		EventName:      eventName,
		EventDate:      eventDate.Local().Format("02.01.2006"),
		Location:       location,
		GeneratedAt:    time.Now().Local().Format("02.01.2006 15:04"),
		TotalRevenue:   fmt.Sprintf("%.2f", totalRevenue),
		CashRevenue:    fmt.Sprintf("%.2f", cashRevenue),
		CardRevenue:    fmt.Sprintf("%.2f", cardRevenue),
		Refunds:        fmt.Sprintf("%.2f", refunds),
		TxCount:        len(txs),
		NetRevenue:     fmt.Sprintf("%.2f", totalRevenue-refunds),
		TicketsSold:    ticketsSold,
		TicketsScanned: ticketsScanned,
		Transactions:   txs,
	}

	var buf bytes.Buffer
	if err := reportTmpl.Execute(&buf, data); err != nil {
		http.Error(w, "Template Fehler", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="bericht-%s.html"`, eventID[:8]))
	w.Write(buf.Bytes())
}
