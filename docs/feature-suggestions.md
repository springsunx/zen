# Zen 功能优化建议

> 基于对项目代码（Go 后端 + Preact 前端）的深度分析，按**价值/成本比**从高到低排列。

---

## 🏆 第一梯队：高价值、低成本（建议优先做）

### 1. 自动保存（Auto-save）

**现状**：编辑器需要手动点"保存"，如果忘记保存就切换笔记或刷新页面，内容会丢失。

**建议**：在 `NotesEditor.jsx` 中已有 `onBlur` 事件，可以加一个 debounce 的自动保存：

- 用户停止输入 2~3 秒后自动触发 `ApiClient.updateNote()`
- 工具栏显示"已保存"状态指示器
- 避免频繁请求，用防抖控制频率

**改动范围**：仅 `NotesEditor.jsx` + 新增一个 `useAutoSave` hook，工作量极小。

---

### 2. 斜杠命令（Slash Commands）

**现状**：编辑器有格式化工具栏，但每次都要鼠标点击或记快捷键。

**建议**：在 textarea 中检测 `/` 触发弹出菜单，提供：

- `/h1` `/h2` `/h3` — 插入标题
- `/code` — 插入代码块
- `/task` — 插入任务列表
- `/table` — 插入表格模板
- `/link` — 插入内部笔记链接（复用现有 `NoteLinkPicker`）
- `/template` — 插入模板（复用现有 `TemplatePicker`）

**改动范围**：新增一个 `SlashCommandMenu` 组件 + 在 textarea 的 `onInput` 中加监听，不改后端。

---

### 3. 键盘快捷键增强

**现状**：已有 `Ctrl+N`（新建）、`Ctrl+K`（搜索）、`Ctrl+L`（插入链接），但覆盖面不够。

**建议补充**：

- `Ctrl+S` — 保存当前笔记（已有 `useEditorKeyboardShortcuts.js`，扩展即可）
- `Ctrl+Shift+A` — 归档
- `Ctrl+Shift+D` — 删除
- `Ctrl+E` — 切换编辑/预览模式
- `Ctrl+P` — 切换置顶
- `Ctrl+1/2/3` — 切换列表/卡片/画廊视图

**改动范围**：扩展 `useEditorKeyboardShortcuts.js` + `NotesPage.jsx` 中的全局快捷键，不改后端。

---

### 4. 标签层级（Nested Tags）

**现状**：标签是扁平结构，只能通过 Focus Mode 分组。

**建议**：支持 `parent/child` 语法的标签，例如：

- 输入 `work/meeting` 自动创建 `work` 父标签
- 侧边栏显示为树形结构（可折叠）
- 点击父标签显示所有子标签下的笔记

**实现方式**：

- 数据库：`tags` 表加 `parent_id` 列（新 migration）
- 后端：修改 `GetFilteredTags` 查询支持层级
- 前端：`SidebarTagsList` 改为树形渲染

---

### 5. 日记/每日笔记（Daily Notes）

**现状**：没有时间线视图，每次都要手动创建笔记。

**建议**：侧边栏加"今日笔记"入口，点击自动：

- 查找今天创建的笔记，不存在则用模板自动创建
- 模板可用 `{{date}}` 占位符（模板系统已支持）
- 按日期列表浏览历史日记

**实现方式**：

- 后端：新增 `GET /api/notes/today` 端点，按日期查询
- 前端：侧边栏加按钮 + 日历选择器组件
- 利用现有模板系统，零额外数据模型改动

---

## 🥈 第二梯队：中等价值、中等成本

### 6. 反向链接（Backlinks）

**现状**：内部笔记链接 `[title](/notes/123)` 已能渲染和跳转，但看不到"谁引用了当前笔记"。

**建议**：在笔记编辑器底部添加"反向链接"区域，显示所有引用了当前笔记的其他笔记。

**实现方式**：

- 后端：新增查询，用正则或 FTS 搜索 content 中包含 `/notes/{noteId}` 的笔记
- 前端：`NotesEditor.jsx` 底部加 `BacklinksPanel` 组件
- 这是知识管理应用的标配功能，对 Zettelkasten 用户尤其重要

---

### 7. 命令面板（Command Palette）

**现状**：`Ctrl+K` 打开搜索菜单，但只能搜索笔记/标签。

**建议**：扩展为全功能命令面板（类似 VS Code 的 `Ctrl+Shift+P`）：

- 搜索笔记（现有功能）
- 执行操作：新建笔记、归档、删除、切换视图、切换主题
- 搜索模板并应用
- 切换 Focus Mode

**实现方式**：扩展现有 `SearchMenu.jsx`，增加"操作"分类。

---

### 8. 笔记版本历史

**现状**：更新笔记直接覆盖内容，无法回溯。

**建议**：

