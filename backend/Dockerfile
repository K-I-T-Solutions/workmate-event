FROM golang:1.21-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o workmate-event-backend ./cmd/server

# ---

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /app/workmate-event-backend .

# Config wird per Volume eingebunden – Fallback für lokale Nutzung
COPY event.yaml ./event.yaml.default

EXPOSE 8091

CMD ["./workmate-event-backend", "-config", "event.yaml"]
