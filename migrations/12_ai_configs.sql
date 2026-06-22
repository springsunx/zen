CREATE TABLE IF NOT EXISTS ai_configs (
    config_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT DEFAULT '',
    model TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    skip_tls_verify INTEGER DEFAULT 0,
    system_prompt TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);