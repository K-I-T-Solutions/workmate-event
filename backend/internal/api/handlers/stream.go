package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/kit-solutions/workmate-event/internal/ws"
	"github.com/kit-solutions/workmate-event/pkg/config"
	"github.com/kit-solutions/workmate-event/pkg/obs"
)

type StreamHandler struct {
	cfg *config.Config
	hub *ws.Hub
}

func NewStreamHandler(cfg *config.Config, hub *ws.Hub) *StreamHandler {
	return &StreamHandler{cfg: cfg, hub: hub}
}

func (h *StreamHandler) obsClient() *obs.Client {
	return obs.New(h.cfg.OBS.URL, h.cfg.OBS.Password)
}

func (h *StreamHandler) configured() bool {
	return h.cfg.OBS.URL != ""
}

// Status gibt den aktuellen Stream-Status zurück.
func (h *StreamHandler) Status(w http.ResponseWriter, r *http.Request) {
	if !h.configured() {
		jsonOK(w, map[string]any{"configured": false, "status": nil})
		return
	}
	status, err := h.obsClient().GetStreamStatus()
	if err != nil {
		jsonError(w, "OBS nicht erreichbar: "+err.Error(), http.StatusServiceUnavailable)
		return
	}
	jsonOK(w, map[string]any{"configured": true, "status": status})
}

// Start startet den Stream in OBS.
func (h *StreamHandler) Start(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	if !h.configured() {
		jsonError(w, "OBS nicht konfiguriert", http.StatusServiceUnavailable)
		return
	}
	if err := h.obsClient().StartStream(); err != nil {
		jsonError(w, "Stream starten: "+err.Error(), http.StatusBadGateway)
		return
	}
	h.hub.Broadcast("stream.status", map[string]any{"event_id": eventID, "active": true})
	jsonOK(w, map[string]bool{"started": true})
}

// Stop stoppt den Stream in OBS.
func (h *StreamHandler) Stop(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	if !h.configured() {
		jsonError(w, "OBS nicht konfiguriert", http.StatusServiceUnavailable)
		return
	}
	if err := h.obsClient().StopStream(); err != nil {
		jsonError(w, "Stream stoppen: "+err.Error(), http.StatusBadGateway)
		return
	}
	h.hub.Broadcast("stream.status", map[string]any{"event_id": eventID, "active": false})
	jsonOK(w, map[string]bool{"stopped": true})
}

// Scenes gibt die OBS-Szenenliste zurück.
func (h *StreamHandler) Scenes(w http.ResponseWriter, r *http.Request) {
	if !h.configured() {
		jsonOK(w, map[string]any{"configured": false, "scenes": []any{}, "currentProgramSceneName": ""})
		return
	}
	list, err := h.obsClient().GetSceneList()
	if err != nil {
		jsonError(w, "OBS Szenen: "+err.Error(), http.StatusServiceUnavailable)
		return
	}
	jsonOK(w, list)
}

// SetScene wechselt die aktive OBS-Szene.
func (h *StreamHandler) SetScene(w http.ResponseWriter, r *http.Request) {
	eventID := chi.URLParam(r, "id")
	var body struct {
		Scene string `json:"scene"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Scene == "" {
		jsonError(w, "scene erforderlich", http.StatusBadRequest)
		return
	}
	if !h.configured() {
		jsonError(w, "OBS nicht konfiguriert", http.StatusServiceUnavailable)
		return
	}
	if err := h.obsClient().SetCurrentScene(body.Scene); err != nil {
		jsonError(w, "Szene wechseln: "+err.Error(), http.StatusBadGateway)
		return
	}
	h.hub.Broadcast("stream.scene", map[string]any{"event_id": eventID, "scene": body.Scene})
	jsonOK(w, map[string]string{"scene": body.Scene})
}
