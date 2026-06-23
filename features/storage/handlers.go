package storage

import (
	"encoding/json"
	"net/http"
	"zen/commons/utils"
)

func HandleGetConfig(w http.ResponseWriter, r *http.Request) {
	config, err := GetConfig()
	if err != nil {
		utils.SendErrorResponse(w, "STORAGE_CONFIG_FAILED", "Error fetching storage config.", err, http.StatusInternalServerError)
		return
	}

	// Mask secret key in response
	if config.SecretKey != "" {
		config.SecretKey = "***"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(config)
}

func HandleUpdateConfig(w http.ResponseWriter, r *http.Request) {
	var config StorageConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data.", err, http.StatusBadRequest)
		return
	}

	// If secret key is masked, keep the existing one
	if config.SecretKey == "***" {
		existing, err := GetConfig()
		if err != nil {
			utils.SendErrorResponse(w, "STORAGE_CONFIG_FAILED", "Error reading existing config.", err, http.StatusInternalServerError)
			return
		}
		config.SecretKey = existing.SecretKey
	}

	if err := SaveConfig(config); err != nil {
		utils.SendErrorResponse(w, "STORAGE_CONFIG_SAVE_FAILED", "Error saving storage config.", err, http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func HandleTestConnection(w http.ResponseWriter, r *http.Request) {
	var config StorageConfig
	if err := json.NewDecoder(r.Body).Decode(&config); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST_BODY", "Invalid request data.", err, http.StatusBadRequest)
		return
	}

	// If secret key is masked, use the existing one
	if config.SecretKey == "***" {
		existing, err := GetConfig()
		if err != nil {
			utils.SendErrorResponse(w, "STORAGE_CONFIG_FAILED", "Error reading existing config.", err, http.StatusInternalServerError)
			return
		}
		config.SecretKey = existing.SecretKey
	}

	if err := TestS3Connection(config); err != nil {
		utils.SendErrorResponse(w, "STORAGE_TEST_FAILED", err.Error(), err, http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
