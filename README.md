# Workmate Event

Self-hosted Event-Management-Plattform fuer K.I.T. Solutions.

Workmate Event erweitert den K.I.T.-Stack um die operative Seite von Veranstaltungen: Ticketing, Scanner, Abendkasse, Equipment, Personal, Programm und Livestream-Anbindung.

## Zielbild

Workmate Event schliesst die Luecke zwischen klassischer Event-Organisation und technischer Umsetzung vor Ort.

- `Workmate Live` fokussiert Streaming, OBS und Broadcast-Steuerung
- `Workmate Event` fokussiert Eventbetrieb, Einlass, POS, Equipment und Personal

Beide Systeme sind fachlich eng verwandt und koennen gemeinsame Auth- und Echtzeitmuster nutzen.

## Aktueller Stand

Das Repository enthaelt bereits einen funktionsfaehigen Projektstand mit:

- `Go`-Backend
- `React`-Frontend mit `Vite`
- SQLite-basierter lokaler Datenhaltung
- QR-Scanner-Grundlage fuer Ticket-Workflows
- technischer Spezifikation in `SPECS.md`

## Projektstruktur

| Pfad | Zweck |
| :--- | :--- |
| `backend/` | API, Business-Logik, WebSocket-Hub, Integrationen |
| `backend/cmd/server/main.go` | Einstiegspunkt des Backends |
| `backend/internal/` | Router, Datenbank, Ticketing-, TSE-, SumUp- und WS-Komponenten |
| `backend/event.yaml` | Laufzeitkonfiguration |
| `frontend/` | Web-Frontend fuer Dashboard und Eventbetrieb |
| `frontend/src/` | Seiten fuer Tickets, Scanner, Kasse, Equipment, Staff, Programm, Reporting |
| `SPECS.md` | Fachliche und technische Langspezifikation |

## Features

- Eventverwaltung
- Ticket- und Scan-Workflows
- Abendkasse und Zahlungsprozesse
- Equipment-Zuordnung
- Personalplanung
- Eventprogramm
- Livestream-Anbindung
- Reporting und Abschlussdaten

## Tech-Stack

### Backend

- Go `1.21`
- Chi Router
- JWT
- Gorilla WebSocket
- SQLite
- YAML-Konfiguration

### Frontend

- React `18`
- TypeScript
- Vite
- Tailwind CSS
- `@zxing` fuer QR-/Barcode-Scanner

## Lokaler Start

### Backend

```bash
cd backend
go run ./cmd/server
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Roadmap

Die mittelfristige Ausrichtung laut `SPECS.md` umfasst:

- Ticket.io-Integration
- SumUp-POS-Anbindung
- Swissbit-TSE-Unterstuetzung
- oeffentliche Programmseiten per QR-Code
- OBS- und Livestream-Steuerung im Eventkontext
- PDF- und Abschlussberichte

## Hinweis zum Repository

`backend/event.db`, `event.db-shm` und `event.db-wal` sind lokale Laufzeitdateien und gehoeren nicht ins Versionsmanagement. Fuer GitHub wird das Repository mit passender `.gitignore` vorbereitet.
