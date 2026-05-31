package sumup

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const baseURL = "https://api.sumup.com/v0.1"

type Client struct {
	apiKey string
	http   *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 15 * time.Second},
	}
}

type Checkout struct {
	ID               string  `json:"id"`
	CheckoutReference string `json:"checkout_reference"`
	Amount           float64 `json:"amount"`
	Currency         string  `json:"currency"`
	Description      string  `json:"description"`
	Status           string  `json:"status"` // PENDING, PAID, FAILED
	PaymentURL       string  `json:"payment_url,omitempty"`
}

type createCheckoutRequest struct {
	CheckoutReference string  `json:"checkout_reference"`
	Amount            float64 `json:"amount"`
	Currency          string  `json:"currency"`
	Description       string  `json:"description"`
}

// CreateCheckout legt einen neuen SumUp Checkout an und gibt die Payment-URL zurück.
func (c *Client) CreateCheckout(ctx context.Context, ref string, amount float64, desc string) (*Checkout, error) {
	body, _ := json.Marshal(createCheckoutRequest{
		CheckoutReference: ref,
		Amount:            amount,
		Currency:          "EUR",
		Description:       desc,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/checkouts", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sumup unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated && resp.StatusCode != http.StatusOK {
		var e map[string]any
		json.NewDecoder(resp.Body).Decode(&e)
		return nil, fmt.Errorf("sumup error %d: %v", resp.StatusCode, e)
	}

	var co Checkout
	if err := json.NewDecoder(resp.Body).Decode(&co); err != nil {
		return nil, fmt.Errorf("sumup parse: %w", err)
	}
	return &co, nil
}

// GetCheckout gibt den aktuellen Status eines Checkouts zurück.
func (c *Client) GetCheckout(ctx context.Context, checkoutID string) (*Checkout, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		fmt.Sprintf("%s/checkouts/%s", baseURL, checkoutID), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("sumup unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sumup: checkout not found")
	}

	var co Checkout
	if err := json.NewDecoder(resp.Body).Decode(&co); err != nil {
		return nil, err
	}
	return &co, nil
}

// RefundCheckout storniert einen bezahlten Checkout.
func (c *Client) RefundCheckout(ctx context.Context, checkoutID string, amount float64) error {
	body, _ := json.Marshal(map[string]any{
		"amount": amount,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("%s/me/refund/%s", baseURL, checkoutID), bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("sumup unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("sumup refund failed: status %d", resp.StatusCode)
	}
	return nil
}

// WebhookEvent repräsentiert das SumUp Webhook Payload.
type WebhookEvent struct {
	Type        string  `json:"type"` // PAYMENT
	ID          string  `json:"id"`
	Status      string  `json:"status"` // PAID, FAILED
	Amount      float64 `json:"amount"`
	Currency    string  `json:"currency"`
	CheckoutRef string  `json:"checkout_reference"`
}
