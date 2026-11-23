# 章序 · 论文的项目管理器

像看板一样管章节，像 Overleaf 一样出稿——但**文件全在你本地，离线可用**。

> 每章是一张可拖拽的卡片，点开就是 LaTeX 编辑器，写完一键编译成 PDF。
> 项目就是一个普通文件夹（`manifest.json` + 每章 `.tex`），哪怕软件挂了，用 VS Code 打开照样写。

## 为什么做这个

现有工具各缺一块：Overleaf 有编译和协作但没有章节级看板；Scrivener 有看板和大纲但没有 LaTeX 与引用；Obsidian 要拼插件才能出稿。**"看板 + 大纲 + LaTeX 编译 + 本地优先"没人做成一个完整产品**——章序填这个空白。

## 功能

| 视图 | 能力 |
|---|---|
| 章节看板 | 四列状态（构思中/初稿/修改中/已定稿），卡片可拖拽改状态与顺序，落点有插入线提示 |
| 论文大纲 | 拖拽行调整章节顺序，标题/摘要内联编辑，状态圆点下拉切换 |
| 写作台 | CodeMirror 6 + LaTeX 语法高亮、行号、800ms 自动保存；右侧 PDF 实时预览，支持源码/分屏/预览三布局 |
| 编译 | 一键调用内嵌 tectonic 出 PDF，中文开箱即用；错误列表可点击定位到出错行，可展开完整日志 |

**技术栈**：Tauri 2（Rust）+ React 18 + TypeScript + Vite + CodeMirror 6 + pdfjs-dist + tectonic 0.17

## 快速开始

### 直接用（推荐）

前往 [Releases](../../releases) 下载 Windows 安装包（`.msi`），双击安装即可。**tectonic 已内嵌**，无需安装 TeX Live 或中文字体。

### 从源码运行

需要的环境：

- Node.js 18+ 与 npm
- Rust 工具链（[rustup](https://rustup.rs/)，stable）
- Windows 上还需 [VS Build Tools](https://visualstudio.microsoft.com/downloads/)（勾选"C++ 桌面开发"）与 WebView2（Win11 自带）
- 仓库内 `src-tauri/resources/tectonic.exe`（已随仓库提供，约 49MB）

```bash
cd zhangxu-app
npm install
npm run tauri dev        # 开发模式
npm run tauri build      # 构建安装包，输出到 src-tauri/target/release/bundle/msi/
```

## 中文编译说明（重要）

LaTeX 默认配置会**丢掉所有中文字符**（只警告不报错，PDF 里中文是空白，很容易写完才发现）。章序的模板已固化正确配置：

- 文档类：`ctexart`（而非 `article`）
- 引擎：XeTeX（`tectonic.toml` 里 `[build] engine = "XeTeX"`）
- 字体：ctex 会自动下载 Fandol 中文字体，用户**无需手动安装**

新建项目自动套用这套模板。若你自己改 `main.tex`，请保留 `\documentclass[UTF8]{ctexart}` 这一行。

## 数据格式

项目就是一个文件夹：

```
我的论文/
├── manifest.json          # 唯一数据源：元数据 + 章节列表（状态、顺序、文件）
├── main.tex               # 由 manifest 自动生成 \input{} 顺序
├── tectonic.toml          # 固定用 XeTeX 引擎
├── chapters/              # 每章独立 .tex
├── figures/
└── notes/
```

看板拖拽改状态或顺序后，`manifest.json` 与 `main.tex` 的 `\input{}` 顺序自动同步。**文件即真相**——数据不锁在软件里。

## 开发路线

M0（技术验证）→ M1（看板+文件系统）→ M2（大纲+重排）→ M3（编译闭环+PDF预览）均已完成。
下一步：M4 打磨（分屏对照、快捷键、UI 细节）、M5 用真实论文验证。

完整方案见仓库根目录 `论文写作看板工具-产品方案.md`。

## License

待定。
