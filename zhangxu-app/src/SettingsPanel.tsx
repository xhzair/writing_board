import type { Settings } from "./utils";

interface Props {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onChange, onClose }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal settings-modal">
        <div className="modal-title">⚙ 设置</div>
        <div className="modal-message">这些偏好保存在本机，重启后依然生效。</div>

        <div className="setting-row">
          <div className="setting-info">
            <b>编辑器字号</b>
            <small>源码字号大小</small>
          </div>
          <div className="setting-control stepper">
            <button onClick={() => onChange({ fontSize: Math.max(11, settings.fontSize - 1) })}>−</button>
            <span>{settings.fontSize} px</span>
            <button onClick={() => onChange({ fontSize: Math.min(20, settings.fontSize + 1) })}>＋</button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <b>自动保存间隔</b>
            <small>停止输入后多久写入磁盘</small>
          </div>
          <div className="setting-control">
            <select
              className="setting-select"
              value={settings.autoSaveMs}
              onChange={(e) => onChange({ autoSaveMs: Number(e.target.value) })}
            >
              <option value={500}>0.5 秒（快）</option>
              <option value={800}>0.8 秒（默认）</option>
              <option value={1500}>1.5 秒（省资源）</option>
              <option value={3000}>3 秒</option>
            </select>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <b>显示行号</b>
            <small>编辑器左侧显示行号</small>
          </div>
          <div className="setting-control">
            <button
              className={`toggle ${settings.showLineNumbers ? "on" : ""}`}
              onClick={() => onChange({ showLineNumbers: !settings.showLineNumbers })}
              aria-label="切换行号显示"
            >
              <span />
            </button>
          </div>
        </div>

        <div className="setting-row">
          <div className="setting-info">
            <b>分屏比例</b>
            <small>编辑器占的宽度，也可直接拖中间分隔条</small>
          </div>
          <div className="setting-control">
            <input
              className="setting-range"
              type="range"
              min={20}
              max={80}
              value={Math.round(settings.splitRatio * 100)}
              onChange={(e) => onChange({ splitRatio: Number(e.target.value) / 100 })}
            />
            <span className="range-label">{Math.round(settings.splitRatio * 100)}%</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}
