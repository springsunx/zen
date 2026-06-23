package storage

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"
	"zen/commons/sqlite"
)

type StorageConfig struct {
	ConfigID              int    `json:"configId"`
	Provider              string `json:"provider"`
	Endpoint              string `json:"endpoint"`
	Bucket                string `json:"bucket"`
	AccessKey             string `json:"accessKey"`
	SecretKey             string `json:"secretKey"`
	Region                string `json:"region"`
	PublicURL             string `json:"publicUrl"`
	UseSSL                bool   `json:"useSSL"`
	AttachmentsBucket     string `json:"attachmentsBucket"`
	AttachmentsPublicURL  string `json:"attachmentsPublicUrl"`
}

// Provider is the interface for file storage operations.
type Provider interface {
	Upload(filename string, reader io.Reader, size int64, contentType string) error
	Delete(filename string) error
	GetURL(filename string) string
}

// ── Local Provider ──

type LocalProvider struct {
	folder string
}

func NewLocalProvider(folder string) *LocalProvider {
	return &LocalProvider{folder: folder}
}

func (p *LocalProvider) Upload(filename string, reader io.Reader, size int64, contentType string) error {
	dstPath := filepath.Join(p.folder, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("error creating file: %w", err)
	}
	defer dst.Close()

	_, err = io.Copy(dst, reader)
	return err
}

