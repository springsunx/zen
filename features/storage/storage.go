package storage

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"zen/commons/sqlite"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
)

type StorageConfig struct {
	ConfigID   int    `json:"configId"`
	Provider   string `json:"provider"`
	Endpoint   string `json:"endpoint"`
	Bucket     string `json:"bucket"`
	AccessKey  string `json:"accessKey"`
	SecretKey  string `json:"secretKey"`
	Region     string `json:"region"`
	PublicURL  string `json:"publicUrl"`
	UseSSL     bool   `json:"useSSL"`
}

// Provider is the interface for file storage operations.
type Provider interface {
	Upload(filename string, reader io.Reader, size int64, contentType string) error
	Delete(filename string) error
	GetURL(filename string) string
}

// ── Local Provider ──

type LocalProvider struct {
	imagesFolder string
}

func NewLocalProvider() *LocalProvider {
	folder := os.Getenv("IMAGES_FOLDER")
	if folder == "" {
		folder = "./images"
	}
	return &LocalProvider{imagesFolder: folder}
}

func (p *LocalProvider) Upload(filename string, reader io.Reader, size int64, contentType string) error {
	dstPath := filepath.Join(p.imagesFolder, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("error creating file: %w", err)
	}
	defer dst.Close()

	_, err = io.Copy(dst, reader)
	return err
}

func (p *LocalProvider) Delete(filename string) error {
	dstPath := filepath.Join(p.imagesFolder, filename)
	err := os.Remove(dstPath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (p *LocalProvider) GetURL(filename string) string {
	return "/images/" + filename
}

// ── S3 Provider ──

type S3Provider struct {
	client    *minio.Client
	config    StorageConfig
	publicURL string
}

func NewS3Provider(config StorageConfig) (*S3Provider, error) {
	endpoint := config.Endpoint
	// Strip protocol prefix for minio client
	endpoint = strings.TrimPrefix(endpoint, "https://")
	endpoint = strings.TrimPrefix(endpoint, "http://")
	// Strip trailing slash
	endpoint = strings.TrimSuffix(endpoint, "/")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(config.AccessKey, config.SecretKey, ""),
		Secure: config.UseSSL,
		Region: config.Region,
	})
	if err != nil {
		return nil, fmt.Errorf("error creating S3 client: %w", err)
	}

	// Verify bucket exists
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	exists, err := client.BucketExists(ctx, config.Bucket)
	if err != nil {
		return nil, fmt.Errorf("error checking bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket '%s' does not exist", config.Bucket)
	}

	publicURL := config.PublicURL
	if publicURL == "" {
		scheme := "https"
		if !config.UseSSL {
			scheme = "http"
		}
		publicURL = fmt.Sprintf("%s://%s/%s", scheme, endpoint, config.Bucket)
	}
	publicURL = strings.TrimSuffix(publicURL, "/")

	return &S3Provider{
		client:    client,
		config:    config,
		publicURL: publicURL,
	}, nil
}

func (p *S3Provider) Upload(filename string, reader io.Reader, size int64, contentType string) error {
	ctx := context.Background()
	_, err := p.client.PutObject(ctx, p.config.Bucket, filename, reader, size, minio.PutObjectOptions{
		ContentType: contentType,
	})
	if err != nil {
		return fmt.Errorf("error uploading to S3: %w", err)
	}
	return nil
}

func (p *S3Provider) Delete(filename string) error {
	ctx := context.Background()
	err := p.client.RemoveObject(ctx, p.config.Bucket, filename, minio.RemoveObjectOptions{})
	if err != nil {
		return fmt.Errorf("error deleting from S3: %w", err)
	}
	return nil
}

func (p *S3Provider) GetURL(filename string) string {
	return p.publicURL + "/" + filename
}

// ── Config DB Operations ──

const defaultSystemPrompt = "You are a helpful assistant. Provide detailed, well-structured responses. Use markdown formatting when appropriate."

func GetConfig() (StorageConfig, error) {
	var c StorageConfig
	var useSSL int
	err := sqlite.DB.QueryRow(`
		SELECT config_id, provider, endpoint, bucket, access_key, secret_key, region, public_url, use_ssl
		FROM storage_config LIMIT 1
	`).Scan(&c.ConfigID, &c.Provider, &c.Endpoint, &c.Bucket, &c.AccessKey, &c.SecretKey, &c.Region, &c.PublicURL, &useSSL)
	if err != nil {
		// Return default local config if no row exists
		return StorageConfig{Provider: "local"}, nil
	}
	c.UseSSL = useSSL == 1
	return c, nil
}

func SaveConfig(c StorageConfig) error {
	// Delete existing config (single-row table)
	_, err := sqlite.DB.Exec("DELETE FROM storage_config")
	if err != nil {
		return fmt.Errorf("error clearing storage config: %w", err)
	}

	useSSL := 0
	if c.UseSSL {
		useSSL = 1
	}

	_, err = sqlite.DB.Exec(`
		INSERT INTO storage_config (provider, endpoint, bucket, access_key, secret_key, region, public_url, use_ssl)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, c.Provider, c.Endpoint, c.Bucket, c.AccessKey, c.SecretKey, c.Region, c.PublicURL, useSSL)
	if err != nil {
		return fmt.Errorf("error saving storage config: %w", err)
	}
	return nil
}

// ── Provider Factory ──

func GetProvider() Provider {
	config, err := GetConfig()
	if err != nil {
		slog.Error("error reading storage config, falling back to local", "error", err)
		return NewLocalProvider()
	}

	if config.Provider == "s3" {
		provider, err := NewS3Provider(config)
		if err != nil {
			slog.Error("error creating S3 provider, falling back to local", "error", err)
			return NewLocalProvider()
		}
		return provider
	}

	return NewLocalProvider()
}

// TestS3Connection tests connectivity to an S3-compatible storage.
func TestS3Connection(config StorageConfig) error {
	endpoint := config.Endpoint
	endpoint = strings.TrimPrefix(endpoint, "https://")
	endpoint = strings.TrimPrefix(endpoint, "http://")
	endpoint = strings.TrimSuffix(endpoint, "/")

	client, err := minio.New(endpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(config.AccessKey, config.SecretKey, ""),
		Secure: config.UseSSL,
		Region: config.Region,
	})
	if err != nil {
		return fmt.Errorf("error creating client: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	exists, err := client.BucketExists(ctx, config.Bucket)
	if err != nil {
		return fmt.Errorf("connection failed: %w", err)
	}
	if !exists {
		return fmt.Errorf("bucket '%s' does not exist", config.Bucket)
	}

	// Try a test upload
	testKey := ".zen-test-" + fmt.Sprintf("%d", time.Now().UnixNano())
	_, err = client.PutObject(ctx, config.Bucket, testKey,
		strings.NewReader("test"), 4, minio.PutObjectOptions{ContentType: "text/plain"})
	if err != nil {
		return fmt.Errorf("upload test failed: %w", err)
	}

	// Clean up test object
	_ = client.RemoveObject(ctx, config.Bucket, testKey, minio.RemoveObjectOptions{})

	return nil
}

// GetImageURL returns the public URL for an image based on current storage config.
func GetImageURL(filename string) string {
	provider := GetProvider()
	return provider.GetURL(filename)
}

// IsS3Enabled checks if the current storage provider is S3.
func IsS3Enabled() bool {
	config, err := GetConfig()
	if err != nil {
		return false
	}
	return config.Provider == "s3"
}

// Ensure URL parsing helper works
func init() {
	_ = url.Parse
}
