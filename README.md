# 章序 · 论文的项目管理器

像看板一样管章节，像 Overleaf 一样出稿——但**文件全在你本地，离线可用**。

> 每章是一张可拖拽的卡片，点开就是 LaTeX 编辑器，写完一键编译成 PDF。
> 项目就是一个普通文件夹（`manifest.json` + 每章 `.tex`），哪怕软件挂了，用 VS Code 打开照样写。

## 为什么做这个

现有工具各缺一块：Overleaf 有编译和协作但没有章节级看板；Scrivener 有看板和大纲但没有 LaTeX 与引用；Obsidian 要拼插件才能出稿。**「看板 + 大纲 + LaTeX 编译 + 本地优先」没人做成一个完整产品**——章序填这个空白。

## 功能

| 视图 | 能力 |
|---|---|
| 章节看板 | 四列状态（构思中/初稿/修改中/已定稿），卡片可拖拽改状态与顺序 |
| 论文大纲 | 拖拽行调整章节顺序，标题/摘要内联编辑，状态切换 |
| 写作台 | CodeMirror 6 + LaTeX 语法高亮、800ms 自动保存；PDF 实时预览，源码/分屏/预览三布局 |
| 编译 | 一键调用内嵌 tectonic 出 PDF，中文开箱即用；错误可点击定位到出错行 |

**技术栈**：Tauri 2（Rust）+ React 18 + TypeScript + Vite + CodeMirror 6 + pdfjs-dist + tectonic 0.17

## 快速开始

**直接用**：前往 [Releases](../../releases) 下载 Windows 安装包（`.msi`），双击安装即可。tectonic 已内嵌，无需安装 TeX Live 或中文字体。

**从源码运行**（需 Node.js 18+、Rust stable、Windows 上另需 VS Build Tools 的 C++ 工作负载）：

```bash
cd zhangxu-app
npm install
npm run tauri dev        # 开发模式
npm run tauri build      # 构建安装包
```

## 中文编译（重要）

LaTeX 默认配置会**丢掉所有中文字符**（只警告不报错，PDF 里中文是空白）。章序的模板已固化正确配置：`ctexart` 文档类 + XeTeX 引擎 + Fandol 字体（ctex 自动下载，无需手动安装）。详见 [完整 README](zhangxu-app/README.md)。

## 文档

- [完整 README](zhangxu-app/README.md) — 功能、数据格式、环境准备
- [产品方案](论文写作看板工具-产品方案.md) — 市场空白、功能清单、技术架构、开发里程碑

## License

见 [LICENSE](LICENSE)。
