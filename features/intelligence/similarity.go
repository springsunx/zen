package intelligence

import (
	"log/slog"
	"net/http"
	"zen/commons/utils"
	"zen/features/storage"
)

type SimilarImageResponse struct {
	Filename    string  `json:"filename"`
	URL         string  `json:"url"`
	Description string  `json:"description"`
	Width       int     `json:"width"`
	Height      int     `json:"height"`
	AspectRatio float64 `json:"aspectRatio"`
	FileSize    int64   `json:"fileSize"`
	Format      string  `json:"format"`
	Score       float32 `json:"score"`
}

func HandleSimilarImages(w http.ResponseWriter, r *http.Request) {
	filename := r.PathValue("filename")
	if filename == "" {
		utils.SendErrorResponse(w, "INVALID_REQUEST", "filename is required", nil, http.StatusBadRequest)
		return
	}

	if !isIntelligenceEnabled {
		utils.SendJSON(w, http.StatusOK, []SimilarImageResponse{})
		return
	}

	results, err := FindSimilarImages(filename, 10, 0.5)
	if err != nil {
		slog.Error("failed to find similar images", "error", err, "filename", filename)
		utils.SendJSON(w, http.StatusOK, []SimilarImageResponse{})
		return
	}

	out := make([]SimilarImageResponse, len(results))
	for i, r := range results {
		out[i] = SimilarImageResponse{
			Filename:    r.Filename,
			URL:         storage.GetImageURL(r.Filename),
			Description: r.Description,
			Width:       r.Width,
			Height:      r.Height,
			AspectRatio: r.AspectRatio,
			FileSize:    r.FileSize,
			Format:      r.Format,
			Score:       r.Score,
		}
	}

	utils.SendJSON(w, http.StatusOK, out)
}
