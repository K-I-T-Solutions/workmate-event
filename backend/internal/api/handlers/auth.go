package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/kit-solutions/workmate-event/pkg/auth"
	"github.com/kit-solutions/workmate-event/pkg/config"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	cfg *config.Config
}

func NewAuthHandler(cfg *config.Config) *AuthHandler {
	return &AuthHandler{cfg: cfg}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string `json:"token"`
	Role  string `json:"role"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, "invalid request", http.StatusBadRequest)
		return
	}

	for _, u := range h.cfg.Users {
		if u.Username != req.Username {
			continue
		}
		if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)); err != nil {
			break
		}
		token, err := auth.GenerateToken(uuid.NewString(), u.Username, u.Role, h.cfg.Server.JWTSecret)
		if err != nil {
			jsonError(w, "internal error", http.StatusInternalServerError)
			return
		}
		jsonOK(w, loginResponse{Token: token, Role: u.Role})
		return
	}

	jsonError(w, "invalid credentials", http.StatusUnauthorized)
}
