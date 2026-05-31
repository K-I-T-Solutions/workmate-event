package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"github.com/kit-solutions/workmate-event/internal/api"
	"github.com/kit-solutions/workmate-event/internal/db"
	"github.com/kit-solutions/workmate-event/internal/tse"
	"github.com/kit-solutions/workmate-event/internal/ws"
	"github.com/kit-solutions/workmate-event/pkg/config"
)

func main() {
	cfgPath := flag.String("config", "event.yaml", "Pfad zur Konfigurationsdatei")
	flag.Parse()

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		log.Fatalf("config laden: %v", err)
	}

	database, err := db.Open(cfg.DB.Path)
	if err != nil {
		log.Fatalf("datenbank öffnen: %v", err)
	}
	defer database.Close()

	tseSvc := tse.New(cfg.TSE.Device, cfg.TSE.Mock)
	if cfg.TSE.Mock {
		log.Println("TSE: Mock-Modus aktiv (Entwicklung)")
	} else {
		log.Printf("TSE: Swissbit Gerät %s", cfg.TSE.Device)
	}

	hub := ws.NewHub()
	router := api.NewRouter(cfg, database, hub, tseSvc)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Workmate Event Backend läuft auf %s", addr)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("server: %v", err)
	}
}
