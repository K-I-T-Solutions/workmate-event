// Package tse implementiert die Kassensicherungsverordnung (KassenSichV) Pflicht
// per Swissbit USB TSE. Im Entwicklungsmodus wird eine Mock-Implementierung genutzt.
package tse

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"sync/atomic"
	"time"
)

// Service definiert das Interface für die TSE-Anbindung.
type Service interface {
	// Sign signiert eine Transaktion und gibt Signatur + Seriennummer zurück.
	Sign(txID string, amount float64, paymentMethod string) (sig SignResult, err error)
	// IsAvailable prüft ob die TSE erreichbar ist.
	IsAvailable() bool
	// SerialNumber gibt die Seriennummer des Geräts zurück.
	SerialNumber() string
}

// SignResult enthält alle TSE-Felder einer signierten Transaktion.
type SignResult struct {
	Signature   string    `json:"signature"`
	Serial      string    `json:"serial"`
	Timestamp   time.Time `json:"timestamp"`
	TxNumber    int64     `json:"tx_number"`
	ProcessType string    `json:"process_type"`
	ProcessData string    `json:"process_data"`
}

// New gibt je nach Konfiguration eine Mock- oder echte Swissbit-TSE zurück.
func New(device string, mock bool) Service {
	if mock {
		return &MockTSE{serial: "MOCK-TSE-DE-001"}
	}
	return &SwissbitTSE{device: device}
}

// --- Mock-Implementierung für Entwicklung / Tests ---

type MockTSE struct {
	serial  string
	counter atomic.Int64
}

func (m *MockTSE) Sign(txID string, amount float64, paymentMethod string) (SignResult, error) {
	n := m.counter.Add(1)
	now := time.Now().UTC()

	processData := fmt.Sprintf("Bon-Anfang;%.2f;%.2f;%s;Bon-Ende", amount, amount, paymentMethod)

	// Deterministischer Mock-Hash aus Transaktions-ID + Betrag + Counter
	raw := fmt.Sprintf("%s|%.2f|%d|%s", txID, amount, n, now.Format(time.RFC3339))
	hash := sha256.Sum256([]byte(raw))
	sig := base64.StdEncoding.EncodeToString(hash[:])

	return SignResult{
		Signature:   sig,
		Serial:      m.serial,
		Timestamp:   now,
		TxNumber:    n,
		ProcessType: "Kassenbeleg-V1",
		ProcessData: processData,
	}, nil
}

func (m *MockTSE) IsAvailable() bool  { return true }
func (m *MockTSE) SerialNumber() string { return m.serial }

// --- Swissbit-Stub für Produktion ---
// Die echte Implementierung erfordert das Swissbit SDK (C-Library via CGO).
// Dokumentation: https://www.swissbit.com/de/produkte/security-products/tse/

type SwissbitTSE struct {
	device string
	serial string
}

func (s *SwissbitTSE) Sign(txID string, amount float64, paymentMethod string) (SignResult, error) {
	// TODO: Swissbit SDK Integration
	// 1. CGO-Bindings für libSBTSE.so laden
	// 2. tse_startTransaction() aufrufen
	// 3. tse_finishTransaction() mit ProcessData aufrufen
	// 4. Signatur, Serial und Counter aus der TSE-Antwort lesen
	//
	// Beispiel ProcessData Format (KassenSichV Anlage):
	//   "Kassenbeleg-V1\nKassenbeleg\n{amount}\n{amount}\n{paymentMethod}"
	return SignResult{}, fmt.Errorf("swissbit SDK nicht konfiguriert – bitte mock: true setzen oder SDK einbinden")
}

func (s *SwissbitTSE) IsAvailable() bool    { return false }
func (s *SwissbitTSE) SerialNumber() string { return s.serial }
