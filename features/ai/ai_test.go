package ai

import "testing"

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