func (p *LocalProvider) Delete(filename string) error {
	dstPath := filepath.Join(p.folder, filename)
	err := os.Remove(dstPath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (p *LocalProvider) GetURL(filename string) string {
	return "/images/" + filename
}

// ── Local Attachment Provider ──

type LocalAttachmentProvider struct {
	folder string
}

func NewLocalAttachmentProvider(folder string) *LocalAttachmentProvider {
	return &LocalAttachmentProvider{folder: folder}
}

func (p *LocalAttachmentProvider) Upload(filename string, reader io.Reader, size int64, contentType string) error {
	dstPath := filepath.Join(p.folder, filename)
	dst, err := os.Create(dstPath)
	if err != nil {
		return fmt.Errorf("error creating file: %w", err)
	}
	defer dst.Close()

	_, err = io.Copy(dst, reader)
	return err
}

func (p *LocalAttachmentProvider) Delete(filename string) error {
	dstPath := filepath.Join(p.folder, filename)
	err := os.Remove(dstPath)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (p *LocalAttachmentProvider) GetURL(filename string) string {
	return "/attachments/" + filename
}

// ── S3 Provider ──

type S3Provider struct {
	client    *S3Client
	bucket    string
	publicURL string
}

func newS3ClientFromConfig(config StorageConfig) (*S3Client, string, error) {
	endpoint := config.Endpoint
	endpoint = strings.TrimPrefix(endpoint, "https://")
	endpoint = strings.TrimPrefix(endpoint, "http://")
	endpoint = strings.TrimSuffix(endpoint, "/")
	client := NewS3Client(endpoint, config.AccessKey, config.SecretKey, config.Region, config.UseSSL)
	return client, endpoint, nil
}

func buildPublicURL(endpoint string, useSSL bool, bucket string, overrideURL string) string {
	publicURL := overrideURL
	if publicURL == "" {
		scheme := "https"
		if !useSSL {
			scheme = "http"
		}
		publicURL = fmt.Sprintf("%s://%s/%s", scheme, endpoint, bucket)
	}
	return strings.TrimSuffix(publicURL, "/")
}

func NewS3Provider(config StorageConfig) (*S3Provider, error) {
	client, endpoint, err := newS3ClientFromConfig(config)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	exists, err := client.BucketExists(ctx, config.Bucket)
	if err != nil {
		return nil, fmt.Errorf("error checking bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("bucket '%s' does not exist", config.Bucket)
	}

	publicURL := buildPublicURL(endpoint, config.UseSSL, config.Bucket, config.PublicURL)

	return &S3Provider{
		client:    client,
		bucket:    config.Bucket,
		publicURL: publicURL,
	}, nil
}

func NewS3AttachmentProvider(config StorageConfig) (*S3Provider, error) {
	client, endpoint, err := newS3ClientFromConfig(config)
	if err != nil {
		return nil, err
	}

	bucket := config.AttachmentsBucket
	if bucket == "" {
		bucket = config.Bucket
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	exists, err := client.BucketExists(ctx, bucket)
	if err != nil {
		return nil, fmt.Errorf("error checking attachments bucket: %w", err)
	}
	if !exists {
		return nil, fmt.Errorf("attachments bucket '%s' does not exist", bucket)
	}

	publicURL := buildPublicURL(endpoint, config.UseSSL, bucket, config.AttachmentsPublicURL)

	return &S3Provider{
		client:    client,
		bucket:    bucket,
		publicURL: publicURL,
	}, nil
}

func (p *S3Provider) Upload(filename string, reader io.Reader, size int64, contentType string) error {
	ctx := context.Background()
	err := p.client.PutObject(ctx, p.bucket, filename, reader, size, contentType)
	if err != nil {
		return fmt.Errorf("error uploading to S3: %w", err)
	}
	return nil
}

func (p *S3Provider) Delete(filename string) error {
	ctx := context.Background()
	err := p.client.RemoveObject(ctx, p.bucket, filename)
	if err != nil {
		return fmt.Errorf("error deleting from S3: %w", err)
	}
	return nil
}

func (p *S3Provider) GetURL(filename string) string {
	return p.publicURL + "/" + filename
}

// ── Config DB Operations ──

func GetConfig() (StorageConfig, error) {
	var c StorageConfig
	var useSSL int
	err := sqlite.DB.QueryRow(`
		SELECT config_id, provider, endpoint, bucket, access_key, secret_key, region, public_url, use_ssl, attachments_bucket, attachments_public_url
		FROM storage_config LIMIT 1
	`).Scan(&c.ConfigID, &c.Provider, &c.Endpoint, &c.Bucket, &c.AccessKey, &c.SecretKey, &c.Region, &c.PublicURL, &useSSL, &c.AttachmentsBucket, &c.AttachmentsPublicURL)
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
		INSERT INTO storage_config (provider, endpoint, bucket, access_key, secret_key, region, public_url, use_ssl, attachments_bucket, attachments_public_url)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, c.Provider, c.Endpoint, c.Bucket, c.AccessKey, c.SecretKey, c.Region, c.PublicURL, useSSL, c.AttachmentsBucket, c.AttachmentsPublicURL)
	if err != nil {
		return fmt.Errorf("error saving storage config: %w", err)
	}
	return nil
}

// ── Provider Factory ──

func imagesFolder() string {
	folder := os.Getenv("IMAGES_FOLDER")
	if folder == "" {
		folder = "./images"
	}
	return folder
}

func attachmentsFolder() string {
	folder := os.Getenv("ATTACHMENTS_FOLDER")
	if folder == "" {
		folder = "./attachments"
	}
	return folder
}

func GetProvider() Provider {
	config, err := GetConfig()
	if err != nil {
		slog.Error("error reading storage config, falling back to local", "error", err)
		return NewLocalProvider(imagesFolder())
	}

	if config.Provider == "s3" {
		provider, err := NewS3Provider(config)
		if err != nil {
			slog.Error("error creating S3 provider, falling back to local", "error", err)
			return NewLocalProvider(imagesFolder())
		}
		return provider
	}

	return NewLocalProvider(imagesFolder())
}

func GetAttachmentProvider() Provider {
	config, err := GetConfig()
	if err != nil {
		slog.Error("error reading storage config, falling back to local", "error", err)
		return NewLocalAttachmentProvider(attachmentsFolder())
	}

	if config.Provider == "s3" {
		provider, err := NewS3AttachmentProvider(config)
		if err != nil {
			slog.Error("error creating S3 attachment provider, falling back to local", "error", err)
			return NewLocalAttachmentProvider(attachmentsFolder())
		}
		return provider
	}

	return NewLocalAttachmentProvider(attachmentsFolder())
}

// TestS3Connection tests connectivity to an S3-compatible storage.
func TestS3Connection(config StorageConfig) error {
	client, _, err := newS3ClientFromConfig(config)
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
	err = client.PutObject(ctx, config.Bucket, testKey,
		strings.NewReader("test"), 4, "text/plain")
	if err != nil {
		return fmt.Errorf("upload test failed: %w", err)
	}

	// Clean up test object
	_ = client.RemoveObject(ctx, config.Bucket, testKey)

	return nil
}

// GetImageURL returns the public URL for an image based on current storage config.
func GetImageURL(filename string) string {
	provider := GetProvider()
	return provider.GetURL(filename)
}

// GetAttachmentURL returns the public URL for an attachment based on current storage config.
func GetAttachmentURL(filename string) string {
	provider := GetAttachmentProvider()
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
