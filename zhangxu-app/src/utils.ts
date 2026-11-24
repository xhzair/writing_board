import { useCallback, useEffect, useState } from "react";

/** 应用设置（持久化到 localStorage） */
export interface Settings {
  /** 编辑器字号（px） */
  fontSize: number;
  /** 自动保存间隔（ms） */
  autoSaveMs: number;
  /** 分屏时编辑器占比 0.2~0.8 */
  splitRatio: number;
  /** 显示行号 */
  showLineNumbers: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  fontSize: 13,
  autoSaveMs: 800,
  splitRatio: 0.5,
  showLineNumbers: true,
};

const STORAGE_KEY = "zhangxu-settings-v1";

/** 读取设置 hook，变更自动写回 localStorage */
export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage 不可用时静默降级
    }
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  return [settings, update];
}

/**
 * 统计 LaTeX 源码字数：中文按字符、英文按单词。
 * 剥离注释与命令名，只保留实际正文内容。
 */
export function countWords(tex: string): number {
  // 去掉行注释（排除转义的 \%）
  const noComments = tex.replace(/(^|[^\\])%.*$/gm, "$1");
  // 去掉 LaTeX 命令名（保留花括号内参数，即正文）
  const stripped = noComments.replace(/\\[A-Za-z@]+\*?/g, " ");
  // 去掉数学公式环境内容（公式不算论文字数）
  const noMath = stripped.replace(/\\\[[\s\S]*?\\\]/g, " ").replace(/\\\([\s\S]*?\\\)/g, " ");
  const cjk = (noMath.match(/[\u4e00-\u9fff]/g) || []).length;
  const words = (noMath.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g) || []).length;
  return cjk + words;
}
