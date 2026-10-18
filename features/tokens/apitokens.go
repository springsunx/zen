package tokens

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"zen/commons/utils"
)

type CreateTokenRequest struct {
	Name   string  `json:"name"`
	Scopes []Scope `json:"scopes"`
}

type CreateTokenResponse struct {
	Token     string   `json:"token"`
	TokenInfo APIToken `json:"tokenInfo"`
}

func HandleGetAPITokens(w http.ResponseWriter, r *http.Request) {
	apiTokens, err := GetAllAPITokens()
	if err != nil {
		utils.SendErrorResponse(w, "API_TOKENS_FETCH_FAILED", "Error fetching API tokens.", err, http.StatusInternalServerError)
		return
	}

	utils.SendJSON(w, http.StatusOK, apiTokens)
}

func HandleCreateAPIToken(w http.ResponseWriter, r *http.Request) {
	req, ok := decodeAndValidateTokenRequest(w, r, "API_TOKEN_CREATE_FAILED")
	if !ok {
		return
	}

	plainToken, tokenInfo, err := CreateAPIToken(strings.TrimSpace(req.Name), req.Scopes)
	if err != nil {
		utils.SendErrorResponse(w, "API_TOKEN_CREATE_FAILED", "Error creating API token.", err, http.StatusInternalServerError)
		return
	}

	response := CreateTokenResponse{
		Token:     plainToken,
		TokenInfo: tokenInfo,
	}

	utils.SendJSON(w, http.StatusOK, response)
}

func HandleUpdateAPIToken(w http.ResponseWriter, r *http.Request) {
	tokenID, err := strconv.Atoi(r.PathValue("tokenId"))
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_TOKEN_ID", "Invalid token ID.", err, http.StatusBadRequest)
		return
	}

	req, ok := decodeAndValidateTokenRequest(w, r, "API_TOKEN_UPDATE_FAILED")
	if !ok {
		return
	}

	tokenInfo, err := UpdateAPIToken(tokenID, strings.TrimSpace(req.Name), req.Scopes)
	if err != nil {
		if errors.Is(err, utils.ErrNotFound) {
			utils.SendErrorResponse(w, "API_TOKEN_NOT_FOUND", "API token not found.", err, http.StatusNotFound)
			return
		}
		utils.SendErrorResponse(w, "API_TOKEN_UPDATE_FAILED", "Error updating API token.", err, http.StatusInternalServerError)
		return
	}

	utils.SendJSON(w, http.StatusOK, tokenInfo)
}

func decodeAndValidateTokenRequest(w http.ResponseWriter, r *http.Request, operationErrorCode string) (CreateTokenRequest, bool) {
	var req CreateTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		utils.SendErrorResponse(w, "INVALID_REQUEST", "Invalid request body.", err, http.StatusBadRequest)
		return req, false
	}

	if strings.TrimSpace(req.Name) == "" {
		utils.SendErrorResponse(w, "INVALID_TOKEN_NAME", "Token name is required.", nil, http.StatusBadRequest)
		return req, false
	}
	if len(req.Scopes) == 0 {
		utils.SendErrorResponse(w, "INVALID_TOKEN_SCOPES", "At least one access grant is required.", nil, http.StatusBadRequest)
		return req, false
	}

	seenTagIDs := map[int]bool{}
	for _, scope := range req.Scopes {
		if !scope.CanRead {
			utils.SendErrorResponse(w, "INVALID_TOKEN_SCOPES", "Each access grant needs read permission.", nil, http.StatusBadRequest)
			return req, false
		}
		if scope.TagID < 0 {
			utils.SendErrorResponse(w, "INVALID_TAG_ID", "Invalid tag.", nil, http.StatusBadRequest)
			return req, false
		}
		if seenTagIDs[scope.TagID] {
			utils.SendErrorResponse(w, "INVALID_TOKEN_SCOPES", "Each tag can only be granted once.", nil, http.StatusBadRequest)
			return req, false
		}
		seenTagIDs[scope.TagID] = true

		// api_token_scopes has no foreign key on tag_id because AllTags matches no row in tags, so check it here instead.
		if scope.TagID != AllTags {
			exists, err := HasTag(scope.TagID)
			if err != nil {
				utils.SendErrorResponse(w, operationErrorCode, "Error validating token access grants.", err, http.StatusInternalServerError)
				return req, false
			}
			if !exists {
				utils.SendErrorResponse(w, "INVALID_TAG_ID", "Invalid tag.", nil, http.StatusBadRequest)
				return req, false
			}
		}
	}

	return req, true
}

func HandleRevokeAPIToken(w http.ResponseWriter, r *http.Request) {
	tokenIDStr := r.PathValue("tokenId")
	tokenID, err := strconv.Atoi(tokenIDStr)
	if err != nil {
		utils.SendErrorResponse(w, "INVALID_TOKEN_ID", "Invalid token ID.", err, http.StatusBadRequest)
		return
	}

	err = RevokeAPIToken(tokenID)
	if err != nil {
		utils.SendErrorResponse(w, "API_TOKEN_REVOKE_FAILED", "Error revoking API token.", err, http.StatusInternalServerError)
		return
	}

	utils.SendJSON(w, http.StatusOK, map[string]bool{"success": true})
}
