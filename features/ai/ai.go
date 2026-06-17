package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"
	"zen/commons/sqlite"
	"zen/commons/utils"
)

type AIConfig struct {
	ConfigID  int       `json:"configId"`
	Name      string    `json:"name"`
	BaseURL   string    `json:"baseUrl"`
	APIKey    string    `json:"apiKey"`
	Model     string    `json:"model"`
	IsDefault bool      `json:"isDefault"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
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
		if envKey != "" || envURL != "" {
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
	ConfigID      int    `json:"configId"`      // 0 = use default
	Instruction   string `json:"instruction"`
	FullContent   string `json:"fullContent"`
	SelectedText  string `json:"selectedText"`
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

	// Build prompt
	prompt := buildPrompt(req.Instruction, req.SelectedText, req.FullContent)

	// Call LLM API
	result, err := callLLM(config, prompt)
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
	BaseURL string `json:"baseUrl"`
	APIKey  string `json:"apiKey"`
}

type ModelInfo struct {
	ID string `json:"id"`
}

type modelsResponse struct {
	Data []ModelInfo `json:"data"`
}

func HandleFetchModels(w http.ResponseWriter, r *http.Request) {
	var req FetchModelsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data.", err, http.StatusBadRequest)
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
	resp, err := client.Do(httpReq)
	if err != nil {
		utils.SendErrorResponse(w, "FETCH_MODELS_FAILED", "Error fetching models.", err, http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
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
		SELECT config_id, name, base_url, api_key, model, is_default, created_at, updated_at
		FROM ai_configs ORDER BY is_default DESC, config_id ASC
	`)
	if err != nil {
		return configs, fmt.Errorf("error querying ai_configs: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var c AIConfig
		var isDefault int
		err = rows.Scan(&c.ConfigID, &c.Name, &c.BaseURL, &c.APIKey, &c.Model, &isDefault, &c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return configs, fmt.Errorf("error scanning ai_config: %w", err)
		}
		c.IsDefault = isDefault == 1
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
		INSERT INTO ai_configs (name, base_url, api_key, model, is_default)
		VALUES (?, ?, ?, ?, ?)
	`, c.Name, c.BaseURL, c.APIKey, c.Model, isDefault)
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
		UPDATE ai_configs SET name = ?, base_url = ?, api_key = ?, model = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
		WHERE config_id = ?
	`, c.Name, c.BaseURL, c.APIKey, c.Model, isDefault, c.ConfigID)
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

	_, _ = tx.Exec("UPDATE ai_configs SET is_default = 0")
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

func resolveConfig(configID int) (AIConfig, error) {
	if configID == 0 {
		// Try database default
		var c AIConfig
		var isDefault int
		err := sqlite.DB.QueryRow(`
			SELECT config_id, name, base_url, api_key, model, is_default, created_at, updated_at
			FROM ai_configs WHERE is_default = 1 LIMIT 1
		`).Scan(&c.ConfigID, &c.Name, &c.BaseURL, &c.APIKey, &c.Model, &isDefault, &c.CreatedAt, &c.UpdatedAt)
		if err == nil {
			c.IsDefault = true
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
	err := sqlite.DB.QueryRow(`
		SELECT config_id, name, base_url, api_key, model, is_default, created_at, updated_at
		FROM ai_configs WHERE config_id = ?
	`, configID).Scan(&c.ConfigID, &c.Name, &c.BaseURL, &c.APIKey, &c.Model, &isDefault, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return c, fmt.Errorf("config not found: %w", err)
	}
	c.IsDefault = isDefault == 1
	return c, nil
}

func buildPrompt(instruction, selectedText, fullContent string) string {
	if selectedText != "" {
		return fmt.Sprintf("用户选中的文本：\n```\n%s\n```\n\n完整笔记内容（供参考）：\n```\n%s\n```\n\n用户指令：%s\n\n请直接输出处理后的内容，不要加额外说明。", selectedText, fullContent, instruction)
	}
	if fullContent != "" {
		return fmt.Sprintf("笔记内容：\n```\n%s\n```\n\n用户指令：%s\n\n请直接输出处理后的内容，不要加额外说明。", fullContent, instruction)
	}
	return fmt.Sprintf("用户指令：%s\n\n请直接输出生成的内容，不要加额外说明。", instruction)
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

func callLLM(config AIConfig, prompt string) (string, error) {
	reqBody := chatRequest{
		Model: config.Model,
		Messages: []chatMessage{
			{Role: "user", Content: prompt},
		},
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return "", fmt.Errorf("error marshaling request: %w", err)
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
	resp, err := client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("error calling LLM API: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("error reading response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("LLM API error: status %d, body: %s", resp.StatusCode, string(body))
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