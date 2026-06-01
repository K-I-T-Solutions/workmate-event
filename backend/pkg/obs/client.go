package obs

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

const dialTimeout = 5 * time.Second

// Client ist ein minimaler OBS WebSocket v5 Client (connect-per-request).
type Client struct {
	url      string
	password string
}

func New(url, password string) *Client {
	return &Client{url: url, password: password}
}

type wsMsg struct {
	Op int             `json:"op"`
	D  json.RawMessage `json:"d"`
}

// connect öffnet die WS-Verbindung und führt den OBS-Handshake durch.
func (c *Client) connect() (*websocket.Conn, error) {
	dialer := websocket.Dialer{HandshakeTimeout: dialTimeout}
	conn, _, err := dialer.Dial(c.url, nil)
	if err != nil {
		return nil, fmt.Errorf("obs dial: %w", err)
	}

	// Op 0: Hello
	conn.SetReadDeadline(time.Now().Add(dialTimeout))
	var hello wsMsg
	if err := conn.ReadJSON(&hello); err != nil {
		conn.Close()
		return nil, fmt.Errorf("obs hello: %w", err)
	}

	var helloData struct {
		RPCVersion     int `json:"rpcVersion"`
		Authentication *struct {
			Challenge string `json:"challenge"`
			Salt      string `json:"salt"`
		} `json:"authentication"`
	}
	if err := json.Unmarshal(hello.D, &helloData); err != nil {
		conn.Close()
		return nil, fmt.Errorf("obs hello parse: %w", err)
	}

	// Op 1: Identify
	identify := map[string]any{
		"rpcVersion":         helloData.RPCVersion,
		"eventSubscriptions": 0,
	}
	if helloData.Authentication != nil && c.password != "" {
		identify["authentication"] = c.buildAuth(helloData.Authentication.Salt, helloData.Authentication.Challenge)
	}
	if err := conn.WriteJSON(wsMsg{Op: 1, D: mustMarshal(identify)}); err != nil {
		conn.Close()
		return nil, fmt.Errorf("obs identify: %w", err)
	}

	// Op 2: Identified
	conn.SetReadDeadline(time.Now().Add(dialTimeout))
	var identified wsMsg
	if err := conn.ReadJSON(&identified); err != nil || identified.Op != 2 {
		conn.Close()
		return nil, fmt.Errorf("obs auth fehlgeschlagen")
	}

	conn.SetReadDeadline(time.Time{}) // reset
	return conn, nil
}

func (c *Client) buildAuth(salt, challenge string) string {
	h1 := sha256.Sum256([]byte(c.password + salt))
	secret := base64.StdEncoding.EncodeToString(h1[:])
	h2 := sha256.Sum256([]byte(secret + challenge))
	return base64.StdEncoding.EncodeToString(h2[:])
}

// request schickt ein OBS-Request (Op 6) und wartet auf die Response (Op 7).
func (c *Client) request(requestType string, requestData any) (json.RawMessage, error) {
	conn, err := c.connect()
	if err != nil {
		return nil, err
	}
	defer conn.Close()

	reqID := uuid.NewString()
	body := map[string]any{
		"requestType": requestType,
		"requestId":   reqID,
	}
	if requestData != nil {
		body["requestData"] = requestData
	}
	if err := conn.WriteJSON(wsMsg{Op: 6, D: mustMarshal(body)}); err != nil {
		return nil, fmt.Errorf("obs request write: %w", err)
	}

	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	for {
		var msg wsMsg
		if err := conn.ReadJSON(&msg); err != nil {
			return nil, fmt.Errorf("obs response: %w", err)
		}
		if msg.Op != 7 {
			continue // Events überspringen
		}
		var resp struct {
			RequestID     string          `json:"requestId"`
			RequestStatus struct {
				Result  bool   `json:"result"`
				Code    int    `json:"code"`
				Comment string `json:"comment"`
			} `json:"requestStatus"`
			ResponseData json.RawMessage `json:"responseData"`
		}
		if err := json.Unmarshal(msg.D, &resp); err != nil {
			return nil, err
		}
		if resp.RequestID != reqID {
			continue
		}
		if !resp.RequestStatus.Result {
			return nil, fmt.Errorf("obs %s (code %d): %s", requestType, resp.RequestStatus.Code, resp.RequestStatus.Comment)
		}
		return resp.ResponseData, nil
	}
}

// --- API-Methoden ---

type StreamStatus struct {
	Active        bool   `json:"outputActive"`
	Reconnecting  bool   `json:"outputReconnecting"`
	Timecode      string `json:"outputTimecode"`
	Duration      int64  `json:"outputDuration"`
	Bytes         int64  `json:"outputBytes"`
	SkippedFrames int    `json:"outputSkippedFrames"`
	TotalFrames   int    `json:"outputTotalFrames"`
}

func (c *Client) GetStreamStatus() (*StreamStatus, error) {
	data, err := c.request("GetStreamStatus", nil)
	if err != nil {
		return nil, err
	}
	var s StreamStatus
	return &s, json.Unmarshal(data, &s)
}

func (c *Client) StartStream() error {
	_, err := c.request("StartStream", nil)
	return err
}

func (c *Client) StopStream() error {
	_, err := c.request("StopStream", nil)
	return err
}

type Scene struct {
	Name  string `json:"sceneName"`
	Index int    `json:"sceneIndex"`
}

type SceneList struct {
	CurrentScene string  `json:"currentProgramSceneName"`
	Scenes       []Scene `json:"scenes"`
}

func (c *Client) GetSceneList() (*SceneList, error) {
	data, err := c.request("GetSceneList", nil)
	if err != nil {
		return nil, err
	}
	var raw struct {
		CurrentProgramSceneName string  `json:"currentProgramSceneName"`
		Scenes                  []Scene `json:"scenes"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}
	return &SceneList{CurrentScene: raw.CurrentProgramSceneName, Scenes: raw.Scenes}, nil
}

func (c *Client) SetCurrentScene(name string) error {
	_, err := c.request("SetCurrentProgramScene", map[string]string{"sceneName": name})
	return err
}

func mustMarshal(v any) json.RawMessage {
	b, _ := json.Marshal(v)
	return b
}
