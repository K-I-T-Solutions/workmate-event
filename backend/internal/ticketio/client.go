package ticketio

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const baseURL = "https://api.ticket.io/v1"

type Client struct {
	apiKey string
	http   *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 10 * time.Second},
	}
}

type Ticket struct {
	ID          string  `json:"id"`
	Status      string  `json:"status"` // valid, redeemed, cancelled
	Category    string  `json:"category"`
	Price       float64 `json:"price"`
	HolderName  string  `json:"holder_name"`
	HolderEmail string  `json:"holder_email"`
}

type redeemError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// GetEventTickets ruft alle Tickets eines Events von Ticket.io ab.
func (c *Client) GetEventTickets(ctx context.Context, eventID string) ([]Ticket, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/events/%s/tickets", baseURL, eventID), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ticket.io unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ticket.io: status %d", resp.StatusCode)
	}

	var result struct {
		Data []Ticket `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("ticket.io parse: %w", err)
	}
	return result.Data, nil
}

// RedeemTicket markiert ein Ticket bei Ticket.io als eingelöst.
// Gibt ErrAlreadyRedeemed zurück wenn das Ticket bereits gescannt wurde.
func (c *Client) RedeemTicket(ctx context.Context, ticketID string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/tickets/%s/redeem", baseURL, ticketID),
		strings.NewReader("{}"))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("ticket.io unreachable: %w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK, http.StatusNoContent:
		return nil
	case http.StatusConflict:
		return ErrAlreadyRedeemed
	default:
		var e redeemError
		json.NewDecoder(resp.Body).Decode(&e)
		return fmt.Errorf("ticket.io redeem failed: %s", e.Message)
	}
}

// Ping prüft ob die Ticket.io API erreichbar ist.
func (c *Client) Ping(ctx context.Context) bool {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/ping", nil)
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	resp, err := c.http.Do(req)
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode < 500
}

var ErrAlreadyRedeemed = fmt.Errorf("ticket already redeemed")
