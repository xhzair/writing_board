export interface Chapter {
  id: string;
  file: string;
  title: string;
  status: string;
  order: number;
  summary: string;
}

export interface Manifest {
  title: string;
  columns: string[];
  chapters: Chapter[];
  root?: string;
}

export interface ProjectInfo {
  root: string;
  manifest: Manifest;
}

export interface CompileIssue {
  level: "error" | "warning";
  file: string | null;
  line: number | null;
  message: string;
}

export interface CompileResult {
  success: boolean;
  message: string;
  pdf_path: string | null;
  log: string;
  issues: CompileIssue[];
}

export const STATUS_META: Record<string, { label: string; color: string; soft: string }> = {
  idea: { label: "构思中", color: "#98a1b0", soft: "#eef0f3" },
  draft: { label: "初稿", color: "#2563eb", soft: "#e8f0ff" },
  revising: { label: "修改中", color: "#d97706", soft: "#fdf3e2" },
  done: { label: "已定稿", color: "#16a34a", soft: "#e8f7ee" },
};

export const STATUS_KEYS = ["idea", "draft", "revising", "done"];
