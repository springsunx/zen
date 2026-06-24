package storage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// S3Client is a minimal S3-compatible client using only the standard library.
// It supports PutObject, RemoveObject, and BucketExists via AWS Signature V4.
type S3Client struct {
	endpoint  string // host:port, no scheme
	accessKey string
	secretKey string
	region    string
	useSSL    bool
	client    *http.Client
}

func NewS3Client(endpoint, accessKey, secretKey, region string, useSSL bool) *S3Client {
	return &S3Client{
		endpoint:  endpoint,
		accessKey: accessKey,
		secretKey: secretKey,
		region:    region,
		useSSL:    useSSL,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *S3Client) scheme() string {
	if c.useSSL {
		return "https"
	}
	return "http"
}

// BucketExists checks whether the given bucket is accessible.
func (c *S3Client) BucketExists(ctx context.Context, bucket string) (bool, error) {
	req, err := http.NewRequestWithContext(ctx, "HEAD", fmt.Sprintf("%s://%s/%s", c.scheme(), c.endpoint, bucket), nil)
	if err != nil {
		return false, err
	}
	if err := c.sign(req, nil); err != nil {
		return false, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == http.StatusOK {
		return true, nil
	}
	if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusForbidden {
		return false, nil
	}
	return false, fmt.Errorf("unexpected status %d", resp.StatusCode)
}

// PutObject uploads data to the given bucket/key with optional metadata.
func (c *S3Client) PutObject(ctx context.Context, bucket, key string, body io.Reader, size int64, contentType string, metadata map[string]string) error {
	data, err := io.ReadAll(body)
	if err != nil {
		return fmt.Errorf("reading body: %w", err)
	}

	url := fmt.Sprintf("%s://%s/%s/%s", c.scheme(), c.endpoint, bucket, key)
	req, err := http.NewRequestWithContext(ctx, "PUT", url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for k, v := range metadata {
		req.Header.Set("x-amz-meta-"+k, v)
	}
	req.ContentLength = int64(len(data))

	if err := c.sign(req, data); err != nil {
		return err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("PUT failed with status %d", resp.StatusCode)
	}
	return nil
}

// RemoveObject deletes the object at the given bucket/key.
func (c *S3Client) RemoveObject(ctx context.Context, bucket, key string) error {
	url := fmt.Sprintf("%s://%s/%s/%s", c.scheme(), c.endpoint, bucket, key)
	req, err := http.NewRequestWithContext(ctx, "DELETE", url, nil)
	if err != nil {
		return err
	}
	if err := c.sign(req, nil); err != nil {
		return err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		return fmt.Errorf("DELETE failed with status %d", resp.StatusCode)
	}
	return nil
}

// GetObject downloads the object at the given bucket/key.
func (c *S3Client) GetObject(ctx context.Context, bucket, key string) (io.ReadCloser, error) {
	url := fmt.Sprintf("%s://%s/%s/%s", c.scheme(), c.endpoint, bucket, key)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	if err := c.sign(req, nil); err != nil {
		return nil, err
	}
	resp, err := c.client.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, fmt.Errorf("GET failed with status %d", resp.StatusCode)
	}
	return resp.Body, nil
}

// PresignGetObject generates a presigned URL for downloading an object.
// contentDisposition is optional (e.g. `attachment; filename="report.pdf"`).
func (c *S3Client) PresignGetObject(bucket, key string, expiry time.Duration, contentDisposition string) (string, error) {
	now := time.Now().UTC()
	dateStr := now.Format("20060102T150405Z")
	dateShort := now.Format("20060102")
	expirySec := int(expiry.Seconds())

	credentialScope := dateShort + "/" + c.region + "/s3/aws4_request"

	canonicalURI := "/" + bucket + "/" + key
	canonicalURI = encodePath(canonicalURI)

	// Build query parameters sorted alphabetically by encoded name
	params := []string{
		"X-Amz-Algorithm=" + queryEscape("AWS4-HMAC-SHA256"),
		"X-Amz-Credential=" + queryEscape(c.accessKey+"/"+credentialScope),
		"X-Amz-Date=" + queryEscape(dateStr),
		"X-Amz-Expires=" + queryEscape(fmt.Sprintf("%d", expirySec)),
		"X-Amz-SignedHeaders=" + queryEscape("host"),
	}
	if contentDisposition != "" {
		// "response-content-disposition" sorts after "X-Amz-*" in ASCII (r > X)
		params = append(params, "response-content-disposition="+queryEscape(contentDisposition))
	}
	canonicalQueryString := strings.Join(params, "&")

	canonicalHeaders := "host:" + c.endpoint + "\n"

	canonicalRequest := strings.Join([]string{
		"GET",
		canonicalURI,
		canonicalQueryString,
		canonicalHeaders,
		"host",
		"UNSIGNED-PAYLOAD",
	}, "\n")

	canonicalRequestHash := sha256Hex([]byte(canonicalRequest))

	stringToSign := "AWS4-HMAC-SHA256\n" + dateStr + "\n" + credentialScope + "\n" + canonicalRequestHash

	signingKey := c.deriveSigningKey(dateShort)
	sig := hmacSHA256(signingKey, stringToSign)
	sigHex := hex.EncodeToString(sig)

	finalURL := fmt.Sprintf("%s://%s%s?%s&X-Amz-Signature=%s",
		c.scheme(), c.endpoint, canonicalURI, canonicalQueryString, sigHex)

	return finalURL, nil
}

// queryEscape percent-encodes a string for use in S3 query parameters.
// S3 requires %20 for spaces (not +).
func queryEscape(s string) string {
	return strings.ReplaceAll(url.QueryEscape(s), "+", "%20")
}

// ── AWS Signature V4 ──

func (c *S3Client) sign(req *http.Request, body []byte) error {
	now := time.Now().UTC()
	dateStr := now.Format("20060102T150405Z")
	dateShort := now.Format("20060102")

	payloadHash := sha256Hex(body)

	req.Header.Set("X-Amz-Date", dateStr)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	req.Header.Set("Host", req.Host)

	// Canonical request
	canonicalURI := req.URL.Path
	if canonicalURI == "" {
		canonicalURI = "/"
	}
	canonicalURI = encodePath(canonicalURI)

	canonicalQueryString := req.URL.RawQuery

	// Canonical headers (lowercase, sorted, trimmed)
	signedHeaderKeys := []string{"host", "x-amz-content-sha256", "x-amz-date"}
	if req.Header.Get("Content-Type") != "" {
		signedHeaderKeys = append(signedHeaderKeys, "content-type")
	}
	// Add any x-amz-meta-* headers
	for k := range req.Header {
		lk := strings.ToLower(k)
		if strings.HasPrefix(lk, "x-amz-meta-") && lk != "x-amz-meta-" {
			found := false
			for _, existing := range signedHeaderKeys {
				if existing == lk {
					found = true
					break
				}
			}
			if !found {
				signedHeaderKeys = append(signedHeaderKeys, lk)
			}
		}
	}
	sortStrings(signedHeaderKeys)

	var canonicalHeaders string
	var signedHeaders string
	for i, k := range signedHeaderKeys {
		var val string
		switch k {
		case "host":
			val = req.Host
		default:
			val = req.Header.Get(http.CanonicalHeaderKey(k))
		}
		canonicalHeaders += k + ":" + strings.TrimSpace(val) + "\n"
		if i > 0 {
			signedHeaders += ";"
		}
		signedHeaders += k
	}

	canonicalRequest := strings.Join([]string{
		req.Method,
		canonicalURI,
		canonicalQueryString,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	canonicalRequestHash := sha256Hex([]byte(canonicalRequest))

	credentialScope := dateShort + "/" + c.region + "/s3/aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + dateStr + "\n" + credentialScope + "\n" + canonicalRequestHash

	signingKey := c.deriveSigningKey(dateShort)

	sig := hmacSHA256(signingKey, stringToSign)
	sigHex := hex.EncodeToString(sig)

	auth := "AWS4-HMAC-SHA256 Credential=" + c.accessKey + "/" + credentialScope + ", SignedHeaders=" + signedHeaders + ", Signature=" + sigHex
	req.Header.Set("Authorization", auth)

	return nil
}

func (c *S3Client) deriveSigningKey(dateShort string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+c.secretKey), dateShort)
	kRegion := hmacSHA256(kDate, c.region)
	kService := hmacSHA256(kRegion, "s3")
	kSigning := hmacSHA256(kService, "aws4_request")
	return kSigning
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func hmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(data))
	return mac.Sum(nil)
}

// encodePath applies minimal URI encoding for S3.
func encodePath(path string) string {
	parts := strings.Split(path, "/")
	for i, p := range parts {
		parts[i] = strings.ReplaceAll(p, " ", "%20")
	}
	return strings.Join(parts, "/")
}

// sortStrings performs insertion sort (good enough for ≤10 elements).
func sortStrings(s []string) {
	for i := 1; i < len(s); i++ {
		for j := i; j > 0 && s[j] < s[j-1]; j-- {
			s[j], s[j-1] = s[j-1], s[j]
		}
	}
}
