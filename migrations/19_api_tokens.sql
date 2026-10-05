-- Tag-scoped API tokens. Tokens are the single credential for both HTTP and MCP clients.
-- Existing mcp_tokens rows keep working: each legacy allowed tag becomes a read+write scope,
-- and a legacy token with no tag restriction becomes an all-tags scope.
CREATE TABLE IF NOT EXISTS api_tokens (
    token_id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_token_scopes (
    token_id  INTEGER NOT NULL,
    tag_id    INTEGER NOT NULL,
    can_read  INTEGER NOT NULL DEFAULT 0,
    can_write INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (token_id, tag_id),
    FOREIGN KEY (token_id) REFERENCES api_tokens (token_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_token_hash ON api_tokens(token_hash);

INSERT OR IGNORE INTO api_tokens (token_id, name, token_hash, created_at)
SELECT token_id, name, token_hash, created_at FROM mcp_tokens WHERE is_active = 1;

INSERT OR IGNORE INTO api_token_scopes (token_id, tag_id, can_read, can_write)
SELECT token_id, tag_id, 1, 1 FROM mcp_token_tags;

-- tag_id 0 is the all-tags sentinel; a legacy token without tag rows could reach every note.
INSERT OR IGNORE INTO api_token_scopes (token_id, tag_id, can_read, can_write)
SELECT token_id, 0, 1, 1 FROM api_tokens
WHERE token_id NOT IN (SELECT token_id FROM api_token_scopes);
