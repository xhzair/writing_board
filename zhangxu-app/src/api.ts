import { invoke } from "@tauri-apps/api/core";
import type { ProjectInfo, Manifest, Chapter, CompileResult } from "./types";

export async function createProject(path: string, title: string): Promise<ProjectInfo> {
  return invoke("create_project", { path, title });
}

export async function openProject(path: string): Promise<ProjectInfo> {
  return invoke("open_project", { path });
}

export async function loadManifest(root: string): Promise<Manifest> {
  return invoke("load_manifest", { root });
}

export async function saveManifest(root: string, manifest: Manifest): Promise<void> {
  return invoke("save_manifest", { root, manifest });
}

export async function readChapter(root: string, file: string): Promise<string> {
  return invoke("read_chapter", { root, file });
}

export async function writeChapter(root: string, file: string, content: string): Promise<void> {
  return invoke("write_chapter", { root, file, content });
}

export async function addChapter(root: string, title: string, status: string): Promise<Chapter> {
  return invoke("add_chapter", { root, title, status });
}

export async function deleteChapter(root: string, id: string): Promise<void> {
  return invoke("delete_chapter", { root, id });
}

export async function reorderChapters(root: string, ids: string[]): Promise<Chapter[]> {
  return invoke("reorder_chapters", { root, ids });
}

export async function updateChapter(
  root: string, id: string, title: string, summary: string, status: string
): Promise<Chapter> {
  return invoke("update_chapter", { root, id, title, summary, status });
}

export async function compileProject(root: string): Promise<CompileResult> {
  return invoke("compile_project", { root, tectonicPath: null });
}

export async function readPdf(root: string): Promise<string> {
  return invoke("read_pdf", { root });
}

export async function getTectonicPath(root: string): Promise<string> {
  return invoke("get_tectonic_path", { root });
}

export async function setTectonicPath(root: string, path: string): Promise<void> {
  return invoke("set_tectonic_path", { root, path });
}
