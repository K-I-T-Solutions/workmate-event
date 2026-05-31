# Workmate Event – Technical Specification
**K.I.T. Solutions | Kuhrau InformationsTechnik**
Version 1.0 | Mai 2031

---

## 1. Überblick

Workmate Event ist ein self-hosted Event-Management Tool für K.I.T. Solutions.
Es ergänzt Workmate Live (Streaming Automation) um eine vollständige Event-IT-Lösung
für Veranstaltungen von 50 bis 5.000 Personen.

**Abgrenzung zu Workmate Live:**
- Workmate Live → Streaming, OBS, Twitch, CommanderPhu
- Workmate Event → Events, Ticketing, POS, Leihpersonal, Equipment

Beide teilen JWT Auth, WebSocket Hub, Docker Setup und OBS Integration.

---

## 2. Architektur

```
[Browser / React Frontend]
        │ REST + WebSocket
[Go Backend :8090]  ←→  [event.db SQLite + event.yaml]
   │         │         │         │
[Ticket.io] [SumUp] [OBS WS] [Swissbit TSE]

[PWA Mobile App]  ←  Ticket Scanner + Abendkasse
   │
[Go Backend :8090]
```

### 2.1 Komponenten

| Komponente | Technologie | Zweck |
|---|---|---|
| Backend | Go + Chi | REST API, WebSocket, Business Logic |
| Frontend | React + TypeScript + Vite + Tailwind + shadcn/ui | Dashboard WebUI |
| Mobile | React PWA | Scanner, Abendkasse, Vor-Ort |
| Datenbank | SQLite | Lokal, Offline-fähig |
| Auth | JWT | Gleich wie Workmate Live |
| Ticketing | Ticket.io API | Ticketverkauf & Validierung |
| Kartenzahlung | SumUp API | POS Karte |
| TSE | Swissbit USB | Kassensicherung (Pflicht DE) |
| Livestream | OBS Websocket v5 | Stream Steuerung vor Ort |

---

## 3. Datenmodell

### 3.1 Event

```go
type Event struct {
    ID              string    `json:"id"`
    Name            string    `json:"name"`
    Date            time.Time `json:"date"`
    Location        string    `json:"location"`
    Description     string    `json:"description"`
    Capacity        int       `json:"capacity"`
    Status          string    `json:"status"` // PLANNING, ACTIVE, COMPLETED, CANCELLED
    OrganizerName   string    `json:"organizer_name"`
    OrganizerEmail  string    `json:"organizer_email"`
    OrganizerPhone  string    `json:"organizer_phone"`
    StreamEnabled   bool      `json:"stream_enabled"`
    StreamPlatform  string    `json:"stream_platform"` // youtube, twitch, instagram
    CreatedAt       time.Time `json:"created_at"`
    UpdatedAt       time.Time `json:"updated_at"`
}
```

### 3.2 Ticket

```go
type Ticket struct {
    ID              string    `json:"id"`
    EventID         string    `json:"event_id"`
    Category        string    `json:"category"` // VVK, ABENDKASSE, VIP, STAFF
    Price           float64   `json:"price"`
    QRCode          string    `json:"qr_code"`
    Status          string    `json:"status"` // VALID, SCANNED, CANCELLED, REFUNDED
    HolderName      string    `json:"holder_name"`
    HolderEmail     string    `json:"holder_email"`
    ScannedAt       *time.Time `json:"scanned_at"`
    ScannedBy       string    `json:"scanned_by"` // MA-Nr
    Source          string    `json:"source"` // TICKETIO, ABENDKASSE
    ExternalID      string    `json:"external_id"` // Ticket.io ID
    CreatedAt       time.Time `json:"created_at"`
}
```

### 3.3 Transaction (POS / Kasse)

```go
type Transaction struct {
    ID              string    `json:"id"`
    EventID         string    `json:"event_id"`
    TicketID        string    `json:"ticket_id"`
    Amount          float64   `json:"amount"`
    PaymentMethod   string    `json:"payment_method"` // CASH, CARD, QR
    Status          string    `json:"status"` // PENDING, COMPLETED, REFUNDED
    TSESignature    string    `json:"tse_signature"` // Swissbit TSE
    TSESerial       string    `json:"tse_serial"`
    TSETimestamp    time.Time `json:"tse_timestamp"`
    SumUpID         string    `json:"sumup_id"` // falls Kartenzahlung
    CashierID       string    `json:"cashier_id"` // MA-Nr
    CreatedAt       time.Time `json:"created_at"`
}
```

