package mcp

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"log/slog"
	"net/http"
	"path/filepath"
	"strings"
	"time"
	"zen/commons/utils"
	"zen/features/images"
	"zen/features/notes"
	"zen/features/storage"
	"zen/features/tags"
)

type Request struct {
	JsonRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

type Response struct {
	JsonRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Result  interface{} `json:"result,omitempty"`
	Error   *RPCError   `json:"error,omitempty"`
}

type Notification struct {
	JsonRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

type RPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

type InitializeParams struct {
	ProtocolVersion string      `json:"protocolVersion"`
	Capabilities    interface{} `json:"capabilities"`
	ClientInfo      ClientInfo  `json:"clientInfo"`
}

type ClientInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type InitializeResult struct {
	ProtocolVersion string       `json:"protocolVersion"`
	Capabilities    Capabilities `json:"capabilities"`
	ServerInfo      ServerInfo   `json:"serverInfo"`
}

type ServerInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

type Capabilities struct {
	Tools struct {
		ListChanged bool `json:"listChanged"`
	} `json:"tools"`
}

type Tool struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	InputSchema interface{} `json:"inputSchema"`
}

type ToolListResult struct {
	Tools []Tool `json:"tools"`
}

type ToolCallParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments,omitempty"`
}

type ToolCallResult struct {
	Content []ToolContent `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

type ToolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func validateAccessToken(r *http.Request) bool {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" {
		return false
	}

	if !strings.HasPrefix(authHeader, "Bearer ") {
		return false
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")

	return ValidateMCPToken(token)
}

func HandleMCP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id")
	w.Header().Set("Access-Control-Expose-Headers", "Mcp-Session-Id")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		utils.SendErrorResponse(w, "METHOD_NOT_ALLOWED", "Only POST method is supported", nil, http.StatusMethodNotAllowed)
		return
	}

	if !validateAccessToken(r) {
		utils.SendErrorResponse(w, "UNAUTHORIZED", "Valid access token required", nil, http.StatusUnauthorized)
		return
	}

	var req Request
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendRPCError(w, nil, -32700, "Parse error", nil)
		return
	}

	response := handleMCPMessage(req)
	if response == nil {
		w.WriteHeader(http.StatusOK)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}

func handleMCPMessage(req Request) interface{} {
	switch req.Method {
	case "initialize":
		return handleInitialize(req)
	case "notifications/initialized":
		return nil
	case "tools/list":
		return handleToolsList(req)
	case "tools/call":
		return handleToolsCall(req)
	default:
		return createErrorResponse(req.ID, -32601, "Method not found", nil)
	}
}

func handleInitialize(req Request) *Response {
	result := InitializeResult{
		ProtocolVersion: "2025-03-26",
		Capabilities: Capabilities{
			Tools: struct {
				ListChanged bool `json:"listChanged"`
			}{
				ListChanged: true,
			},
		},
		ServerInfo: ServerInfo{
			Name:    "Zen Notes MCP Server",
			Version: "1.0.0",
		},
	}

	return &Response{
		JsonRPC: "2.0",
		ID:      req.ID,
		Result:  result,
	}
}

func handleToolsList(req Request) *Response {
	tools := []Tool{
		{
			Name:        "search_notes",
			Description: "Search through notes using full-text search",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"query": map[string]interface{}{
						"type":        "string",
						"description": "Search query to find notes",
					},
					"limit": map[string]interface{}{
						"type":        "number",
						"description": "Maximum number of results to return (default: 20)",
						"default":     20,
					},
				},
				"required": []string{"query"},
			},
		},
		{
			Name:        "list_notes",
			Description: "List notes with optional filtering",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"page": map[string]interface{}{
						"type":        "number",
						"description": "Page number for pagination (default: 1)",
						"default":     1,
					},
					"archived": map[string]interface{}{
						"type":        "boolean",
						"description": "Show archived notes (default: false)",
						"default":     false,
					},
					"deleted": map[string]interface{}{
						"type":        "boolean",
						"description": "Show deleted notes (default: false)",
						"default":     false,
					},
				},
				"required": []string{},
			},
		},
		{
			Name:        "get_note",
			Description: "Get a specific note by ID",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"noteId": map[string]interface{}{
						"type":        "number",
						"description": "The ID of the note to retrieve",
					},
				},
				"required": []string{"noteId"},
			},
		},
		{
			Name:        "create_note",
			Description: "Create a new note with title, content and optional tags",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"title": map[string]interface{}{
						"type":        "string",
						"description": "The title of the note",
					},
					"content": map[string]interface{}{
						"type":        "string",
						"description": "The content of the note (supports markdown)",
					},
					"tags": map[string]interface{}{
						"type":        "array",
						"description": "Optional array of tag names to assign to the note",
						"items": map[string]interface{}{
							"type": "string",
						},
					},
				},
				"required": []string{"title", "content"},
			},
		},
		{
			Name:        "upload_image",
			Description: "Upload an image and get its URL for embedding in notes",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"image_data": map[string]interface{}{
						"type":        "string",
						"description": "Base64 encoded image data",
					},
					"filename": map[string]interface{}{
						"type":        "string",
						"description": "Original filename with extension (e.g., photo.jpg)",
					},
				},
				"required": []string{"image_data", "filename"},
			},
		},
		{
			Name:        "append_image_to_note",
			Description: "Append an image link to a note's content",
			InputSchema: map[string]interface{}{
				"type": "object",
				"properties": map[string]interface{}{
					"noteId": map[string]interface{}{
						"type":        "number",
						"description": "The ID of the note to append the image to",
					},
					"image_path": map[string]interface{}{
						"type":        "string",
						"description": "The image path returned from upload_image (e.g., /images/filename.jpg)",
					},
					"description": map[string]interface{}{
						"type":        "string",
						"description": "Optional description/alt text for the image",
						"default":     "",
					},
				},
				"required": []string{"noteId", "image_path"},
			},
		},
	}

	result := ToolListResult{Tools: tools}

	return &Response{
		JsonRPC: "2.0",
		ID:      req.ID,
		Result:  result,
	}
}

func handleToolsCall(req Request) *Response {
	var params ToolCallParams
	paramBytes, err := json.Marshal(req.Params)
	if err != nil {
		return createErrorResponse(req.ID, -32602, "Invalid params", err.Error())
	}

	if err := json.Unmarshal(paramBytes, &params); err != nil {
		return createErrorResponse(req.ID, -32602, "Invalid params", err.Error())
	}

	var result ToolCallResult

	switch params.Name {
	case "search_notes":
		result = handleSearchNotes(params.Arguments)
	case "list_notes":
		result = handleListNotes(params.Arguments)
	case "get_note":
		result = handleGetNote(params.Arguments)
	case "create_note":
		result = handleCreateNote(params.Arguments)
	case "upload_image":
		result = handleUploadImage(params.Arguments)
	case "append_image_to_note":
		result = handleAppendImageToNote(params.Arguments)
	default:
		return createErrorResponse(req.ID, -32601, "Unknown tool", params.Name)
	}

	return &Response{
		JsonRPC: "2.0",
		ID:      req.ID,
		Result:  result,
	}
}

func handleSearchNotes(args map[string]interface{}) ToolCallResult {
	query, ok := args["query"].(string)
	if !ok || query == "" {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: query parameter is required"}},
			IsError: true,
		}
	}

	limit := 20
	if l, ok := args["limit"].(float64); ok {
		limit = int(l)
	}

	searchNotes, err := notes.SearchNotes(query, limit)
	if err != nil {
		slog.Error("MCP search error", "error", err)
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error searching notes: " + err.Error()}},
			IsError: true,
		}
	}

	if len(searchNotes) == 0 {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "No notes found matching your search query."}},
		}
	}

	var text strings.Builder
	text.WriteString(fmt.Sprintf("Found %d notes:\n\n", len(searchNotes)))

	for i, note := range searchNotes {
		text.WriteString(fmt.Sprintf("%d. **%s** (ID: %d)\n", i+1, note.Title, note.NoteID))
		text.WriteString(fmt.Sprintf("   Updated: %s\n", note.UpdatedAt.Format("2006-01-02 15:04")))
		if len(note.Tags) > 0 {
			tagNames := make([]string, len(note.Tags))
			for j, tag := range note.Tags {
				tagNames[j] = tag.Name
			}
			text.WriteString(fmt.Sprintf("   Tags: %s\n", strings.Join(tagNames, ", ")))
		}
		text.WriteString(fmt.Sprintf("   Snippet: %s\n\n", note.Snippet))
	}

	return ToolCallResult{
		Content: []ToolContent{{Type: "text", Text: text.String()}},
	}
}

func handleListNotes(args map[string]interface{}) ToolCallResult {
	page := 1
	if p, ok := args["page"].(float64); ok {
		page = int(p)
	}

	archived := false
	if a, ok := args["archived"].(bool); ok {
		archived = a
	}

	deleted := false
	if d, ok := args["deleted"].(bool); ok {
		deleted = d
	}

	filter := notes.NewNotesFilter(page, 0, 0, deleted, archived)

	allNotes, total, err := notes.GetAllNotes(filter)
	if err != nil {
		slog.Error("MCP list notes error", "error", err)
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error listing notes: " + err.Error()}},
			IsError: true,
		}
	}

	if len(allNotes) == 0 {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "No notes found."}},
		}
	}

	var text strings.Builder
	text.WriteString(fmt.Sprintf("Showing %d of %d notes (page %d):\n\n", len(allNotes), total, page))

	for i, note := range allNotes {
		status := ""
		if note.IsArchived {
			status = " [Archived]"
		} else if note.IsDeleted {
			status = " [Deleted]"
		}

		text.WriteString(fmt.Sprintf("%d. **%s**%s (ID: %d)\n", i+1, note.Title, status, note.NoteID))
		text.WriteString(fmt.Sprintf("   Updated: %s\n", note.UpdatedAt.Format("2006-01-02 15:04")))
		if len(note.Tags) > 0 {
			tagNames := make([]string, len(note.Tags))
			for j, tag := range note.Tags {
				tagNames[j] = tag.Name
			}
			text.WriteString(fmt.Sprintf("   Tags: %s\n", strings.Join(tagNames, ", ")))
		}
		text.WriteString(fmt.Sprintf("   Snippet: %s\n\n", note.Snippet))
	}

	return ToolCallResult{
		Content: []ToolContent{{Type: "text", Text: text.String()}},
	}
}

func handleGetNote(args map[string]interface{}) ToolCallResult {
	noteIDFloat, ok := args["noteId"].(float64)
	if !ok {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: noteId parameter is required"}},
			IsError: true,
		}
	}

	noteID := int(noteIDFloat)
	note, err := notes.GetNoteByID(noteID)
	if err != nil {
		slog.Error("MCP get note error", "error", err)
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error retrieving note: " + err.Error()}},
			IsError: true,
		}
	}

	var text strings.Builder
	text.WriteString(fmt.Sprintf("**%s** (ID: %d)\n\n", note.Title, note.NoteID))
	text.WriteString(fmt.Sprintf("Updated: %s\n", note.UpdatedAt.Format("2006-01-02 15:04:05")))

	if len(note.Tags) > 0 {
		tagNames := make([]string, len(note.Tags))
		for i, tag := range note.Tags {
			tagNames[i] = tag.Name
		}
		text.WriteString(fmt.Sprintf("Tags: %s\n", strings.Join(tagNames, ", ")))
	}

	status := ""
	if note.IsArchived {
		status = " [Archived]"
	} else if note.IsDeleted {
		status = " [Deleted]"
	}
	if status != "" {
		text.WriteString(fmt.Sprintf("Status: %s\n", status))
	}

	text.WriteString("\n---\n\n")
	text.WriteString(note.Content)

	return ToolCallResult{
		Content: []ToolContent{{Type: "text", Text: text.String()}},
	}
}

func handleCreateNote(args map[string]interface{}) ToolCallResult {
	title, ok := args["title"].(string)
	if !ok || title == "" {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: title parameter is required"}},
			IsError: true,
		}
	}

	content, ok := args["content"].(string)
	if !ok {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: content parameter is required"}},
			IsError: true,
		}
	}

	note := notes.Note{
		Title:   title,
		Content: content,
	}

	if tagsArg, ok := args["tags"].([]interface{}); ok {
		for _, t := range tagsArg {
			if tagName, ok := t.(string); ok && tagName != "" {
				note.Tags = append(note.Tags, tags.Tag{
					TagID: -1,
					Name:  tagName,
				})
			}
		}
	}

	if note.Tags == nil {
		note.Tags = []tags.Tag{}
	}

	createdNote, err := notes.CreateNote(note)
	if err != nil {
		slog.Error("MCP create note error", "error", err)
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error creating note: " + err.Error()}},
			IsError: true,
		}
	}

	var text strings.Builder
	text.WriteString(fmt.Sprintf("Note created successfully!\n\n"))
	text.WriteString(fmt.Sprintf("**%s** (ID: %d)\n", createdNote.Title, createdNote.NoteID))
	text.WriteString(fmt.Sprintf("Created: %s\n", createdNote.UpdatedAt.Format("2006-01-02 15:04:05")))

	if len(createdNote.Tags) > 0 {
		tagNames := make([]string, len(createdNote.Tags))
		for i, tag := range createdNote.Tags {
			tagNames[i] = tag.Name
		}
		text.WriteString(fmt.Sprintf("Tags: %s\n", strings.Join(tagNames, ", ")))
	}

	text.WriteString("\n---\n\n")
	text.WriteString(createdNote.Content)

	return ToolCallResult{
		Content: []ToolContent{{Type: "text", Text: text.String()}},
	}
}

func handleUploadImage(args map[string]interface{}) ToolCallResult {
	imageData, ok := args["image_data"].(string)
	if !ok || imageData == "" {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: image_data parameter is required"}},
			IsError: true,
		}
	}

	filename, ok := args["filename"].(string)
	if !ok || filename == "" {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: filename parameter is required"}},
			IsError: true,
		}
	}

	// Decode base64 data
	data, err := base64.StdEncoding.DecodeString(imageData)
	if err != nil {
		slog.Error("MCP upload image error - invalid base64", "error", err)
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: invalid base64 image data"}},
			IsError: true,
		}
	}

	// Generate unique filename
	ext := filepath.Ext(filename)
	if ext == "" {
		ext = ".jpg" // default extension
	}
	uniqueFilename := fmt.Sprintf("%d%s", time.Now().UnixNano(), ext)

	// Upload to storage
	provider := storage.GetProvider()
	reader := bytes.NewReader(data)
	contentType := http.DetectContentType(data)

	if err := provider.Upload(uniqueFilename, reader, int64(len(data)), contentType, nil); err != nil {
		slog.Error("MCP upload image error", "error", err)
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error uploading image: " + err.Error()}},
			IsError: true,
		}
	}

	// Create image record in database
	imageRecord := images.ImageRecord{
		Filename: uniqueFilename,
		FileSize: int64(len(data)),
		Format:   strings.TrimPrefix(ext, "."),
	}

	// Try to decode image dimensions
	img, format, err := image.Decode(bytes.NewReader(data))
	if err == nil {
		bounds := img.Bounds()
		imageRecord.Width = bounds.Dx()
		imageRecord.Height = bounds.Dy()
		imageRecord.AspectRatio = float64(imageRecord.Width) / float64(imageRecord.Height)
		imageRecord.Format = format
	} else {
		// Default values if we can't decode
		imageRecord.Width = 0
		imageRecord.Height = 0
		imageRecord.AspectRatio = 0
	}

	_, err = images.CreateImage(imageRecord)
	if err != nil {
		slog.Error("MCP create image record error", "error", err)
		// Image was uploaded but record failed - still return URL
	}

	imageURL := storage.GetImageURL(uniqueFilename)

	return ToolCallResult{
		Content: []ToolContent{{
			Type: "text",
			Text: fmt.Sprintf("Image uploaded successfully!\n\nFilename: %s\nURL: %s\n\nUse this URL in append_image_to_note to add it to a note.", uniqueFilename, imageURL),
		}},
	}
}

func handleAppendImageToNote(args map[string]interface{}) ToolCallResult {
	noteIDFloat, ok := args["noteId"].(float64)
	if !ok {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: noteId parameter is required"}},
			IsError: true,
		}
	}
	noteID := int(noteIDFloat)

	imagePath, ok := args["image_path"].(string)
	if !ok || imagePath == "" {
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: image_path parameter is required"}},
			IsError: true,
		}
	}

	description := ""
	if d, ok := args["description"].(string); ok {
		description = d
	}

	// Get existing note
	note, err := notes.GetNoteByID(noteID)
	if err != nil {
		slog.Error("MCP append image error - note not found", "error", err)
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error: note not found"}},
			IsError: true,
		}
	}

	// Append image markdown to content
	imageMarkdown := fmt.Sprintf("\n\n![%s](%s)", description, imagePath)
	note.Content += imageMarkdown

	// Update note
	updatedNote, err := notes.UpdateNote(note)
	if err != nil {
		slog.Error("MCP append image error - update failed", "error", err)
		return ToolCallResult{
			Content: []ToolContent{{Type: "text", Text: "Error updating note: " + err.Error()}},
			IsError: true,
		}
	}

	return ToolCallResult{
		Content: []ToolContent{{
			Type: "text",
			Text: fmt.Sprintf("Image appended to note successfully!\n\nNote: %s (ID: %d)\nImage: %s", updatedNote.Title, updatedNote.NoteID, imagePath),
		}},
	}
}

func createErrorResponse(id interface{}, code int, message string, data interface{}) *Response {
	return &Response{
		JsonRPC: "2.0",
		ID:      id,
		Error: &RPCError{
			Code:    code,
			Message: message,
			Data:    data,
		},
	}
}

func sendRPCError(w http.ResponseWriter, id interface{}, code int, message string, data interface{}) {
	response := createErrorResponse(id, code, message, data)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(response)
}
