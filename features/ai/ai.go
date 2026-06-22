package ai

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
	"zen/commons/sqlite"
	"zen/commons/utils"
)

type AIConfig struct {
	ConfigID      int       `json:"configId"`
	Name          string    `json:"name"`
	BaseURL       string    `json:"baseUrl"`
	APIKey        string    `json:"apiKey"`
	Model         string    `json:"model"`
	IsDefault     bool      `json:"isDefault"`
	SkipTLSVerify bool      `json:"skipTlsVerify"`
	SystemPrompt  string    `json:"systemPrompt"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

// ─── CRUD Handlers ───

func HandleGetConfigs(w http.ResponseWriter, r *http.Request) {
	configs, err := GetAllConfigs()
	if err != nil {
		utils.SendErrorResponse(w, "AI_CONFIGS_FAILED", "Error fetching AI configs.", err, http.StatusInternalServerError)
		return
	}

	// Add env default if no configs exist
	if len(configs) == 0 {
		envKey := os.Getenv("AI_API_KEY")
		envURL := os.Getenv("AI_BASE_URL")
		envModel := os.Getenv("AI_MODEL")
		if envURL == "" {
			envURL = "https://api.openai.com/v1"
		}
		if envModel == "" {
			envModel = "gpt-4o-mini"
		}
		if envKey != "" {
			configs = []AIConfig{
				{ConfigID: 0, Name: "Default (env)", BaseURL: envURL, APIKey: "***", Model: envModel, IsDefault: true},
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(configs)
}

func HandleCreateConfig(w http.ResponseWriter, r *http.Request) {
	var config AIConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data.", err, http.StatusBadRequest)
		return
	}

	if config.Name == "" || config.BaseURL == "" || config.Model == "" {
		utils.SendErrorResponse(w, "MISSING_FIELDS", "Name, baseUrl and model are required.", nil, http.StatusBadRequest)
		return
	}

	created, err := CreateConfig(config)
	if err != nil {
		utils.SendErrorResponse(w, "AI_CONFIG_CREATE_FAILED", "Error creating AI config.", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(created)
}

func HandleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	configIDStr := r.PathValue("configId")
	configID, err := parseID(configIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_CONFIG_ID", "Invalid config ID.", err, http.StatusBadRequest)
		return
	}

	var config AIConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data.", err, http.StatusBadRequest)
		return
	}

	config.ConfigID = configID
	if err := UpdateConfig(config); err != nil {
		utils.SendErrorResponse(w, "AI_CONFIG_UPDATE_FAILED", "Error updating AI config.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func HandleDeleteConfig(w http.ResponseWriter, r *http.Request) {
	configIDStr := r.PathValue("configId")
	configID, err := parseID(configIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_CONFIG_ID", "Invalid config ID.", err, http.StatusBadRequest)
		return
	}

	if err := DeleteConfig(configID); err != nil {
		utils.SendErrorResponse(w, "AI_CONFIG_DELETE_FAILED", "Error deleting AI config.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func HandleSetDefault(w http.ResponseWriter, r *http.Request) {
	configIDStr := r.PathValue("configId")
	configID, err := parseID(configIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_CONFIG_ID", "Invalid config ID.", err, http.StatusBadRequest)
		return
	}

	if err := SetDefaultConfig(configID); err != nil {
		utils.SendErrorResponse(w, "AI_CONFIG_DEFAULT_FAILED", "Error setting default config.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ─── AI Process Handler ───

type ProcessRequest struct {
	ConfigID      int           `json:"configId"`      // 0 = use default
	Instruction   string        `json:"instruction"`
	Content       string        `json:"content"`
	Messages      []chatMessage `json:"messages"`      // conversation history
}

type ProcessResponse struct {
	Result string `json:"result"`
}

func HandleProcess(w http.ResponseWriter, r *http.Request) {
	var req ProcessRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data.", err, http.StatusBadRequest)
		return
	}

	if req.Instruction == "" {
		utils.SendErrorResponse(w, "MISSING_INSTRUCTION", "Instruction is required.", nil, http.StatusBadRequest)
		return
	}

	// Resolve config
	config, err := resolveConfig(req.ConfigID)
	if err != nil {
		utils.SendErrorResponse(w, "AI_CONFIG_NOT_FOUND", "AI config not found.", err, http.StatusBadRequest)
		return
	}

	// Build prompt (instruction only, content sent separately)
	prompt := buildPrompt(req.Instruction)

	// Call LLM API with conversation history and content
	result, err := callLLM(config, prompt, req.Messages, req.Content)
	if err != nil {
		slog.Error("AI processing failed", "error", err)
		utils.SendErrorResponse(w, "AI_PROCESS_FAILED", "AI processing failed.", err, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(ProcessResponse{Result: result})
}

// ─── Fetch Models ───

type FetchModelsRequest struct {
	BaseURL      string `json:"baseUrl"`
	APIKey       string `json:"apiKey"`
	SkipTLSVerify bool  `json:"skipTlsVerify"`
}

type ModelInfo struct {
	ID string `json:"id"`
}

type modelsResponse struct {
	Data []ModelInfo `json:"data"`
}

const maxResponseBodySize = 10 * 1024 * 1024 // 10MB

func HandleFetchModels(w http.ResponseWriter, r *http.Request) {
	var req FetchModelsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data.", err, http.StatusBadRequest)
		return
	}

	if err := validateBaseURL(req.BaseURL); err != nil {
		utils.SendErrorResponse(w, "INVALID_URL", "Invalid base URL.", err, http.StatusBadRequest)
		return
	}
	url := req.BaseURL + "/models"
	httpReq, err := http.NewRequest("GET", url, nil)
	if err != nil {
		utils.SendErrorResponse(w, "FETCH_MODELS_FAILED", "Error creating request.", err, http.StatusInternalServerError)
		return
	}
	if req.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	if req.SkipTLSVerify {
		client.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		utils.SendErrorResponse(w, "FETCH_MODELS_FAILED", "Error fetching models.", err, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBodySize))
	if err != nil {
		utils.SendErrorResponse(w, "FETCH_MODELS_FAILED", "Error reading response.", err, http.StatusInternalServerError)
		return
	}

	if resp.StatusCode != http.StatusOK {
		utils.SendErrorResponse(w, "FETCH_MODELS_FAILED", fmt.Sprintf("API error: status %d", resp.StatusCode), nil, http.StatusInternalServerError)
		return
	}

	var modelsResp modelsResponse
	if err := json.Unmarshal(body, &modelsResp); err != nil {
		utils.SendErrorResponse(w, "FETCH_MODELS_FAILED", "Error decoding response.", err, http.StatusInternalServerError)
		return
	}

	modelIDs := make([]string, 0, len(modelsResp.Data))
	for _, m := range modelsResp.Data {
		modelIDs = append(modelIDs, m.ID)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(modelIDs)
}

// ─── Database Functions ───

func GetAllConfigs() ([]AIConfig, error) {
	var configs []AIConfig
	rows, err := sqlite.DB.Query(`
		SELECT config_id, name, base_url, api_key, model, is_default, skip_tls_verify, system_prompt, created_at, updated_at
		FROM ai_configs ORDER BY is_default DESC, config_id ASC
	`)
	if err != nil {
		return configs, fmt.Errorf("error querying ai_configs: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var c AIConfig
		var isDefault int
		var skipTLS int
		err = rows.Scan(&c.ConfigID, &c.Name, &c.BaseURL, &c.APIKey, &c.Model, &isDefault, &skipTLS, &c.SystemPrompt, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return configs, fmt.Errorf("error scanning ai_config: %w", err)
		}
		c.IsDefault = isDefault == 1
		c.SkipTLSVerify = skipTLS == 1
		configs = append(configs, c)
	}
	return configs, nil
}

func CreateConfig(c AIConfig) (AIConfig, error) {
	isDefault := 0
	if c.IsDefault {
		// Unset other defaults first
		_, err := sqlite.DB.Exec("UPDATE ai_configs SET is_default = 0")
		if err != nil {
			return c, fmt.Errorf("error unsetting defaults: %w", err)
		}
		isDefault = 1
	}

	result, err := sqlite.DB.Exec(`
		INSERT INTO ai_configs (name, base_url, api_key, model, is_default, skip_tls_verify, system_prompt)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, c.Name, c.BaseURL, c.APIKey, c.Model, isDefault, boolToInt(c.SkipTLSVerify), c.SystemPrompt)
	if err != nil {
		return c, fmt.Errorf("error creating ai_config: %w", err)
	}

	id, _ := result.LastInsertId()
	c.ConfigID = int(id)
	return c, nil
}