- 数据库新增 `note_revisions` 表（`note_id`, `content`, `created_at`）
- 每次保存时自动创建版本快照
- 编辑器工具栏加"历史"按钮，可浏览和恢复旧版本

**权衡**：会增加数据库体积。可以限制保留最近 20 个版本，或只在内容变化超过一定比例时保存。

---

### 9. 图片压缩与 WebP 支持

**现状**：`images.go` 中上传只支持 jpg/jpeg/png/gif，不做任何压缩处理。

**建议**：

- 上传时自动压缩（利用 Go 标准库 `image` + `golang.org/x/image`）
- 支持 WebP 格式（`go.mod` 已引入 `golang.org/x/image`）
- 可选：生成缩略图用于列表/卡片视图，减少加载带宽

**实现方式**：在 `HandleUploadImage` 的 `io.Copy` 之前加压缩逻辑，`isImageFile()` 加 `.webp` 判断。

---

### 10. Markdown 渲染增强

**现状**：已加载大量 markdown-it 插件（alert、emoji、footnote、tasklist 等），但还缺一些常用语法。

**建议**：

- **Mermaid 图表**：流程图、时序图、甘特图（技术笔记刚需）
- **Callout/Admonition**：`> [!NOTE]` `> [!WARNING]` 语法（已有 `plugin-alert.js`，可扩展）
- **数学公式增强**：已有 `plugin-katex`，确认是否完整支持

---

## 🥉 第三梯队：高价值、较高成本（长期规划）

### 11. 多用户/共享

**现状**：单用户设计（`HasUsers()` 检查只允许一个用户）。

**建议**：如果想扩展为团队使用：

- 支持多用户注册
- 笔记可设置为"公开"或"共享"
- 需要改 `users.go` 的限制逻辑 + 笔记权限模型

---

### 12. Webhook / 笔记事件

**现状**：MCP 只读，没有外部集成点。

**建议**：

- 笔记创建/更新/删除时触发 webhook
- 可接入 n8n、IFTTT 等自动化工具
- 配置界面在 Settings 中

---

### 13. Canvas 增强

**现状**：Canvas 支持笔记节点、便签、图片节点，基于 Konva.js。

**建议**：

- **节点间连线**：类似 Obsidian Canvas 的箭头连接
- **分组框**：将多个节点归为一组
- **从笔记创建 Canvas**：拖拽笔记到画布自动创建节点
- **Canvas 模板**：预设布局（如看板、时间线）

---

### 14. 离线优先增强

**现状**：已有 Service Worker + IndexedDB 缓存（`ApiCache.js`、`NotesCache.js`），但只用于 GET 请求的降级。

**建议**：

- 离线时创建/编辑的笔记暂存到 IndexedDB
- 恢复在线后自动同步（需要冲突解决策略）
- 这对移动端使用场景尤其重要

---

## 💡 小而美的改进（Quick Wins）

| 改进 | 说明 |
|------|------|
| **笔记字数统计** | 编辑器底部显示字数/字符数/预计阅读时间 |
| **笔记复制** | 工具栏加"复制为新笔记"按钮 |
| **批量标签操作** | 多选笔记后批量修改标签（已有批量删除/归档） |
| **标签颜色** | 为标签设置颜色，列表中用彩色徽章显示 |
| **导出为 HTML/PDF** | 利用已有 markdown 渲染能力，加导出按钮 |
| **拖拽排序笔记** | 列表视图中拖拽调整顺序（目前只有标签支持拖拽排序） |
| **笔记置顶数量限制** | 避免全部置顶，可限制最多 5 个 |
| **搜索历史** | `SearchHistory.js` 已存在但似乎未完全使用，可以展示最近搜索 |

---

## 📅 推荐实施路线

### 第一阶段（1~2 周）

自动保存 + 斜杠命令 + 键盘快捷键增强 + Quick Wins 中的字数统计和笔记复制

> 这些改动小、体验提升大。

### 第二阶段（2~4 周）

标签层级 + 每日笔记 + 反向链接

> 这三个组合起来让 Zen 从"记事本"升级为"知识管理工具"。

### 第三阶段（长期）

命令面板 + 版本历史 + 图片压缩 + 离线增强

---

## 关键文件参考

