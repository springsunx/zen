# 代码审查报告：`feature/ai-assistant` vs `master`

**分支**：`feature/ai-assistant`  
**基准**：`master`  
**范围**：45 个文件，+5,944 / -1,232 行  
**审查日期**：2026-06-19

---

## 变更概览

| 模块 | 新增文件 | 主要变更 | 规模 |
|------|---------|---------|------|
| AI 集成 | `features/ai/ai.go`, `AIPanel.jsx`, `AIModal.jsx`, `AiPane.jsx`, `SlashCommandMenu.jsx` | AI 配置管理、对话面板、斜杠命令 | ~1,500 行 |
| 标签层级 | `tags_model.go`, `SidebarTagsList.jsx`, `TagDetailModal.jsx` | 树形标签、拖拽排序、颜色系统 | ~800 行 |
| 反向链接 | `BacklinksPanel.jsx`, `notes_actions.go`, `notes_queries.go` | 反向链接查询与面板 | ~350 行 |
| 编辑器增强 | `NotesEditor.jsx`, `NoteLinkPicker.jsx` | 光标管理、选区恢复、快捷键 | ~600 行 |
| 代码重构 | `notes_model.go` → 拆分为 4 个文件 | CRUD/Action/Query 分离 | ~900 行 |
| 批量操作 | `BulkActionsPanel.jsx`, `BulkActionsToolbar.jsx` | 批量标签、归档、删除 | ~200 行 |
| 国际化 | `locales.en.json`, `locales.zh-CN.json` | AI/Slash/Backlinks 翻译 | ~200 行 |

---

## 🔴 严重问题

### 1. AI API Key 明文返回给前端

**文件**：`features/ai/ai.go:20-30`

```go
type AIConfig struct {
    ConfigID  int       `json:"configId"`
    Name      string    `json:"name"`
    BaseURL   string    `json:"baseUrl"`
    APIKey    string    `json:"apiKey"`     // ← 完整密钥返回前端
    Model     string    `json:"model"`
    IsDefault bool      `json:"isDefault"`
    // ...
}
```

`GetAllConfigs()` 将所有配置的 **完整 API Key** 以明文形式返回给前端。攻击者通过浏览器 DevTools → Network 面板即可截获。

**修复建议**：
- 返回时脱敏：只显示前 4 位 + `****`（如 `sk-a1b2****`）
- 编辑时通过单独的 endpoint 获取完整密钥，或要求用户重新输入
- 参考实现：

```go
type AIConfigSafe struct {
    // ... 其他字段
    APIKey string `json:"apiKey"` // 返回时覆盖为脱敏值
}

func (c AIConfig) Safe() AIConfigSafe {
    safe := AIConfigSafe{...}
    if len(c.APIKey) > 8 {
        safe.APIKey = c.APIKey[:4] + "****"
    } else {
        safe.APIKey = "****"
    }
    return safe
}
```

---

### 2. `searchTags` 存在与 `getTags` 相同的 bug

**文件**：`commons/http/ApiClient.js:284-287`

```javascript
async function searchTags(query) {
  const resp = await request('GET', `/api/tags?query=${query}`);
  return resp?.tags && Array.isArray(resp.tags) ? resp.tags : resp;
  //                                                        ^^^
  //              当 resp.tags 为 null 时，返回整个响应对象而非空数组
}
```

当 API 返回 `{ tags: null, ... }` 时（Go nil slice 序列化为 JSON null），fallback 返回整个响应对象。调用方对结果调用 `.map()` 会崩溃。

**修复建议**：

```javascript
async function searchTags(query) {
  const resp = await request('GET', `/api/tags?query=${query}`);
  if (resp?.tags && Array.isArray(resp.tags)) return resp.tags;
  return [];
}
```

---

### 3. AI 输出 XSS 防护不足

**文件**：`features/notes/AIPanel.jsx:8-14, 149`

```javascript
function sanitizeHTML(html) {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/\bon\w+\s*=/gi, 'data-blocked=')
    .replace(/javascript:/gi, 'blocked:');
}

// ...
<div dangerouslySetInnerHTML={{ __html: rendered }} />
```

当前 sanitizer 只过滤了 `<script>` 和 `on*` 事件属性，但 AI 生成的内容可能包含：

