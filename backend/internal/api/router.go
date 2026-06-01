package api

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/kit-solutions/workmate-event/internal/api/handlers"
	"github.com/kit-solutions/workmate-event/internal/tse"
	"github.com/kit-solutions/workmate-event/internal/ws"
	"github.com/kit-solutions/workmate-event/pkg/auth"
	"github.com/kit-solutions/workmate-event/pkg/config"
)

func NewRouter(cfg *config.Config, db *sql.DB, hub *ws.Hub, tseSvc tse.Service) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	authH   := handlers.NewAuthHandler(cfg)
	eventH  := handlers.NewEventHandler(db)
	ticketH := handlers.NewTicketHandler(db, hub)
	txH     := handlers.NewTransactionHandler(db, hub, tseSvc, cfg)
	equipH  := handlers.NewEquipmentHandler(db, hub)
	staffH  := handlers.NewStaffHandler(db, hub)
	progH   := handlers.NewProgramHandler(db, cfg)
	streamH := handlers.NewStreamHandler(cfg, hub)
	reportH := handlers.NewReportHandler(db)

	// Public
	r.Post("/api/auth/login", authH.Login)
	r.Get("/ws", hub.ServeWS)
	r.Post("/api/webhooks/sumup", txH.SumUpWebhook)
	r.Get("/program/{event_id}", progH.PublicPage)

	// Protected
	r.Group(func(r chi.Router) {
		r.Use(auth.Middleware(cfg.Server.JWTSecret))

		// Events
		r.Get("/api/events", eventH.List)
		r.Post("/api/events", eventH.Create)
		r.Get("/api/events/{id}", eventH.Get)
		r.Patch("/api/events/{id}", eventH.Update)
		r.Delete("/api/events/{id}", eventH.Delete)
		r.Patch("/api/events/{id}/status", eventH.SetStatus)

		// Ticketing
		r.Get("/api/events/{id}/tickets", ticketH.List)
		r.Post("/api/events/{id}/tickets", ticketH.Create)
		r.Post("/api/events/{id}/tickets/sync", ticketH.Sync)
		r.Get("/api/events/{id}/tickets/stats", ticketH.Stats)
		r.Post("/api/tickets/{qr}/scan", ticketH.Scan)
		r.Get("/api/tickets/{id}/qr.png", ticketH.QRImage)

		// POS / Kasse
		r.Get("/api/events/{id}/transactions", txH.List)
		r.Post("/api/events/{id}/transactions", txH.Create)
		r.Get("/api/events/{id}/transactions/report", txH.Report)
		r.Post("/api/transactions/{id}/refund", txH.Refund)

		// Equipment
		r.Get("/api/equipment", equipH.ListAll)
		r.Post("/api/equipment", equipH.Create)
		r.Patch("/api/equipment/{id}", equipH.Update)
		r.Get("/api/events/{id}/equipment", equipH.ListForEvent)
		r.Post("/api/events/{id}/equipment", equipH.AssignToEvent)
		r.Patch("/api/events/{id}/equipment/{eq_id}", equipH.UpdateAssignment)

		// Leihpersonal
		r.Get("/api/events/{id}/staff", staffH.List)
		r.Post("/api/events/{id}/staff", staffH.Add)
		r.Patch("/api/events/{id}/staff/{staff_id}", staffH.Update)
		r.Delete("/api/events/{id}/staff/{staff_id}", staffH.Remove)

		// Programm
		r.Get("/api/events/{id}/program", progH.Get)
		r.Post("/api/events/{id}/program", progH.Upsert)
		r.Get("/api/events/{id}/program/qr", progH.QRCode)

		// Livestream / OBS
		r.Get("/api/events/{id}/stream/status", streamH.Status)
		r.Post("/api/events/{id}/stream/start", streamH.Start)
		r.Post("/api/events/{id}/stream/stop", streamH.Stop)
		r.Get("/api/events/{id}/stream/scenes", streamH.Scenes)
		r.Post("/api/events/{id}/stream/scene", streamH.SetScene)

		// Bericht
		r.Get("/api/events/{id}/report/pdf", reportH.PDF)
	})

	return r
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
