import { useState, useCallback, useRef, useEffect } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import * as api from "./api";
import type { ProjectInfo, Chapter, CompileResult } from "./types";
import { STATUS_META, STATUS_KEYS } from "./types";
import LatexEditor, { type LatexEditorHandle } from "./LatexEditor";
import PdfPreview from "./PdfPreview";
import SettingsPanel from "./SettingsPanel";
import ShortcutsHelp from "./ShortcutsHelp";
import { useSettings, countWords } from "./utils";
import "./App.css";

type View = "board" | "outline" | "writing";

function App() {
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [view, setView] = useState<View>("board");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [content, setContent] = useState("");
  const [compiling, setCompiling] = useState(false);
  const [compileMsg, setCompileMsg] = useState("");
  const [compileResult, setCompileResult] = useState<CompileResult | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [pdfVersion, setPdfVersion] = useState(0);
  const [editorLayout, setEditorLayout] = useState<"split" | "editor" | "preview">("split");
  const editorRef = useRef<LatexEditorHandle>(null);
  const [settings, updateSettings] = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const [draggingSplit, setDraggingSplit] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ status: string; beforeId: string | null } | null>(null);
  const [prompt, setPrompt] = useState<{
    kind: "input" | "confirm";
    title: string;
    message: string;
    defaultValue: string;
    confirmLabel: string;
    resolve: (value: string | null) => void;
  } | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSummary, setEditSummary] = useState("");
  const [editingStatusId, setEditingStatusId] = useState<string | null>(null);

  // Tauri WebView 里 window.prompt/confirm 不可用，改用应用内弹窗
  const askText = (title: string, message: string, defaultValue: string, confirmLabel = "确定") =>
    new Promise<string | null>((resolve) => {
      setPromptValue(defaultValue);
      setPrompt({ kind: "input", title, message, defaultValue, confirmLabel, resolve });
    });

  const askConfirm = (title: string, message: string, confirmLabel = "确定") =>
    new Promise<boolean>((resolve) => {
      setPrompt({
        kind: "confirm", title, message, defaultValue: "", confirmLabel,
        resolve: (v) => resolve(v !== null),
      });
    });

  const closePrompt = (value: string | null) => {
    prompt?.resolve(value);
    setPrompt(null);
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2600);
  }, []);

  const persist = useCallback(
    async (next: Chapter[]) => {
      if (!project) return;
      const sorted = [...next].sort((a, b) => a.order - b.order);
      try {
        await api.saveManifest(project.root, { ...project.manifest, chapters: sorted });
        setChapters(sorted);
        setProject({ ...project, manifest: { ...project.manifest, chapters: sorted } });
      } catch (e) {
        showToast(`保存失败: ${e}`);
      }
    },
    [project, showToast]
  );

  const handleCreate = async () => {
    try {
      const path = await openDialog({ directory: true, multiple: false, title: "选择项目存放文件夹" });
      if (!path) return;
      const title = await askText("新建论文", "给这篇论文起个名字", "我的论文", "创建");
      if (title === null) return;
      const info = await api.createProject(path, title);
      setProject(info);
      setChapters(info.manifest.chapters);
      setView("board");
      showToast(`项目已创建：${info.manifest.title}`);
    } catch (e) {
      showToast(`创建失败: ${e}`);
    }
  };

  const handleOpen = async () => {
    try {
      const path = await openDialog({ directory: true, multiple: false, title: "打开项目文件夹" });
      if (!path) return;
      const info = await api.openProject(path);
      setProject(info);
      setChapters(info.manifest.chapters);
      setView("board");
      showToast(`已打开：${info.manifest.title}`);
    } catch (e) {
      showToast(`打开失败: ${e}`);
    }
  };

  const handleAddChapter = async (status: string) => {
    if (!project) return;
    const title = await askText("新建章节", "这个章节叫什么？", "新章节", "添加");
    if (title === null) return;
    try {
      const ch = await api.addChapter(project.root, title, status);
      const next = [...chapters, ch];
      await persist(next);
      showToast(`已添加章节：${title}`);
    } catch (e) {
      showToast(`添加失败: ${e}`);
    }
  };

  const handleDeleteChapter = async (ch: Chapter) => {
    if (!project) return;
    if (!(await askConfirm("删除章节", `确定删除「${ch.title}」？对应的 .tex 文件也会被删除。`, "删除"))) return;
    try {
      await api.deleteChapter(project.root, ch.id);
      const next = chapters.filter((c) => c.id !== ch.id);
      await persist(next);
      showToast("章节已删除");
    } catch (e) {
      showToast(`删除失败: ${e}`);
    }
  };

  const handleDrop = async (targetStatus: string) => {
    if (!dragId || !project) return;
    const ch = chapters.find((c) => c.id === dragId);
    const beforeId = dropTarget?.beforeId ?? null;
    setDragId(null);
    setDropTarget(null);
    if (!ch) return;

    // 从有序列表中移除拖拽项，再插入到目标位置
    const sorted = [...chapters].sort((a, b) => a.order - b.order);
    const rest = sorted.filter((c) => c.id !== dragId);
    const moved = { ...ch, status: targetStatus };

    let insertAt: number;
    if (beforeId && beforeId !== dragId) {
      insertAt = rest.findIndex((c) => c.id === beforeId);
    } else {
      // 放到该状态列的末尾
      insertAt = rest.reduce((acc, c, i) => (c.status === targetStatus ? i + 1 : acc), 0);
    }
    if (insertAt < 0) insertAt = rest.length;

    const next = [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)];
    const renumbered = next.map((c, i) => ({ ...c, order: i + 1 }));
    await persist(renumbered);

    const statusChanged = ch.status !== targetStatus;
    showToast(
      statusChanged
        ? `「${ch.title}」→ ${STATUS_META[targetStatus]?.label}，顺序与 main.tex 已同步`
        : `「${ch.title}」顺序已调整，main.tex 已同步`
    );
  };

  // ---------- 保存逻辑（防抖 + 切换前落盘） ----------
  const saveTimerRef = useRef<number | null>(null);
  const pendingRef = useRef<{ root: string; file: string; content: string } | null>(null);

  // 把待保存内容写入其记录的文件；写哪个文件由 pending 决定，不依赖闭包里的 activeChapter
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return;
    setSaveState("saving");
    try {
      await api.writeChapter(pending.root, pending.file, pending.content);
      setSaveState("saved");
      setCompileMsg("已自动保存");
    } catch (e) {
      setSaveState("dirty");
      showToast(`自动保存失败: ${e}`);
    }
  }, [showToast]);

  const handleContentChange = useCallback((value: string) => {
    setContent(value);
    if (!project || !activeChapter) return;
    pendingRef.current = { root: project.root, file: activeChapter.file, content: value };
    setSaveState("dirty");
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => { void flushSave(); }, settings.autoSaveMs);
  }, [project, activeChapter, flushSave, settings.autoSaveMs]);

  const saveNow = useCallback(() => { void flushSave(); }, [flushSave]);

  const openChapterForEdit = async (ch: Chapter) => {
    if (!project) return;
    try {
      // 切换前先落盘，避免旧章节的防抖回调写到新章节文件
      await flushSave();
      const text = await api.readChapter(project.root, ch.file);
      setContent(text);
      setActiveChapter(ch);
      setSaveState("saved");
      setView("writing");
    } catch (e) {
      showToast(`读取章节失败: ${e}`);
    }
  };

  // 大纲拖拽重排：按当前顺序生成 id 列表，插入到目标行之前
  const handleOutlineDrop = async (targetId: string) => {
    if (!dragId || !project || dragId === targetId) {
      setDragId(null);
      return;
    }
    const ch = chapters.find((c) => c.id === dragId);
    setDragId(null);
    if (!ch) return;

    const sorted = [...chapters].sort((a, b) => a.order - b.order);
    const rest = sorted.filter((c) => c.id !== dragId);
    const targetIndex = rest.findIndex((c) => c.id === targetId);
    const insertAt = targetIndex < 0 ? rest.length : targetIndex;
    const next = [...rest.slice(0, insertAt), ch, ...rest.slice(insertAt)];
    const ids = next.map((c) => c.id);

    try {
      const updated = await api.reorderChapters(project.root, ids);
      setChapters(updated);
      setProject({ ...project, manifest: { ...project.manifest, chapters: updated } });
      showToast(`「${ch.title}」顺序已调整，main.tex 已同步`);
    } catch (e) {
      showToast(`重排失败: ${e}`);
    }
  };

  const startEdit = (ch: Chapter) => {
    setEditingId(ch.id);
    setEditTitle(ch.title);
    setEditSummary(ch.summary);
  };

  const saveEdit = async () => {
    if (!project || !editingId) return;
    const ch = chapters.find((c) => c.id === editingId);
    if (!ch) return;
    const title = editTitle.trim() || ch.title;
    try {
      const updated = await api.updateChapter(project.root, ch.id, title, editSummary.trim(), ch.status);
      const next = chapters.map((c) => (c.id === updated.id ? updated : c));
      setChapters(next);
      setProject({ ...project, manifest: { ...project.manifest, chapters: next } });
      if (activeChapter?.id === updated.id) setActiveChapter(updated);
      setEditingId(null);
      showToast("章节信息已更新");
    } catch (e) {
      showToast(`更新失败: ${e}`);
    }
  };

  const changeStatus = async (ch: Chapter, status: string) => {
    setEditingStatusId(null);
    if (!project || ch.status === status) return;
    try {
      const updated = await api.updateChapter(project.root, ch.id, ch.title, ch.summary, status);
      const next = chapters.map((c) => (c.id === updated.id ? updated : c));
      setChapters(next);
      setProject({ ...project, manifest: { ...project.manifest, chapters: next } });
      if (activeChapter?.id === updated.id) setActiveChapter(updated);
      showToast(`「${ch.title}」→ ${STATUS_META[status]?.label}，main.tex 已同步`);
    } catch (e) {
      showToast(`修改状态失败: ${e}`);
    }
  };

  const handleCompile = async () => {
    if (!project || compiling) return;
    // 编译前先把未保存的编辑落盘，保证编译的是最新内容
    await flushSave();
    setCompiling(true);
    setCompileMsg("正在编译…");
    setShowLog(false);
    try {
      const result: CompileResult = await api.compileProject(project.root);
      setCompileResult(result);
      setCompileMsg(result.message);
      if (result.success) {
        setPdfVersion((v) => v + 1);
        showToast("编译成功！PDF 已更新");
      } else {
        showToast(`编译失败：${result.issues.filter((i) => i.level === "error").length} 个错误`);
      }
    } catch (e) {
      setCompileMsg(`编译出错: ${e}`);
      setCompileResult(null);
    } finally {
      setCompiling(false);
    }
  };

  // 点击错误条目 → 切到对应章节并定位到源码行
  const jumpToIssue = (issueFile: string | null, issueLine: number | null) => {
    if (!issueLine) return;
    // 错误通常指向 main.tex 或被 input 的章节文件
    const normalized = issueFile?.replace(/\\/g, "/") ?? "";
    let target = activeChapter;
    if (normalized && !normalized.endsWith("main.tex")) {
      target = chapters.find((c) => normalized.endsWith(c.file)) ?? activeChapter;
      if (target && target.id !== activeChapter?.id) {
        void openChapterForEdit(target);
      }
    }
    setView("writing");
    window.setTimeout(() => editorRef.current?.gotoLine(issueLine), 120);
  };

  const doneCount = chapters.filter((c) => c.status === "done").length;

  // 字数统计：当前章节实时算，全篇异步读取各章节累加
  const currentWords = countWords(content);
  const [totalWords, setTotalWords] = useState(0);
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    (async () => {
      let sum = 0;
      for (const ch of chapters) {
        try {
          sum += countWords(await api.readChapter(project.root, ch.file));
        } catch { /* 单章读取失败则跳过 */ }
      }
      if (!cancelled) setTotalWords(sum);
    })();
    return () => { cancelled = true; };
  }, [project, chapters]);

  // 分屏宽度拖拽
  const startSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    setDraggingSplit(true);
    const onMove = (ev: MouseEvent) => {
      const el = splitRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = (ev.clientX - rect.left) / rect.width;
      updateSettings({ splitRatio: Math.max(0.2, Math.min(0.8, ratio)) });
    };
    const onUp = () => {
      setDraggingSplit(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // 全局快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // 弹窗打开时，只响应 Esc
      if (prompt || showSettings || showHelp) {
        if (e.key === "Escape") {
          if (prompt) closePrompt(null);
          if (showSettings) setShowSettings(false);
          if (showHelp) setShowHelp(false);
        }
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (project) { saveNow(); showToast("已保存"); }
        return;
      }
      if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); if (project) void handleCompile(); return; }
      if (mod && e.key === "1") { e.preventDefault(); setView("board"); return; }
      if (mod && e.key === "2") { e.preventDefault(); setView("outline"); return; }
      if (mod && e.key === "3") { e.preventDefault(); setView("writing"); return; }
      if (e.key === "?" || (e.key === "/" && e.shiftKey)) { e.preventDefault(); setShowHelp(true); return; }
      if (e.key === "Escape") { setCompileResult(null); return; }
      // 写作视图章节切换
      if (view === "writing" && activeChapter && e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const sorted = [...chapters].sort((a, b) => a.order - b.order);
        const idx = sorted.findIndex((c) => c.id === activeChapter.id);
        const next = sorted[idx + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) void openChapterForEdit(next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prompt, showSettings, showHelp, saveNow, showToast, handleCompile, view, activeChapter, chapters, project]);

  const promptNode = prompt && (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closePrompt(null); }}>
      <div className="modal">
        <div className="modal-title">{prompt.title}</div>
        <div className="modal-message">{prompt.message}</div>
        {prompt.kind === "input" && (
          <input
            className="modal-input"
            autoFocus
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") closePrompt(promptValue.trim() || prompt.defaultValue);
            }}
          />
        )}
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => closePrompt(null)}>取消</button>
          <button
            className="btn btn-primary"
            onClick={() => closePrompt(prompt.kind === "input" ? (promptValue.trim() || prompt.defaultValue) : "ok")}
          >
            {prompt.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  // ---------- 欢迎页 ----------
  if (!project) {
    return (
      <div className="welcome">
        <div className="welcome-card">
          <div className="welcome-logo">章</div>
          <h1>章序</h1>
          <p className="welcome-tag">论文的项目管理器 —— 像看板一样管章节，像 Overleaf 一样出稿</p>
          <div className="welcome-actions">
            <button className="btn btn-primary btn-lg" onClick={handleCreate}>＋ 新建论文项目</button>
            <button className="btn btn-secondary btn-lg" onClick={handleOpen}>打开已有项目</button>
          </div>
          <div className="welcome-features">
            <div><span className="feature-icon">▦</span><b>看板管章节</b><small>拖拽推进写作进度</small></div>
            <div><span className="feature-icon">⌗</span><b>章节即文件</b><small>每章独立 .tex，本地存储</small></div>
            <div><span className="feature-icon">▶</span><b>一键编译</b><small>中文 LaTeX 直接出 PDF</small></div>
          </div>
          <p className="welcome-foot">数据全在你本地 · 离线可用 · 兼容 Git</p>
        </div>
        {toast && <div className="toast">{toast}</div>}
        {promptNode}
      </div>
    );
  }

  // ---------- 主界面 ----------
  return (
    <div className="app">
      <header className="titlebar">
        <div className="logo"><div className="logo-mark">章</div>章序</div>
        <div className="project-name"><span className="dot" />{project.manifest.title}</div>
        <div className="spacer" />
        {view === "writing" && activeChapter && (
          <span className={`save-indicator ${saveState}`} title="保存状态">
            {saveState === "saving" ? "◌ 保存中" : saveState === "dirty" ? "● 未保存" : "✓ 已保存"}
          </span>
        )}
        <span className="saved" title={project.root}>● 本地项目 · {project.root}</span>
        <button className="btn btn-ghost btn-icon" onClick={() => setShowHelp(true)} title="快捷键 (?)">⌨</button>
        <button className="btn btn-ghost btn-icon" onClick={() => setShowSettings(true)} title="设置">⚙</button>
        <button className="btn btn-ghost" onClick={() => revealItemInDir(project.root)}>打开文件夹</button>
        <button className="btn btn-primary" onClick={handleCompile} disabled={compiling} title="编译 PDF (Ctrl+B)">
          {compiling ? "编译中…" : "▶ 编译 PDF"}
        </button>
      </header>

      <div className="main">
        <aside className="sidebar">
          <nav className="nav">
            <button className={`nav-item ${view === "board" ? "active" : ""}`} onClick={() => setView("board")}>
              <span className="nav-ico">▦</span>章节看板<span className="badge">{chapters.length}</span>
            </button>
            <button className={`nav-item ${view === "outline" ? "active" : ""}`} onClick={() => setView("outline")}>
              <span className="nav-ico">☷</span>论文大纲
            </button>
            <button className={`nav-item ${view === "writing" ? "active" : ""}`} onClick={() => setView("writing")}>
              <span className="nav-ico">✎</span>写作
            </button>
          </nav>
          <div className="stat-card">
            <div className="stat-row"><span>章节总数</span><strong>{chapters.length}</strong></div>
            <div className="stat-row"><span>已定稿</span><strong style={{color: "#16a34a"}}>{doneCount}</strong></div>
            <div className="stat-row"><span>全篇字数</span><strong>{totalWords.toLocaleString()}</strong></div>
            <div className="stat-row"><span>完成进度</span><strong>{chapters.length ? Math.round((doneCount / chapters.length) * 100) : 0}%</strong></div>
            <div className="progress-track"><div className="progress-fill" style={{ width: `${chapters.length ? (doneCount / chapters.length) * 100 : 0}%` }} /></div>
          </div>
          <div className="sidebar-foot">
            拖拽卡片改状态与顺序<br />
            改动自动保存到 manifest.json<br />
            并同步更新 main.tex
          </div>
        </aside>

        <main className="content">
          {/* 看板 */}
          {view === "board" && (
            <>
              <div className="view-header">
                <div><span className="view-title">章节看板</span><span className="view-subtitle">拖动卡片推进写作进度</span></div>
                <button className="btn btn-primary" onClick={() => handleAddChapter("idea")}>＋ 新建章节</button>
              </div>
              <div className="board">
                {STATUS_KEYS.map((status) => {
                  const meta = STATUS_META[status];
                  const list = chapters.filter((c) => c.status === status).sort((a, b) => a.order - b.order);
                  return (
                    <div
                      className={`column ${dropTarget?.status === status && dropTarget.beforeId === null && dragId ? "drop-here" : ""}`}
                      key={status}
                      onDragOver={(e) => { e.preventDefault(); setDropTarget({ status, beforeId: null }); }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDropTarget(null);
                        }
                      }}
                      onDrop={() => handleDrop(status)}
                    >
                      <div className="column-head">
                        <span className="status-dot" style={{ background: meta.color }} />
                        <span className="column-title">{meta.label}</span>
                        <span className="column-count">{list.length}</span>
                      </div>
                      {list.map((ch) => (
                        <div
                          className={`card ${dragId === ch.id ? "dragging" : ""} ${dropTarget?.beforeId === ch.id && dragId && dragId !== ch.id ? "drop-before" : ""}`}
                          key={ch.id}
                          draggable
                          onDragStart={() => setDragId(ch.id)}
                          onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDropTarget({ status, beforeId: ch.id });
                          }}
                          onDoubleClick={() => openChapterForEdit(ch)}
                        >
                          <div className="card-top">
                            <span className="card-num">{ch.file.split("/").pop()?.slice(0, 2)}</span>
                            <span className="card-title">{ch.title}</span>
                          </div>
                          {ch.summary && <div className="card-summary">{ch.summary}</div>}
                          <div className="card-foot">
                            <span className="words">◎ {ch.file}</span>
                            <button className="del-btn" onClick={(e) => { e.stopPropagation(); handleDeleteChapter(ch); }} title="删除">×</button>
                          </div>
                        </div>
                      ))}
                      <button className="column-add" onClick={() => handleAddChapter(status)}>＋ 添加章节</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* 大纲 */}
          {view === "outline" && (
            <>
              <div className="view-header">
                <div><span className="view-title">论文大纲</span><span className="view-subtitle">拖拽行调整章节顺序，单击标题或摘要可编辑</span></div>
              </div>
              <div className="outline-wrap">
                <div className="outline-tree">
                  {[...chapters].sort((a, b) => a.order - b.order).map((ch, i) => (
                    <div key={ch.id}>
                      <div
                        className={`outline-row ${dragId === ch.id ? "dragging" : ""} ${dropTarget?.beforeId === ch.id && dragId && dragId !== ch.id ? "drop-before" : ""}`}
                        draggable={editingId !== ch.id}
                        onDragStart={() => setDragId(ch.id)}
                        onDragEnd={() => { setDragId(null); setDropTarget(null); }}
                        onDragOver={(e) => { e.preventDefault(); setDropTarget({ status: ch.status, beforeId: ch.id }); }}
                        onDrop={() => handleOutlineDrop(ch.id)}
                      >
                        <span className="outline-num">{i + 1}</span>
                        <span className="outline-grip" title="拖拽调整顺序">⠿</span>
                        <div className="outline-status-wrap">
                          <span
                            className="outline-status"
                            style={{ background: STATUS_META[ch.status]?.color }}
                            title={STATUS_META[ch.status]?.label}
                            onClick={(e) => { e.stopPropagation(); setEditingStatusId(editingStatusId === ch.id ? null : ch.id); }}
                          />
                          {editingStatusId === ch.id && (
                            <div className="status-menu">
                              {STATUS_KEYS.map((s) => (
                                <button key={s} onClick={(e) => { e.stopPropagation(); changeStatus(ch, s); }}>
                                  <span style={{ background: STATUS_META[s].color }} />{STATUS_META[s].label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        {editingId === ch.id ? (
                          <input
                            className="outline-input"
                            autoFocus
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            onBlur={saveEdit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit();
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        ) : (
                          <span className="outline-title" onClick={() => startEdit(ch)} title="点击编辑标题">{ch.title}</span>
                        )}
                        <span className="outline-file">{ch.file}</span>
                        <button className="outline-write" onClick={() => openChapterForEdit(ch)} title="打开写作">✎</button>
                      </div>
                      {editingId === ch.id && (
                        <div className="outline-summary-edit">
                          <textarea
                            autoFocus
                            placeholder="写一句章节摘要（可选）…"
                            value={editSummary}
                            onChange={(e) => setEditSummary(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                          <div className="outline-summary-actions">
                            <button className="btn btn-primary btn-sm" onClick={saveEdit}>保存</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>取消</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  {!chapters.length && <div className="empty-hint">还没有章节，去「章节看板」添加一个吧</div>}
                </div>
              </div>
            </>
          )}

          {/* 写作 */}
          {view === "writing" && (
            <>
              <div className="view-header">
                <div>
                  <span className="view-title">写作</span>
                  <span className="view-subtitle">{activeChapter ? `${activeChapter.title} · ${activeChapter.file}` : "从看板双击章节进入写作"}</span>
                </div>
                <div className="layout-switch">
                  <button className={editorLayout === "editor" ? "active" : ""} onClick={() => setEditorLayout("editor")} title="仅源码">源码</button>
                  <button className={editorLayout === "split" ? "active" : ""} onClick={() => setEditorLayout("split")} title="分屏">分屏</button>
                  <button className={editorLayout === "preview" ? "active" : ""} onClick={() => setEditorLayout("preview")} title="仅预览">预览</button>
                </div>
              </div>
              {activeChapter ? (
                <div className="writing">
                  <aside className="writing-sidebar">
                    <div className="section-label">章节</div>
                    {[...chapters].sort((a, b) => a.order - b.order).map((ch) => (
                      <div
                        className={`chapter-nav-item ${activeChapter.id === ch.id ? "active" : ""}`}
                        key={ch.id}
                        onClick={() => openChapterForEdit(ch)}
                      >
                        {ch.title}<span className="st" style={{ background: STATUS_META[ch.status]?.color }} />
                      </div>
                    ))}
                  </aside>

                  <div
                    className={`writing-main layout-${editorLayout} ${draggingSplit ? "splitting" : ""}`}
                    ref={splitRef}
                  >
                    {editorLayout !== "preview" && (
                      <div
                        className="editor-pane"
                        style={editorLayout === "split" ? { flexBasis: `${settings.splitRatio * 100}%` } : undefined}
                      >
                        <div className="editor-toolbar">
                          <span className="tool-label">LaTeX 源码</span>
                          <span className="tool-sep" />
                          <span className="tool-hint">{String.raw`\section{} · \cite{} · $...$`}</span>
                        </div>
                        {compileResult && !compileResult.success && compileResult.issues.length > 0 && (
                          <div className="issue-panel">
                            <div className="issue-head">
                              <span>✕ 编译错误 ({compileResult.issues.filter((i) => i.level === "error").length})</span>
                              <button onClick={() => setCompileResult(null)} title="关闭">×</button>
                            </div>
                            <div className="issue-list">
                              {compileResult.issues.map((issue, idx) => (
                                <div
                                  key={idx}
                                  className={`issue-item ${issue.level}`}
                                  onClick={() => jumpToIssue(issue.file, issue.line)}
                                  title={issue.line ? `跳转到 ${issue.file ?? "源码"} 第 ${issue.line} 行` : "无行号信息"}
                                >
                                  <span className="issue-badge">{issue.level === "error" ? "✕" : "!"}</span>
                                  <span className="issue-text">
                                    {issue.line && <b>{issue.file ? `${issue.file.split("/").pop()} ` : ""}第 {issue.line} 行 · </b>}
                                    {issue.message}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <button className="issue-log-toggle" onClick={() => setShowLog(!showLog)}>
                              {showLog ? "收起完整日志" : "展开完整日志"}
                            </button>
                            {showLog && <pre className="issue-log">{compileResult.log}</pre>}
                          </div>
                        )}
                        <LatexEditor
                          ref={editorRef}
                          value={content}
                          onChange={handleContentChange}
                          fontSize={settings.fontSize}
                          showLineNumbers={settings.showLineNumbers}
                        />
                        <div className="compile-bar">
                          <span className={`compile-status ${compileMsg.includes("成功") || compileMsg.includes("已自动保存") ? "ok" : ""} ${compileResult && !compileResult.success ? "err" : ""}`}>
                            {compileMsg || "编辑后自动保存"}
                          </span>
                          <span className="word-count">{currentWords.toLocaleString()} 字</span>
                          <span className="spacer" />
                          <button className="btn btn-primary btn-sm" onClick={handleCompile} disabled={compiling} title="编译 PDF (Ctrl+B)">
                            {compiling ? "编译中…" : "编译看看"}
                          </button>
                        </div>
                      </div>
                    )}
                    {editorLayout === "split" && (
                      <div
                        className={`split-divider ${draggingSplit ? "active" : ""}`}
                        onMouseDown={startSplitDrag}
                        title="拖拽调整分屏宽度"
                      >
                        <span />
                      </div>
                    )}
                    {editorLayout !== "editor" && <PdfPreview root={project.root} version={pdfVersion} />}
                  </div>
                </div>
              ) : (
                <div className="empty-writing">从「章节看板」双击一张卡片，开始写作</div>
              )}
            </>
          )}
        </main>
      </div>
      {toast && <div className="toast">{toast}</div>}
      {promptNode}
      {showSettings && (
        <SettingsPanel settings={settings} onChange={updateSettings} onClose={() => setShowSettings(false)} />
      )}
      {showHelp && <ShortcutsHelp onClose={() => setShowHelp(false)} />}
    </div>
  );
}

export default App;