- `<iframe src="javascript:alert(1)">`
- `<img src=x onerror=alert(1)>`（`onerror` 被过滤，但 `<svg onload=...>` 可能绕过）
- `<details open ontoggle=alert(1)>`（`ontoggle` 匹配 `\bon\w+` 但需确认）
- CSS 表达式：`style="background: expression(alert(1))"`
- `<math><mtext><table><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>">`

**修复建议**：使用成熟的 DOMPurify 库：

```javascript
import DOMPurify from 'dompurify';
const rendered = DOMPurify.sanitize(renderMarkdown(msg.content));
```

---

### 4. SSRF 防护需确认调用

**文件**：`features/ai/ai.go`

`validateBaseURL()` 函数已定义，检查私有 IP 地址。但需确认 `HandleFetchModels` 和 `HandleProcessAI` 中是否实际调用了它。如果未调用：

- 攻击者可配置 `http://169.254.169.254/latest/meta-data/` 读取云元数据
- 可配置 `http://localhost:8080/api/` 访问内部 API
- 可配置 `file:///etc/passwd` 读取本地文件（取决于 HTTP 客户端实现）

**修复建议**：在 `HandleFetchModels` 和 `HandleProcessAI` 入口处添加：

```go
if err := validateBaseURL(config.BaseURL); err != nil {
    utils.SendErrorResponse(w, "INVALID_URL", "URL not allowed", err, http.StatusBadRequest)
    return
}
```

---

### 5. 笔记全文发送到外部 API 无确认机制

**文件**：`features/notes/AIPanel.jsx:55`

```javascript
ApiClient.processWithAI(selectedConfigId, text, fullContent || "", selectedText || "")
```

笔记全文（可能包含敏感个人信息）被发送到用户配置的第三方 AI API，且：
- 无发送前确认对话框
- 无内容大小限制提示
- 后端日志可能记录请求体

**修复建议**：
- 首次使用时显示隐私提示弹窗
- 显示将发送的内容长度
- 后端 `slog` 中不记录 `fullContent` 字段

---

## 🟡 中等问题

### 6. `EmptyTrash` 大量重复代码

**文件**：`features/notes/notes_actions.go:140-228`

`shouldOnlyClearExpired` 两个分支的查询+扫描逻辑几乎完全相同（约 40 行重复），只有 SQL WHERE 条件不同。

**修复建议**：

```go
func EmptyTrash(onlyExpired bool) error {
    query := `SELECT note_id FROM notes WHERE deleted_at IS NOT NULL`
    var args []interface{}
    if onlyExpired {
        query += ` AND deleted_at < ?`
        args = append(args, time.Now().AddDate(0, 0, -30))
    }

    rows, err := sqlite.DB.Query(query, args...)
    // ... 统一的扫描和删除逻辑
}
```

---

### 7. `SlashCommandMenu` 每次渲染创建 Canvas

**文件**：`features/notes/SlashCommandMenu.jsx:47-62`

```javascript
const position = (() => {
    const canvas = document.createElement('canvas'); // 每次渲染都创建
    const ctx = canvas.getContext('2d');
    ctx.font = `...`;
    // ... 测量文字宽度
})();
```

每次渲染都创建新的 `<canvas>` 元素进行文字测量，且未清理。

**修复建议**：

```javascript
const canvasRef = useRef(null);
function getMeasureContext() {
    if (!canvasRef.current) canvasRef.current = document.createElement('canvas');
    return canvasRef.current.getContext('2d');
}
```

---

### 8. `NotesEditor` 状态过多

**文件**：`features/notes/NotesEditor.jsx:43-61`

组件包含 12+ state 变量和 6+ ref，职责过重：

```
showLinkPicker, linkPickerPos, backlinks, isBacklinksLoading,
showAIModal, aiMessages, slashMenu, skipSlashCheck,
pendingCursorPos, slashUndoStack, lastCtrlPress, isEditable,
title, content, tags, isSaveLoading, showTemplatePicker...
```

**修复建议**：提取自定义 hook：
- `useAIPanel()` → AI 面板状态和操作
- `useSlashCommands()` → 斜杠命令检测、菜单状态、执行
- `useCursorManager()` → 光标保存/恢复

---

### 9. `SidebarTagsList` guard 不防御非数组 tags

**文件**：`features/tags/SidebarTagsList.jsx:385-399`

```javascript
if (!orderedTags || orderedTags.length === 0) {
    if (!tags || tags.length === 0) {
        return (...); // 只在两者都为空时提前返回
    }
}
const displayTags = orderedTags.length > 0 ? orderedTags : tags;
const treeItems = displayTags.map(tag => ...); // tags 可能不是数组！
```

