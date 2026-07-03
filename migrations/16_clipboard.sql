-- 剪贴板消息表
-- 手机↔电脑文件/文本传输，可手动清理
CREATE TABLE IF NOT EXISTS clipboard_messages (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT NOT NULL DEFAULT 'text',  -- 'text' | 'file'
    content       TEXT,                           -- 文本内容（type=text 时）
    filename      TEXT,                           -- 存储文件名（type=file 时）
    original_name TEXT,                           -- 原始文件名
    content_type  TEXT,                           -- MIME 类型
    file_size     INTEGER,                        -- 文件字节数
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