### 3.4 Equipment

```go
type Equipment struct {
    ID          string `json:"id"`
    Name        string `json:"name"`
    Category    string `json:"category"` // NETWORK, AUDIO, DISPLAY, POWER, OTHER
    Status      string `json:"status"` // AVAILABLE, IN_USE, DEFECT
    SerialNumber string `json:"serial_number"`
    Notes       string `json:"notes"`
}

type EventEquipment struct {
    ID          string `json:"id"`
    EventID     string `json:"event_id"`
    EquipmentID string `json:"equipment_id"`
    Quantity    int    `json:"quantity"`
    CheckedOut  bool   `json:"checked_out"`
    CheckedIn   bool   `json:"checked_in"`
    Condition   string `json:"condition"` // OK, DAMAGED
}
```

### 3.5 Leihpersonal

```go
type StaffAssignment struct {
    ID          string    `json:"id"`
    EventID     string    `json:"event_id"`
    Name        string    `json:"name"`
    Role        string    `json:"role"` // EINLASS, KASSE, TECHNIKER, AUFBAU
    Phone       string    `json:"phone"`
    Agency      string    `json:"agency"`
    HourlyRate  float64   `json:"hourly_rate"`
    StartTime   time.Time `json:"start_time"`
    EndTime     time.Time `json:"end_time"`
    CheckedIn   bool      `json:"checked_in"`
    CheckedOut  bool      `json:"checked_out"`
    Notes       string    `json:"notes"`
}
```

### 3.6 Programm / QR

```go
type EventProgram struct {
    ID          string         `json:"id"`
    EventID     string         `json:"event_id"`
    QRCode      string         `json:"qr_code"` // URL zu /program/{event_id}
    Items       []ProgramItem  `json:"items"`
    UpdatedAt   time.Time      `json:"updated_at"`
}

type ProgramItem struct {
    ID          string    `json:"id"`
    Time        string    `json:"time"` // "18:00"
    Title       string    `json:"title"`
    Description string    `json:"description"`
    Location    string    `json:"location"` // z.B. "Hauptbühne"
    Order       int       `json:"order"`
}
```

---

## 4. API Endpoints

### 4.1 Events

```
GET    /api/events              → Liste aller Events
POST   /api/events              → Event anlegen
GET    /api/events/:id          → Event Details
PATCH  /api/events/:id          → Event bearbeiten
DELETE /api/events/:id          → Event löschen
PATCH  /api/events/:id/status   → Status ändern
```

### 4.2 Ticketing

```
GET    /api/events/:id/tickets          → Tickets eines Events
POST   /api/events/:id/tickets          → Ticket anlegen (Abendkasse)
POST   /api/events/:id/tickets/sync     → Sync von Ticket.io
POST   /api/tickets/:qr/scan            → QR-Code scannen + validieren
GET    /api/events/:id/tickets/stats    → Scan-Statistiken live
```

### 4.3 POS / Kasse

```
POST   /api/events/:id/transactions         → Transaktion anlegen
GET    /api/events/:id/transactions         → Alle Transaktionen
GET    /api/events/:id/transactions/report  → Tagesabschluss
POST   /api/transactions/:id/refund         → Stornierung
```

### 4.4 Equipment

```
GET    /api/equipment                   → Equipment Liste
POST   /api/equipment                   → Equipment anlegen
PATCH  /api/equipment/:id               → Equipment bearbeiten
GET    /api/events/:id/equipment        → Equipment für Event
POST   /api/events/:id/equipment        → Equipment zuweisen
PATCH  /api/events/:id/equipment/:id    → Checkout/Checkin
```

### 4.5 Leihpersonal

```
GET    /api/events/:id/staff            → Personal für Event
POST   /api/events/:id/staff            → Personal hinzufügen
PATCH  /api/events/:id/staff/:id        → Checkin/Checkout
DELETE /api/events/:id/staff/:id        → Personal entfernen
```

### 4.6 Programm

