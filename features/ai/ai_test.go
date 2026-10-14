package ai

import (
	"encoding/json"
	"testing"
)

func TestAIConfigModelDisplayNameDoesNotReplaceModel(t *testing.T) {
	config := AIConfig{
		Model:            "/models/Qwen2.5-7B-Instruct-Q4_K_M.gguf",
		ModelDisplayName: "本地 Qwen 7B",
	}

	payload, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("marshal config: %v", err)
	}

	var response struct {
		Model            string `json:"model"`
		ModelDisplayName string `json:"modelDisplayName"`
	}
	if err := json.Unmarshal(payload, &response); err != nil {
		t.Fatalf("unmarshal config: %v", err)
	}
	if response.Model != config.Model {
		t.Errorf("model = %q, want %q", response.Model, config.Model)
	}
	if response.ModelDisplayName != config.ModelDisplayName {
		t.Errorf("modelDisplayName = %q, want %q", response.ModelDisplayName, config.ModelDisplayName)
	}
}

func TestValidateBaseURLAllowsOnlyConfiguredInternalHosts(t *testing.T) {
	tests := []struct {
		name    string
		allowed string
		url     string
		wantErr bool
	}{
		{name: "public host", url: "https://api.example.com/v1"},
		{name: "private IP is blocked by default", url: "http://192.168.8.106:8080/v1", wantErr: true},
		{name: "private IP is explicitly allowed", allowed: "192.168.8.106", url: "http://192.168.8.106:8080/v1"},
		{name: "Docker service is blocked by default", url: "http://llama-server:8080/v1", wantErr: true},
		{name: "Docker service is explicitly allowed", allowed: "llama-server", url: "http://llama-server:8080/v1"},
		{name: "localhost is explicitly allowed", allowed: "localhost", url: "http://localhost:8080/v1"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("AI_ALLOWED_HOSTS", test.allowed)
			err := validateBaseURL(test.url)
			if (err != nil) != test.wantErr {
				t.Fatalf("validateBaseURL(%q) error = %v, wantErr %v", test.url, err, test.wantErr)
			}
		})
	}
}