func UpdateConfig(c AIConfig) error {
	if c.IsDefault {
		_, err := sqlite.DB.Exec("UPDATE ai_configs SET is_default = 0")
		if err != nil {
			return fmt.Errorf("error unsetting defaults: %w", err)
		}
	}

	isDefault := 0
	if c.IsDefault {
		isDefault = 1
	}

	_, err := sqlite.DB.Exec(`
		UPDATE ai_configs SET name = ?, base_url = ?, api_key = ?, model = ?, is_default = ?, skip_tls_verify = ?, system_prompt = ?, updated_at = CURRENT_TIMESTAMP
		WHERE config_id = ?
	`, c.Name, c.BaseURL, c.APIKey, c.Model, isDefault, boolToInt(c.SkipTLSVerify), c.SystemPrompt, c.ConfigID)
	if err != nil {
		return fmt.Errorf("error updating ai_config: %w", err)
	}
	return nil
}

func DeleteConfig(configID int) error {
	_, err := sqlite.DB.Exec("DELETE FROM ai_configs WHERE config_id = ?", configID)
	if err != nil {
		return fmt.Errorf("error deleting ai_config: %w", err)
	}
	return nil
}

func SetDefaultConfig(configID int) error {
	tx, err := sqlite.DB.Begin()
	if err != nil {
		return fmt.Errorf("error starting transaction: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE ai_configs SET is_default = 0"); err != nil {
		slog.Error("error unsetting defaults", "error", err)
	}
	_, err = tx.Exec("UPDATE ai_configs SET is_default = 1 WHERE config_id = ?", configID)
	if err != nil {
		return fmt.Errorf("error setting default: %w", err)
	}
	return tx.Commit()
}

// ─── Helpers ───

func parseID(s string) (int, error) {
	var id int
	_, err := fmt.Sscanf(s, "%d", &id)
	return id, err
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// validateBaseURL checks that the URL is not pointing to a private/internal IP (SSRF protection).
func validateBaseURL(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}
	host := parsed.Hostname()
	if host == "" || host == "localhost" {
		return fmt.Errorf("invalid host")
	}
	ip := net.ParseIP(host)
	if ip != nil {
		if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
			return fmt.Errorf("private/internal IP addresses are not allowed")
		}
	}
	// Also block common internal hostnames
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".local") || strings.HasSuffix(lower, ".internal") {
		return fmt.Errorf("internal hostnames are not allowed")
	}
	return nil
}

