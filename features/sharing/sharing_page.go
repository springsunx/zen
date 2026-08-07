package sharing

import (
	"fmt"
	"log/slog"
	"net/http"
	"os"
)

// AssetsFS is set by main to provide access to embedded assets.
var AssetsFS interface {
	ReadFile(name string) ([]byte, error)
}

func renderSharedNotePage(w http.ResponseWriter) {
	var page []byte
	var err error

	if os.Getenv("DEV_MODE") == "true" {
		page, err = os.ReadFile("./assets/share.html")
	} else if AssetsFS != nil {
		page, err = AssetsFS.ReadFile("assets/share.html")
	} else {
		err = fmt.Errorf("assets not available")
	}

	if err != nil {
		err = fmt.Errorf("error reading share.html: %w", err)
		slog.Error(err.Error())
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	w.Write(page)
}
