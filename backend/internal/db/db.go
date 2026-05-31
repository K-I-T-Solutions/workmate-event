package db

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

func Open(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	db.SetMaxOpenConns(1) // SQLite: single writer
	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}

// addColumn fügt eine Spalte hinzu; Fehler werden ignoriert (Spalte existiert bereits).
func addColumn(db *sql.DB, table, colDef string) {
	db.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s", table, colDef))
}

func migrate(db *sql.DB) error {
	_, err := db.Exec(`
		PRAGMA journal_mode=WAL;
		PRAGMA foreign_keys=ON;

		CREATE TABLE IF NOT EXISTS events (
			id                 TEXT PRIMARY KEY,
			name               TEXT NOT NULL,
			date               DATETIME NOT NULL,
			location           TEXT NOT NULL,
			description        TEXT NOT NULL DEFAULT '',
			capacity           INTEGER NOT NULL DEFAULT 0,
			status             TEXT NOT NULL DEFAULT 'PLANNING',
			organizer_name     TEXT NOT NULL DEFAULT '',
			organizer_email    TEXT NOT NULL DEFAULT '',
			organizer_phone    TEXT NOT NULL DEFAULT '',
			stream_enabled     BOOLEAN NOT NULL DEFAULT 0,
			stream_platform    TEXT NOT NULL DEFAULT '',
			ticketio_event_id  TEXT NOT NULL DEFAULT '',
			ticketio_api_key   TEXT NOT NULL DEFAULT '',
			created_at         DATETIME NOT NULL,
			updated_at         DATETIME NOT NULL
		);

		CREATE TABLE IF NOT EXISTS tickets (
			id           TEXT PRIMARY KEY,
			event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			category     TEXT NOT NULL DEFAULT 'ABENDKASSE',
			price        REAL NOT NULL DEFAULT 0,
			qr_code      TEXT NOT NULL DEFAULT '',
			status       TEXT NOT NULL DEFAULT 'VALID',
			holder_name  TEXT NOT NULL DEFAULT '',
			holder_email TEXT NOT NULL DEFAULT '',
			scanned_at   DATETIME,
			scanned_by   TEXT NOT NULL DEFAULT '',
			source       TEXT NOT NULL DEFAULT 'ABENDKASSE',
			external_id  TEXT NOT NULL DEFAULT '',
			sync_pending BOOLEAN NOT NULL DEFAULT 0,
			created_at   DATETIME NOT NULL
		);

		CREATE TABLE IF NOT EXISTS transactions (
			id             TEXT PRIMARY KEY,
			event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			ticket_id      TEXT NOT NULL DEFAULT '',
			amount         REAL NOT NULL DEFAULT 0,
			payment_method TEXT NOT NULL DEFAULT 'CASH',
			status         TEXT NOT NULL DEFAULT 'PENDING',
			tse_signature  TEXT NOT NULL DEFAULT '',
			tse_serial     TEXT NOT NULL DEFAULT '',
			tse_timestamp  DATETIME,
			sumup_id       TEXT NOT NULL DEFAULT '',
			cashier_id     TEXT NOT NULL DEFAULT '',
			sync_pending   BOOLEAN NOT NULL DEFAULT 0,
			created_at     DATETIME NOT NULL
		);

		CREATE TABLE IF NOT EXISTS equipment (
			id            TEXT PRIMARY KEY,
			name          TEXT NOT NULL,
			category      TEXT NOT NULL DEFAULT 'OTHER',
			status        TEXT NOT NULL DEFAULT 'AVAILABLE',
			serial_number TEXT NOT NULL DEFAULT '',
			notes         TEXT NOT NULL DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS event_equipment (
			id           TEXT PRIMARY KEY,
			event_id     TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			equipment_id TEXT NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
			quantity     INTEGER NOT NULL DEFAULT 1,
			checked_out  BOOLEAN NOT NULL DEFAULT 0,
			checked_in   BOOLEAN NOT NULL DEFAULT 0,
			condition    TEXT NOT NULL DEFAULT 'OK'
		);

		CREATE TABLE IF NOT EXISTS staff_assignments (
			id          TEXT PRIMARY KEY,
			event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			name        TEXT NOT NULL,
			role        TEXT NOT NULL DEFAULT 'EINLASS',
			phone       TEXT NOT NULL DEFAULT '',
			agency      TEXT NOT NULL DEFAULT '',
			hourly_rate REAL NOT NULL DEFAULT 0,
			start_time  DATETIME NOT NULL,
			end_time    DATETIME NOT NULL,
			checked_in  BOOLEAN NOT NULL DEFAULT 0,
			checked_out BOOLEAN NOT NULL DEFAULT 0,
			notes       TEXT NOT NULL DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS event_programs (
			id         TEXT PRIMARY KEY,
			event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
			qr_code    TEXT NOT NULL DEFAULT '',
			updated_at DATETIME NOT NULL
		);

		CREATE TABLE IF NOT EXISTS program_items (
			id          TEXT PRIMARY KEY,
			program_id  TEXT NOT NULL REFERENCES event_programs(id) ON DELETE CASCADE,
			time        TEXT NOT NULL,
			title       TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			location    TEXT NOT NULL DEFAULT '',
			sort_order  INTEGER NOT NULL DEFAULT 0
		);
	`)
	if err != nil {
		return err
	}

	// Migrationen für bestehende DBs (idempotent)
	addColumn(db, "events", "ticketio_event_id TEXT NOT NULL DEFAULT ''")
	addColumn(db, "events", "ticketio_api_key TEXT NOT NULL DEFAULT ''")
	addColumn(db, "tickets", "sync_pending BOOLEAN NOT NULL DEFAULT 0")
	addColumn(db, "staff_assignments", "checkin_at DATETIME")
	addColumn(db, "staff_assignments", "checkout_at DATETIME")

	// Unique Index für Ticket.io Sync (externe IDs)
	_, err = db.Exec(`
		CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_external_id
		ON tickets (event_id, external_id)
		WHERE external_id != '';
	`)
	return err
}
