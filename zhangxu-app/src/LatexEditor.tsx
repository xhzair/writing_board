import { useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { syntaxHighlighting, HighlightStyle, bracketMatching } from "@codemirror/language";
import { StreamLanguage } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { tags } from "@lezer/highlight";

export interface LatexEditorHandle {
  /** 将光标跳到指定行（错误定位用） */
  gotoLine: (line: number) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
}

// 浅色主题，匹配应用整体风格
const lightTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "#ffffff" },
  ".cm-content": { fontFamily: '"SF Mono", Consolas, "Liberation Mono", monospace', padding: "16px 0", caretColor: "#6c5ce7" },
  ".cm-line": { padding: "0 20px" },
  ".cm-gutters": { backgroundColor: "#fafbfc", color: "#b8bec9", border: "none", borderRight: "1px solid #eef0f3" },
  ".cm-activeLine": { backgroundColor: "#f7f6ff" },
  ".cm-activeLineGutter": { backgroundColor: "#f0eeff", color: "#6c5ce7" },
  ".cm-selectionBackground": { backgroundColor: "#e4dfff !important" },
  "&.cm-focused": { outline: "none" },
}, { dark: false });

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "#7c3aed", fontWeight: "600" },
  { tag: tags.atom, color: "#2563eb" },
  { tag: tags.string, color: "#059669" },
  { tag: tags.comment, color: "#98a1b0", fontStyle: "italic" },
  { tag: tags.number, color: "#d97706" },
  { tag: tags.variableName, color: "#0f172a" },
]);

const LatexEditor = forwardRef<LatexEditorHandle, Props>(function LatexEditor({ value, onChange }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          drawSelection(),
          history(),
          bracketMatching(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          StreamLanguage.define(stex),
          syntaxHighlighting(highlight),
          lightTheme,
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
    // 只在挂载时创建，切换章节由下面的 effect 负责替换文档
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
  }), []);

  return <div className="latex-editor" ref={hostRef} />;
});

export default LatexEditor;