```
GET    /api/events/:id/program          → Programm abrufen
POST   /api/events/:id/program          → Programm anlegen/aktualisieren
GET    /program/:event_id               → Öffentliche Programm-Seite (kein Auth)
GET    /api/events/:id/program/qr       → QR-Code generieren
```

### 4.7 Livestream (OBS – geerbt von Workmate Live)

```
GET    /api/events/:id/stream/status    → Stream Status
POST   /api/events/:id/stream/start     → Stream starten
POST   /api/events/:id/stream/stop      → Stream stoppen
GET    /api/events/:id/stream/scenes    → OBS Szenen
POST   /api/events/:id/stream/scene     → Szene wechseln
```

### 4.8 Reporting

```
GET    /api/events/:id/report           → Event Abschlussbericht
GET    /api/events/:id/report/pdf       → PDF Export
```

---

## 5. Ticketing – Ticket.io Integration

### 5.1 Flow

```
Veranstalter legt Event in Ticket.io an
        ↓
K.I.T. trägt Ticket.io Event-ID in Workmate Event ein
        ↓
Workmate Event synct Tickets per API (/tickets/sync)
        ↓
Tickets werden lokal in SQLite gecacht
        ↓
Event-Tag: Scanner (Handy PWA) scannt QR-Code
        ↓
Workmate Event validiert gegen Ticket.io API + lokalen Cache
        ↓
Ticket Status → SCANNED, Timestamp + Cashier gespeichert
```

### 5.2 Offline Fallback

```go
// Wenn Ticket.io API nicht erreichbar:
// 1. Lokalen Cache prüfen
// 2. Wenn Ticket im Cache → validieren
// 3. Scan lokal speichern
// 4. Sync wenn API wieder erreichbar
```

### 5.3 Ticket.io API Calls

```go
// Tickets abrufen
GET https://api.ticket.io/v1/events/{event_id}/tickets
Authorization: Bearer {api_key}

// Ticket validieren
POST https://api.ticket.io/v1/tickets/{ticket_id}/redeem
Authorization: Bearer {api_key}
```

---

## 6. POS – Kasse

### 6.1 TSE – Swissbit USB

**Pflicht in Deutschland seit 01.01.2020 (KassenSichV)**

```go
type TSEService struct {
    SerialNumber string
    Device       string // z.B. "/dev/sdb1"
}

func (t *TSEService) SignTransaction(tx Transaction) (string, error) {
    // Swissbit SDK aufrufen
    // Signature zurückgeben
    // Lokal in SQLite speichern
}
```

**Swissbit USB TSE Setup:**
- Hardware: Swissbit TSE-USB ~250€
- Treiber: Swissbit SDK für Linux
- Jede Transaktion bekommt: Seriennummer + Signatur + Timestamp
- Export: DSFinV-K Format für Finanzamt

### 6.2 SumUp Integration

```go
// SumUp Terminal via Bluetooth oder API
POST https://api.sumup.com/v0.1/checkouts
{
  "checkout_reference": "TX-{uuid}",
  "amount": 10.00,
  "currency": "EUR",
  "description": "Eintritt Benefizabend"
}

// Webhook für Zahlungsbestätigung
POST /api/webhooks/sumup
```

### 6.3 Bargeld Flow

```
Kassierer wählt Ticket-Kategorie
        ↓
Preis wird angezeigt
        ↓
Kassierer gibt Betrag ein
        ↓
TSE signiert Transaktion
        ↓
Ticket QR-Code wird generiert
        ↓
Optional: Druck oder digital senden
```

### 6.4 Tagesabschluss

```go
type DailyReport struct {
    EventID         string
    Date            time.Time
    TotalRevenue    float64
    CashRevenue     float64
    CardRevenue     float64
    TicketsSold     int
    TicketsScanned  int
    Refunds         float64
    TSEExport       string // DSFinV-K
}
```

---

## 7. PWA Mobile App

React PWA – läuft im Browser auf Android/iOS.
Kein App Store nötig – einfach URL aufrufen, auf Homescreen hinzufügen.

### 7.1 Screens

| Screen | Funktion |
|---|---|
| Login | JWT Auth |
| Event auswählen | Liste aktiver Events |
| Scanner | Kamera QR-Code Scan |
| Abendkasse | Ticket verkaufen, Zahlung |
| Status | Live Scan-Statistiken |

