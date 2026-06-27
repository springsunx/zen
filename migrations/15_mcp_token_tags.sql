-- MCP token 与 tag 的关联表
-- AI 使用该 token 调用 update_note 时，只能修改带有这些 tag 的笔记
-- 支持 tag 层级继承：选父 tag 自动包含子 tag 下的笔记
-- 如果 token 没有关联任何 tag，则允许操作所有笔记（向后兼容）
CREATE TABLE IF NOT EXISTS mcp_token_tags (
    token_id  INTEGER NOT NULL REFERENCES mcp_tokens(token_id) ON DELETE CASCADE,
    tag_id    INTEGER NOT NULL REFERENCES tags(tag_id) ON DELETE CASCADE,
    PRIMARY KEY (token_id, tag_id)
);