当 `tags` 是非空非数组对象时（虽然已在 `getTags` 修复，但防御性编程应双重保障），guard 不生效。

**修复建议**：

```javascript
const rawTags = orderedTags.length > 0 ? orderedTags : tags;
const displayTags = Array.isArray(rawTags) ? rawTags : [];
```

---

### 10. 表格生成逻辑重复

**文件**：
- `features/notes/SlashCommandMenu.jsx:36-41` — `generateTable()` 函数
- `features/notes/NotesEditor.jsx:329-331` — 内联重复

**修复建议**：统一使用 `SlashCommandMenu` 已导出的 `generateTable`。

---

### 11. `pendingCursorPos` useEffect 无依赖数组

**文件**：`features/notes/NotesEditor.jsx:67-77`

```javascript
useEffect(() => {
    if (pendingCursorPos.current && textareaRef.current) {
        // 恢复光标...
        setTimeout(() => { ... }, 200);
    }
}); // 无依赖数组 → 每次渲染都执行
```

每次渲染都执行光标恢复逻辑。虽然这是有意为之（受控 textarea 会重置光标），但：
- 应添加注释说明为什么无依赖数组
- 考虑使用 `useLayoutEffect` 减少视觉闪烁

---

### 12. 多个文件缺少末尾换行符

以下文件末尾缺少 `\n`，会导致 git diff 噪音和某些工具警告：

- `features/settings/AiPane.jsx`
- `features/settings/SettingsModal.jsx`
- `commons/http/ApiClient.js`

---

## 🟢 建议

### 13. 内容更新模式可提取工具函数

`NotesEditor` 中多处重复：

```javascript
setContent(newContent);
onContentChange(newContent);
```

建议提取：

```javascript
function updateContent(value) {
    setContent(value);
    onContentChange(value);
}
```

---

### 14. `AiPane.jsx` 的 `configId > 0` 假设

```jsx
{!config.isDefault && config.configId > 0 && (
    <button onClick={() => handleSetDefault(config.configId)}>...</button>
)}
```

假设 configId 0 是特殊的"默认"配置。更安全的做法是使用显式标志或检查名称。

---

### 15. `fetchAIModels` 只支持 OpenAI 兼容格式

函数假定 `/v1/models` 响应格式。如果用户配置了 Anthropic、Cohere 等非兼容 API，会返回空列表。应在 UI 中提示支持的 API 格式。

---

### 16. CSS z-index 应遵循项目约定

CLAUDE.md 定义的层级系统：
- `z-index: 1` — 基础覆盖（编辑器组件、下拉菜单）
- `z-index: 2` — 模态背景、移动端导航栏
- `z-index: 3` — 交互内容（Toast、侧边栏内容、Tooltip）
- `z-index: 4` — 关键通知

`AIPanel.css`、`SlashCommandMenu.css` 中的 z-index 值应与此对齐。

---

### 17. `useEffect` 依赖数组中使用可选链

**文件**：`features/notes/NotesEditor.jsx:114`

```javascript
}, [selectedNote?.noteId, selectedNote?.content, selectedNote?.tags]);
```

可选链在依赖数组中是合法的，但当 `selectedNote` 从 `null` 变为对象时，Preact 可能无法正确比较 `undefined` vs 实际值。建议：

```javascript
const noteId = selectedNote?.noteId;
const noteContent = selectedNote?.content;
const noteTags = selectedNote?.tags;
// 在 useEffect 外提取，依赖中使用简单变量
```

---

## 总体评价

| 维度 | 评分 | 说明 |
|------|------|------|
| 功能完整性 | ⭐⭐⭐⭐ | AI 集成、标签层级、反向链接、斜杠命令均实现完整 |
| 代码质量 | ⭐⭐⭐ | 结构清晰，但 NotesEditor 复杂度高，部分重复代码 |
| 安全性 | ⭐⭐ | API Key 泄露、XSS 防护不足、SSRF 需确认 |
| 性能 | ⭐⭐⭐⭐ | SQL 查询设计合理（窗口函数避免 N+1），前端有少量可优化点 |
| 可维护性 | ⭐⭐⭐ | 模块拆分合理，但编辑器组件需进一步解耦 |

**合并建议**：优先修复 🔴 级别问题（特别是 #1 API Key 泄露和 #3 XSS 防护）后再合并。🟡 级别问题可在后续迭代中修复。