### 7.2 Camera Scanner

```typescript
// react-qr-reader oder zxing-js
import { BrowserQRCodeReader } from '@zxing/browser'

const scan = async () => {
  const result = await reader.decodeFromVideoDevice(null, videoEl, callback)
  // POST /api/tickets/{qr}/scan
}
```

---

## 8. WebSocket Events

```go
// Frontend abonniert:
ws.on("ticket.scanned", (data) => { /* Live Counter updaten */ })
ws.on("transaction.completed", (data) => { /* Revenue updaten */ })
ws.on("stream.status", (data) => { /* Stream Indikator */ })
ws.on("staff.checkin", (data) => { /* Personal Board updaten */ })
```

---

## 9. Frontend Seiten

| Seite | Inhalt |
|---|---|
| Dashboard | Event Übersicht, Live Stats |
| Event Detail | Alle Infos, Status ändern |
| Ticketing | Scan-Statistiken, Ticket Liste |
| Kasse | POS Interface, Tagesabschluss |
| Equipment | Checklist Auf/Abbau |
| Personal | Leihpersonal Board |
| Programm | QR-Code, Tagesablauf Editor |
| Livestream | OBS Control, Stream Status |
| Reporting | Abschlussbericht, PDF Export |

---

## 10. Offline Strategie

```
Event startet → alle Tickets sync → lokal in SQLite
        ↓
Internet weg → Scanner läuft weiter gegen lokalen Cache
        ↓
Transaktionen lokal speichern mit sync_pending = true
        ↓
Internet zurück → automatischer Sync
        ↓
Konflikte → Last-Write-Wins + Log
```

---

## 11. Docker Setup

```yaml
# docker-compose.yml
services:
  workmate-event-backend:
    build: ./backend
    ports:
      - "8090:8090"
    volumes:
      - ./data/event.db:/app/event.db
      - /dev/bus/usb:/dev/bus/usb  # Swissbit TSE USB
    networks:
      - core_network

  workmate-event-frontend:
    build: ./frontend
    ports:
      - "3090:3090"
    networks:
      - core_network

networks:
  core_network:
    external: true
```

---

## 12. Shared mit Workmate Live

```go
// pkg/auth → JWT gleich
// pkg/websocket → Hub gleich
// pkg/obs → OBS Websocket gleich
// pkg/config → Config Struktur gleich
```

---

## 13. Implementierungs-Reihenfolge für Claude Code

**Phase 1 – Core:**
- [ ] Go Backend Grundstruktur (Chi Router, SQLite, JWT)
- [ ] Event CRUD
- [ ] WebSocket Hub

**Phase 2 – Ticketing:**
- [ ] Ticket.io API Integration
- [ ] QR-Code Scan Endpoint
- [ ] Offline Cache

**Phase 3 – POS:**
- [ ] Swissbit TSE Integration
- [ ] Bargeld Transaktion
- [ ] SumUp Integration
- [ ] Tagesabschluss Report

**Phase 4 – Operativ:**
- [ ] Equipment Tracking
- [ ] Leihpersonal
- [ ] Programm + QR-Code Generator

**Phase 5 – Frontend:**
- [ ] React PWA (Scanner + Abendkasse)
- [ ] Dashboard WebUI
- [ ] Alle Seiten

**Phase 6 – Integration:**
- [ ] OBS Livestream Control
- [ ] WebSocket Live Stats
- [ ] PDF Report Export

---

## 14. Tech Stack Summary

| Was | Technologie |
|---|---|
| Backend | Go 1.21+, Chi v5 |
| Frontend | React 18, TypeScript, Vite, Tailwind, shadcn/ui |
| Mobile | React PWA, zxing-js |
| Datenbank | SQLite (modernc.org/sqlite) |
| Auth | JWT (golang-jwt) |
| Ticketing | Ticket.io REST API |
| Kartenzahlung | SumUp REST API + Webhooks |
| TSE | Swissbit USB SDK |
| QR-Code | go-qrcode |
| OBS | obs-websocket-go v5 |
| WebSocket | gorilla/websocket |
| Docker | Docker + docker-compose |

---

*K.I.T. Solutions – Workmate Event Spec v1.0*
*Beatusstraße 56, 56073 Koblenz*
*kit-it-koblenz.de*