| 功能模块 | 关键文件 |
|---------|---------|
| 编辑器 | `features/notes/NotesEditor.jsx` |
| 编辑器快捷键 | `features/notes/useEditorKeyboardShortcuts.js` |
| 编辑器工具栏 | `features/notes/NotesEditorToolbar.jsx` |
| 笔记列表 | `features/notes/NotesList.jsx` |
| 笔记页面 | `features/notes/NotesPage.jsx` |
| 笔记后端 | `features/notes/notes.go`, `features/notes/notes_model.go` |
| 标签模型 | `features/tags/tags_model.go` |
| 标签侧边栏 | `features/tags/SidebarTagsList.jsx` |
| 搜索 | `features/search/search.go`, `features/search/SearchMenu.jsx` |
| 模板 | `features/templates/templates.go` |
| 图片上传 | `features/images/images.go` |
| Canvas | `features/canvas/canvases.go` |
| 前端 API | `commons/http/ApiClient.js` |
| 状态管理 | `commons/contexts/NotesContext.jsx`, `commons/contexts/AppContext.jsx` |
| 缓存 | `commons/storage/ApiCache.js`, `commons/storage/NotesCache.js` |
| 数据库迁移 | `migrations/` 目录 |

---

## 🔧 命令行参数支持

### 当前配置方式

目前所有配置都通过环境变量管理：

| 环境变量 | 默认值 | 用途 |
|---------|--------|------|
| `PORT` | `8080` | 服务端口 |
| `DEV_MODE` | `"false"` | 开发模式 |
| `IMAGES_FOLDER` | `./images` | 图片存储路径 |
| `DATA_FOLDER` | `.` | 数据库存储路径 |
| `INTELLIGENCE_ENABLED` | `"false"` | AI 功能开关 |
| `ZEN_INTELLIGENCE_URL` | `http://localhost:8001` | AI 服务地址 |

### 推荐方案：Go 标准库 `flag`

不引入第三方依赖（符合项目"极简依赖"哲学），支持 `--flag` 和环境变量双模式，**命令行参数优先级高于环境变量**。

### 建议支持的参数

```
zen [flags]

服务配置:
  --port int            服务端口 (default 8080, env: PORT)
  --host string         绑定地址 (default "0.0.0.0")
  --dev                 开发模式，从文件系统读取资源 (env: DEV_MODE)

存储配置:
  --data string         数据库目录 (default ".", env: DATA_FOLDER)
  --images string       图片存储目录 (default "./images", env: IMAGES_FOLDER)

功能开关:
  --intelligence        启用 AI 功能 (env: INTELLIGENCE_ENABLED)
  --intelligence-url    AI 服务地址 (default "http://localhost:8001", env: ZEN_INTELLIGENCE_URL)

子命令:
  zen serve             启动服务器 (默认行为)
  zen version           显示版本信息
  zen migrate           仅执行数据库迁移
  zen --help            显示帮助
```

### 实现思路

```go
package main

import (
    "flag"
    "fmt"
    "os"
)

var version = "dev" // 编译时通过 -ldflags 注入

func main() {
    port := flag.Int("port", getEnvInt("PORT", 8080), "服务端口")
    host := flag.String("host", "0.0.0.0", "绑定地址")
    devMode := flag.Bool("dev", os.Getenv("DEV_MODE") == "true", "开发模式")
    dataFolder := flag.String("data", getEnv("DATA_FOLDER", "."), "数据库目录")
    imagesFolder := flag.String("images", getEnv("IMAGES_FOLDER", "./images"), "图片目录")
    intelligence := flag.Bool("intelligence", os.Getenv("INTELLIGENCE_ENABLED") == "true", "启用 AI 功能")
    intelligenceURL := flag.String("intelligence-url", getEnv("ZEN_INTELLIGENCE_URL", "http://localhost:8001"), "AI 服务地址")

    flag.Usage = printUsage
    flag.Parse()

    args := flag.Args()
    if len(args) > 0 {
        switch args[0] {
        case "version":
            fmt.Printf("zen %s\n", version)
            return
        case "migrate":
            // 仅执行迁移
            return
        case "serve":
            // 继续启动服务器
        }
    }

    startServer(*port, *host, *devMode, *dataFolder, *imagesFolder, *intelligence, *intelligenceURL)
}

func getEnv(key, fallback string) string {
    if v := os.Getenv(key); v != "" {
        return v
    }
    return fallback
}
```

### 版本注入（Makefile）

```makefile
VERSION := $(shell git describe --tags --always --dirty)

build:
	esbuild index.js --bundle --minify --format=esm --outfile=assets/bundle.js --loader:.js=jsx --jsx-factory=h --jsx-fragment=Fragment
	go build --tags "fts5" -ldflags "-X main.version=$(VERSION)" -o zen .
```

### 实施路线

**第一阶段（基础 CLI）**：
- `--port`, `--data`, `--images`, `--dev` — 覆盖现有环境变量
- `zen version` 子命令
- `--help` 自动支持

**第二阶段（增强）**：
- `--intelligence`, `--intelligence-url`
- `zen migrate` 子命令（仅迁移不启动服务，适合 Docker 初始化）
- `--host` 绑定地址

**第三阶段（可选）**：
- `--config` 指定配置文件路径（TOML/YAML）
- `zen export` / `zen import` 命令行导入导出
- `zen backup` 数据库备份命令