func resolveConfig(configID int) (AIConfig, error) {
	if configID == 0 {
		// Try database default
		var c AIConfig
		var isDefault int
		var skipTLS int
		err := sqlite.DB.QueryRow(`
			SELECT config_id, name, base_url, api_key, model, is_default, skip_tls_verify, system_prompt, created_at, updated_at
			FROM ai_configs WHERE is_default = 1 LIMIT 1
		`).Scan(&c.ConfigID, &c.Name, &c.BaseURL, &c.APIKey, &c.Model, &isDefault, &skipTLS, &c.SystemPrompt, &c.CreatedAt, &c.UpdatedAt)
		if err == nil {
			c.IsDefault = true
			c.SkipTLSVerify = skipTLS == 1
			return c, nil
		}
		// Fallback to env
		envKey := os.Getenv("AI_API_KEY")
		envURL := os.Getenv("AI_BASE_URL")
		envModel := os.Getenv("AI_MODEL")
		if envURL == "" {
			envURL = "https://api.openai.com/v1"
		}
		if envModel == "" {
			envModel = "gpt-4o-mini"
		}
		return AIConfig{Name: "Default (env)", BaseURL: envURL, APIKey: envKey, Model: envModel, IsDefault: true}, nil
	}

	var c AIConfig
	var isDefault int
	var skipTLS int
	err := sqlite.DB.QueryRow(`
		SELECT config_id, name, base_url, api_key, model, is_default, skip_tls_verify, system_prompt, created_at, updated_at
		FROM ai_configs WHERE config_id = ?
	`, configID).Scan(&c.ConfigID, &c.Name, &c.BaseURL, &c.APIKey, &c.Model, &isDefault, &skipTLS, &c.SystemPrompt, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return c, fmt.Errorf("config not found: %w", err)
	}
	c.IsDefault = isDefault == 1
	c.SkipTLSVerify = skipTLS == 1
	return c, nil
}

