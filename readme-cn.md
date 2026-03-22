<p align="center">
  <img width="256" src="assets/android-chrome-512x512.png">
  <h1 align="center">Zen</h1>
  <p align="center">
    <a href="https://zendemo.fly.dev">在线演示</a> •
    <a href="http://sheshbabu.com/zen/">功能特性</a> •
    <a href="https://x.com/sheshbabu">更新动态</a>
  </p>
</p>

<p align="center"><img src="https://github.com/sheshbabu/zen/blob/master/docs/screenshot.png?raw=true"/></p>

[English](./readme.md) | 中文

### 功能特性
* 单一 Go 二进制文件或 Docker Compose 部署
* 低资源占用
* 标准 Markdown 文件，本地 SQLite 数据库
* 通过灵活标签组织，摒弃僵化文件夹
* 支持表格、代码块、任务列表、高亮等 Markdown 特性
* 基于 BM25 排序的全文搜索
* 数据导入导出，完全可移植
* 模板功能
* 置顶笔记
* 笔记归档与软删除
* 极简依赖项
* 自动备份（通过 [Zen Backup](https://github.com/sheshbabu/zen-backup)）

### 添加功能
* 添加多语言支持
* 添加代码框复制功能
* 支持自定义 ID 跳转
* 右侧添加目录，支持跳转
* 支持更多 markdown 语法
* 添加标签计数，标签上下移动及拖拽排序

### 实验性特性
* 画布：支持笔记与图片的空间化组织（存储为 [JSON Canvas](https://jsoncanvas.org/docs/apps/) 格式）
* 笔记与图片的语义搜索（通过 [Zen Intelligence](https://github.com/sheshbabu/zen-intelligence)）
* 相似图片查找（通过 [Zen Intelligence](https://github.com/sheshbabu/zen-intelligence)）
* 用于搜索、列出和阅读笔记的 MCP 协议支持

### 安装
从源码构建
```shell
$ make build
```

### 本地开发
使用默认配置运行应用
```shell
$ make dev
```

以监听模式运行应用

安装 [air](https://github.com/air-verse/air) 和 [esbuild](https://esbuild.github.io)

```shell
$ go install github.com/air-verse/air@latest
$ go install github.com/evanw/esbuild/cmd/esbuild@latest
```

```shell
$ make watch
```

### 数据库模式迁移
* 在 `./migrations` 目录下创建新的迁移文件
* 文件命名格式为 `<版本号>_<标题>.sql`

### 镜像版本标记
```bash
$ git tag x.y.z
$ git push origin x.y.z
```

### 贡献指南
这是一个为个人使用而构建的项目。代码库可供分叉和修改。请注意，由于时间限制，我可能无法积极审核拉取请求或回复问题。

### 致谢
* [go-sqlite3](https://github.com/mattn/go-sqlite3)
* [Standalone Preact Builder](https://standalonepreact.satge.net)
* [markdown-it](https://markdown-it.github.io)
* [highlight.js](https://highlightjs.org)
* [Lucide Icons](https://lucide.dev)
* [CSS Reset](https://www.joshwcomeau.com/css/custom-css-reset/)
* [Konva.js](https://konvajs.org)