<p align="center">
  <img width="256" src="assets/android-chrome-512x512.png">
  <h1 align="center">Zen</h1>
  <p align="center">
    <a href="https://zendemo.fly.dev">Live Demo</a> •
    <a href="http://sheshbabu.com/zen/">Features</a> •
    <a href="https://x.com/sheshbabu">Updates</a>
  </p>
</p>

<p align="center"><img src="https://github.com/sheshbabu/zen/blob/master/docs/screenshot.png?raw=true"/></p>

English | [中文](./readme-cn.md)

### Features
* Single Go binary or Docker Compose
* Low resource usage
* Standard Markdown files, local SQLite database
* Organize with flexible tags, not rigid folders
* Markdown features like tables, code blocks, task lists, highlights, and more
* Full-text search with BM25 ranking
* Import and export data with full portability
* Templates
* Pinned notes
* Archive and soft delete notes
* Minimal dependency footprint
* Automated backups (via [Zen Backup](https://github.com/sheshbabu/zen-backup))

### Add Features
* Add multilingual support
* Add code block copy functionality
* Support custom ID navigation
* Add a table of contents on the right side with navigation support
* Support more Markdown syntax
* Add tag count, tag moving up/down, and drag-and-drop sorting
* Untagged notes filter (sidebar entry with count display)
* Image cleanup: auto-register disk files, rebuild note-image associations
* Markdown render internal note links, open in modal or navigate on click
* Press <kbd>Ctrl+L</kbd> in the editor to search and insert internal note links

### New Features
* AI assistant with multi-provider config, conversation history, floating panel, and double-<kbd>Ctrl</kbd> to activate
* Slash commands: headings (/h1 /h2 /h3), callouts (/v1-/v5), lists (/l1 /l2 /l3), table, /link
* Command palette (<kbd>Ctrl+Shift+P</kbd>)
* Tag hierarchy with colors, focus mode, and pinyin matching for search
* Backlinks panel with collapse/expand toggle
* S3-compatible image and attachment storage with presigned URLs and <kbd>Ctrl+V</kbd> paste
* Export/import preserves tag hierarchy, color, sortOrder, and pinned notes; YAML frontmatter support
* Bulk note actions (pin, archive, delete) with content size display
* Note list action buttons (pin, archive, delete) and edit button
* Dark theme support for highlight.js code blocks
* Editor expanded to 1200px with fit-to-window button
* Canvas server-side persistence with middle-mouse-button panning
* Code block wrap toggle and width adaptation
* Insert full AI conversation button
* Security hardening: XSS sanitization, SSRF protection, prompt injection prevention
* Copy markdown button next to TOC toggle
* Auto-hide empty tags, auto-cleanup unused tags, parent tag includes child notes
* Dynamic tag counts and section titles
* MCP tools: create_note, image upload
* Save without exiting editor
* NotesEditor refactoring with improved edit flow

### Experimental Features
* Canvas for spatial organization of notes and images (stored as [JSON Canvas](https://jsoncanvas.org/docs/apps/))
* Semantic search for notes and images (via [Zen Intelligence](https://github.com/sheshbabu/zen-intelligence))
* Similar images (via [Zen Intelligence](https://github.com/sheshbabu/zen-intelligence))
* MCP for searching, listing and reading notes

### Installation
Build from source
```shell
$ make build
```

### Local Development
Run the application using default configuration
```shell
$ make dev
```

Run the application in watch mode

Install [air](https://github.com/air-verse/air) and [esbuild](https://esbuild.github.io)

```shell
$ go install github.com/air-verse/air@latest
$ go install github.com/evanw/esbuild/cmd/esbuild@latest
```

```shell
$ make watch
```

### Schema Migrations
* Create new migration file under `./migrations`
* Use the format `<version>_<title>.sql`

### Image Versioning
```bash
$ git tag x.y.z
$ git push origin x.y.z
```

### Contributions
This is a personal project built for my own use. The codebase is available for forking and modifications. Note that I may not actively review pull requests or respond to issues due to time constraints.

### Thanks
* [go-sqlite3](https://github.com/mattn/go-sqlite3)
* [Standalone Preact Builder](https://standalonepreact.satge.net)
* [markdown-it](https://markdown-it.github.io)
* [highlight.js](https://highlightjs.org)
* [Lucide Icons](https://lucide.dev)
* [CSS Reset](https://www.joshwcomeau.com/css/custom-css-reset/)
* [Konva.js](https://konvajs.org)