func buildPrompt(instruction string) string {
	return fmt.Sprintf("<user_instruction>%s</user_instruction>", instruction)
}

// ─── LLM API Call ───

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []chatMessage `json:"messages"`
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatResponse struct {
	Choices []struct {
		Message chatMessage `json:"message"`
	} `json:"choices"`
}

func callLLM(config AIConfig, prompt string, history []chatMessage, content string) (string, error) {
	systemPrompt := "You are a helpful assistant. Provide detailed, well-structured responses. Use markdown formatting when appropriate."
	if config.SystemPrompt != "" {
		systemPrompt = config.SystemPrompt
	}

	messages := []chatMessage{
		{Role: "system", Content: systemPrompt},
	}

	// Embed content as context only once (first message carries content)
	if content != "" {
		messages = append(messages, chatMessage{
			Role:    "user",
			Content: fmt.Sprintf("<content>\n%s\n</content>", content),
		})
		messages = append(messages, chatMessage{
			Role:    "assistant",
			Content: "I've received the content. I'll use it as context for our conversation.",
		})
	}

	// Append conversation history
	messages = append(messages, history...)

	// Append current instruction
	messages = append(messages, chatMessage{Role: "user", Content: prompt})

	reqBody := chatRequest{
		Model:    config.Model,
		Messages: messages,
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("error marshaling request: %w", err)
	}

	if err := validateBaseURL(config.BaseURL); err != nil {
		return "", fmt.Errorf("invalid base URL: %w", err)
	}
	url := config.BaseURL + "/chat/completions"
	httpReq, err := http.NewRequest("POST", url, bytes.NewBuffer(payload))
	if err != nil {
		return "", fmt.Errorf("error creating request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if config.APIKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+config.APIKey)
	}

	client := &http.Client{Timeout: 5 * time.Minute}
	if config.SkipTLSVerify {
		client.Transport = &http.Transport{
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		}
	}
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("error calling LLM API: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBodySize))
	if err != nil {
		return "", fmt.Errorf("error reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		slog.Error("LLM API error", "status", resp.StatusCode, "body", string(body))
		return "", fmt.Errorf("LLM API error: status %d", resp.StatusCode)
	}

	var chatResp chatResponse
	if err := json.Unmarshal(body, &chatResp); err != nil {
		return "", fmt.Errorf("error decoding response: %w", err)
	}

	if len(chatResp.Choices) == 0 {
		return "", fmt.Errorf("LLM API returned no choices")
	}

	return chatResp.Choices[0].Message.Content, nil
}