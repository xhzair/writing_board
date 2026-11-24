import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, bracketMatching } from "@codemirror/language";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { tags } from "@lezer/highlight";

export interface LatexEditorHandle {
  /** 将光标跳到指定行（错误定位用） */
  gotoLine: (line: number) => void;
  focus: () => void;
  /** 撤销（供外部快捷键调用） */
  undo: () => void;
  /** 重做 */
  redo: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  fontSize: number;
  showLineNumbers: boolean;
}

// 浅色主题，字号由设置控制
function makeTheme(fontSize: number): Extension {
  return EditorView.theme({
    "&": { height: "100%", fontSize: `${fontSize}px`, backgroundColor: "#ffffff" },
    ".cm-content": { fontFamily: '"SF Mono", Consolas, "Liberation Mono", monospace', padding: "16px 0", caretColor: "#6c5ce7" },
    ".cm-line": { padding: "0 20px" },
    ".cm-gutters": { backgroundColor: "#fafbfc", color: "#b8bec9", border: "none", borderRight: "1px solid #eef0f3" },
    ".cm-activeLine": { backgroundColor: "#f7f6ff" },
    ".cm-activeLineGutter": { backgroundColor: "#f0eeff", color: "#6c5ce7" },
    ".cm-selectionBackground": { backgroundColor: "#e4dfff !important" },
    "&.cm-focused": { outline: "none" },
  }, { dark: false });
}

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#7c3aed", fontWeight: "600" },
  { tag: tags.atom, color: "#2563eb" },
  { tag: tags.string, color: "#059669" },
  { tag: tags.comment, color: "#98a1b0", fontStyle: "italic" },
  { tag: tags.number, color: "#d97706" },
  { tag: tags.variableName, color: "#0f172a" },
]);

/** 用 \cmd{} 包裹选区；无选区时插入空命令并把光标放入花括号 */
function wrapSelection(view: EditorView, cmd: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);
  const insert = `\\${cmd}{${selected}}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + cmd.length + 2, head: from + cmd.length + 2 + selected.length },
    scrollIntoView: true,
  });
  view.focus();
}

/** 注释/取消注释选中行（LaTeX 用 %） */
function toggleComment(view: EditorView) {
  const { from, to } = view.state.selection.main;
  const lineFrom = view.state.doc.lineAt(from).number;
  const lineTo = view.state.doc.lineAt(to).number;
  const changes = [];
  let allCommented = true;
  for (let n = lineFrom; n <= lineTo; n++) {
    const line = view.state.doc.line(n);
    if (!line.text.trimStart().startsWith("%")) allCommented = false;
  }
  for (let n = lineFrom; n <= lineTo; n++) {
    const line = view.state.doc.line(n);
    const idx = line.text.indexOf(line.text.trimStart());
    if (allCommented) {
      // 去掉行首第一个 %（及其后一个空格）
      const pct = line.text.indexOf("%");
      if (pct >= 0) {
        let end = pct + 1;
        if (line.text[end] === " ") end++;
        changes.push({ from: line.from + pct, to: line.from + end, insert: "" });
      }
    } else {
      changes.push({ from: line.from + idx, to: line.from + idx, insert: "% " });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

const LatexEditor = forwardRef<LatexEditorHandle, Props>(function LatexEditor(
  { value, onChange, fontSize, showLineNumbers }, ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // 可动态重配置的相关参数
  const themeComp = useRef(new Compartment());
  const gutterComp = useRef(new Compartment());

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          gutterComp.current.of(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
          highlightActiveLine(),
          drawSelection(),
          history(),
          bracketMatching(),
          keymap.of([
            {
              key: "Mod-/",
              run: (v) => { toggleComment(v); return true; },
            },
            {
              key: "Mod-Shift-b",
              run: (v) => { wrapSelection(v, "textbf"); return true; },
            },
            {
              key: "Mod-Shift-i",
              run: (v) => { wrapSelection(v, "emph"); return true; },
            },
            ...defaultKeymap, ...historyKeymap, indentWithTab,
          ]),
          StreamLanguage.define(stex),
          syntaxHighlighting(highlight),
          themeComp.current.of(makeTheme(fontSize)),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
    // 只在挂载时创建，其他变更通过 compartment reconfigure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 外部 value 变化（切换章节）时同步文档，但不触发 onChange
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
        selection: { anchor: 0 },
      });
    }
  }, [value]);

  // 字号变化 → 重配置主题
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeComp.current.reconfigure(makeTheme(fontSize)),
    });
  }, [fontSize]);

  // 行号开关 → 重配置 gutter
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterComp.current.reconfigure(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
    });
  }, [showLineNumbers]);

  useImperativeHandle(ref, () => ({
    gotoLine(line: number) {
      const view = viewRef.current;
      if (!view) return;
      const target = Math.max(1, Math.min(line, view.state.doc.lines));
      const lineObj = view.state.doc.line(target);
      view.dispatch({
        selection: { anchor: lineObj.from },
        scrollIntoView: true,
      });
      view.focus();
    },
    focus() { viewRef.current?.focus(); },
    undo() { if (viewRef.current) undo(viewRef.current); },
    redo() { if (viewRef.current) redo(viewRef.current); },
  }), []);

  return <div className="latex-editor" ref={hostRef} />;
});

export default LatexEditor;
