CREATE TABLE IF NOT EXISTS storage_config (
    config_id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL DEFAULT 'local',
    endpoint TEXT DEFAULT '',
    bucket TEXT DEFAULT '',
    access_key TEXT DEFAULT '',
    secret_key TEXT DEFAULT '',
    region TEXT DEFAULT '',
    public_url TEXT DEFAULT '',
    use_ssl INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
