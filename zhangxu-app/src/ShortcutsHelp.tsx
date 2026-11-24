interface Props {
  onClose: () => void;
}

const GROUPS: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "全局",
    items: [
      { keys: ["Ctrl", "S"], label: "立即保存当前章节" },
      { keys: ["Ctrl", "B"], label: "编译 PDF" },
      { keys: ["Ctrl", "1"], label: "切到章节看板" },
      { keys: ["Ctrl", "2"], label: "切到论文大纲" },
      { keys: ["Ctrl", "3"], label: "切到写作视图" },
      { keys: ["?"], label: "打开本帮助" },
      { keys: ["Esc"], label: "关闭弹窗 / 错误面板" },
    ],
  },
  {
    title: "写作视图",
    items: [
      { keys: ["Alt", "←"], label: "上一章" },
      { keys: ["Alt", "→"], label: "下一章" },
      { keys: ["Ctrl", "/"], label: "注释 / 取消注释选中行" },
      { keys: ["Ctrl", "Shift", "B"], label: "给选中文字加 \\textbf{}" },
      { keys: ["Ctrl", "Shift", "I"], label: "给选中文字加 \\emph{}" },
      { keys: ["Tab"], label: "缩进" },
    ],
  },
];

export default function ShortcutsHelp({ onClose }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal help-modal">
        <div className="modal-title">⌨ 快捷键</div>
        <div className="modal-message">熟练之后基本可以不用鼠标。</div>
        {GROUPS.map((group) => (
          <div className="help-group" key={group.title}>
            <div className="help-group-title">{group.title}</div>
            {group.items.map((item) => (
              <div className="help-row" key={item.label}>
                <span className="help-label">{item.label}</span>
                <span className="help-keys">
                  {item.keys.map((k, i) => <kbd key={i}>{k}</kbd>)}
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>知道了</button>
        </div>
      </div>
    </div>
  );
}
