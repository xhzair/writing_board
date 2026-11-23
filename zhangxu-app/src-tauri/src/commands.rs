use crate::models::{Chapter, Manifest};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct ProjectInfo {
    pub root: String,
    pub manifest: Manifest,
}

fn manifest_path(root: &Path) -> PathBuf {
    root.join("manifest.json")
}

/// 生成 ctex 中文文档模板（M0 验证过的配置）
fn default_main_tex(title: &str, inputs: &str) -> String {
    format!(
        r#"\documentclass[UTF8]{{ctexart}}
\usepackage{{amsmath}}
\usepackage{{graphicx}}
\title{{{title}}}
\author{{}}
\date{{\today}}
\begin{{document}}
\maketitle
{inputs}\end{{document}}
"#,
        title = title.replace(['{', '}'], ""),
        inputs = inputs
    )
}

/// 生成 tectonic.toml（XeTeX 引擎支持中文）
fn default_tectonic_toml() -> String {
    r#"[[output]]
name = "main"
type = "pdf"

[build]
engine = "XeTeX"
"#
    .to_string()
}

fn ensure_project_structure(root: &Path, title: &str) -> Result<Manifest, String> {
    fs::create_dir_all(root.join("chapters"))
        .map_err(|e| format!("无法创建 chapters 目录: {}", e))?;
    fs::create_dir_all(root.join("figures"))
        .map_err(|e| format!("无法创建 figures 目录: {}", e))?;
    fs::create_dir_all(root.join("notes"))
        .map_err(|e| format!("无法创建 notes 目录: {}", e))?;

    let main_tex = root.join("main.tex");
    if !main_tex.exists() {
        // 新项目不写死 input，等添加章节后由 sync_main_tex 生成
        fs::write(&main_tex, default_main_tex(title, ""))
            .map_err(|e| format!("无法写入 main.tex: {}", e))?;
    }

    let toml = root.join("tectonic.toml");
    if !toml.exists() {
        fs::write(&toml, default_tectonic_toml())
            .map_err(|e| format!("无法写入 tectonic.toml: {}", e))?;
    }

    let mpath = manifest_path(root);
    let manifest: Manifest = if mpath.exists() {
        let content = fs::read_to_string(&mpath)
            .map_err(|e| format!("无法读取 manifest.json: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("manifest.json 格式错误: {}", e))?
    } else {
        Manifest::new(title.to_string())
    };
    Ok(manifest)
}

fn save_manifest_to(root: &Path, manifest: &Manifest) -> Result<(), String> {
    let content = serde_json::to_string_pretty(manifest)
        .map_err(|e| format!("序列化 manifest 失败: {}", e))?;
    fs::write(manifest_path(root), content)
        .map_err(|e| format!("保存 manifest.json 失败: {}", e))
}

fn sync_main_tex(root: &Path, manifest: &Manifest) -> Result<(), String> {
    let mut inputs = String::new();
    // 按 order 排序后再生成 \input，保证重排结果真实反映到 PDF
    let mut ordered: Vec<&Chapter> = manifest.chapters.iter().collect();
    ordered.sort_by_key(|c| c.order);
    for ch in ordered.into_iter().filter(|c| c.status != "idea") {
        inputs.push_str(&format!("\\input{{{}}}\n", ch.file.replace('\\', "/")));
    }
    let main_tex = root.join("main.tex");
    let current = fs::read_to_string(&main_tex).unwrap_or_default();
    // 保留导言区，只替换 \begin{document} 之后的内容
    let preamble = if let Some(pos) = current.find("\\begin{document}") {
        &current[..pos + "\\begin{document}".len()]
    } else {
        current.as_str()
    };
    let title = &manifest.title;
    let new_content = if preamble.contains("\\begin{document}") {
        format!("{}\n\\maketitle\n\n{}\n\\end{{document}}\n", preamble, inputs)
    } else {
        default_main_tex(title, &inputs)
    };
    fs::write(&main_tex, new_content)
        .map_err(|e| format!("同步 main.tex 失败: {}", e))
}

/// 在指定目录新建项目
#[tauri::command]
pub fn create_project(path: String, title: String) -> Result<ProjectInfo, String> {
    let root = PathBuf::from(&path);
    let mut manifest = ensure_project_structure(&root, &title)?;
    manifest.root = root.clone();
    save_manifest_to(&root, &manifest)?;
    Ok(ProjectInfo {
        root: path,
        manifest,
    })
}

/// 打开已有项目
#[tauri::command]
pub fn open_project(path: String) -> Result<ProjectInfo, String> {
    let root = PathBuf::from(&path);
    let mpath = manifest_path(&root);
    if !mpath.exists() {
        return Err(format!("该文件夹不是有效的章序项目（缺少 manifest.json）: {}", path));
    }
    let content = fs::read_to_string(&mpath)
        .map_err(|e| format!("无法读取 manifest.json: {}", e))?;
    let mut manifest: Manifest = serde_json::from_str(&content)
        .map_err(|e| format!("manifest.json 格式错误: {}", e))?;
    manifest.root = root.clone();
    Ok(ProjectInfo {
        root: path,
        manifest,
    })
}

/// 读取 manifest
#[tauri::command]
pub fn load_manifest(root: String) -> Result<Manifest, String> {
    let root = PathBuf::from(&root);
    let content = fs::read_to_string(manifest_path(&root))
        .map_err(|e| format!("无法读取 manifest.json: {}", e))?;
    let mut manifest: Manifest = serde_json::from_str(&content)
        .map_err(|e| format!("manifest.json 格式错误: {}", e))?;
    manifest.root = root;
    Ok(manifest)
}

/// 保存 manifest（看板拖拽后调用），同时同步 main.tex
#[tauri::command]
pub fn save_manifest(root: String, manifest: Manifest) -> Result<(), String> {
    let root = PathBuf::from(&root);
    save_manifest_to(&root, &manifest)?;
    sync_main_tex(&root, &manifest)?;
    Ok(())
}

/// 读取章节 .tex 内容
#[tauri::command]
pub fn read_chapter(root: String, file: String) -> Result<String, String> {
    let root = PathBuf::from(&root);
    let path = root.join(&file);
    fs::read_to_string(&path)
        .map_err(|e| format!("无法读取章节文件 {}: {}", path.display(), e))
}

/// 保存章节 .tex 内容
#[tauri::command]
pub fn write_chapter(root: String, file: String, content: String) -> Result<(), String> {
    let root = PathBuf::from(&root);
    let path = root.join(&file);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建目录: {}", e))?;
    }
    fs::write(&path, content)
        .map_err(|e| format!("无法保存章节文件 {}: {}", path.display(), e))
}

/// 新增章节
#[tauri::command]
pub fn add_chapter(root: String, title: String, status: String) -> Result<Chapter, String> {
    let root = PathBuf::from(&root);
    let mpath = manifest_path(&root);
    let content = fs::read_to_string(&mpath)
        .map_err(|e| format!("无法读取 manifest.json: {}", e))?;
    let mut manifest: Manifest = serde_json::from_str(&content)
        .map_err(|e| format!("manifest.json 格式错误: {}", e))?;

    let order = manifest.chapters.len() + 1;
    let filename = format!("{:02}-{}.tex", order, sanitize_filename(&title));
    let file = format!("chapters/{}", filename);
    let id = format!("ch-{}", uuid_like());

    let chapter = Chapter {
        id: id.clone(),
        file: file.clone(),
        title: title.clone(),
        status: if status.is_empty() { "idea".to_string() } else { status },
        order,
        summary: String::new(),
    };

    // 创建初始 .tex 文件
    let initial_content = format!("\\section{{{}}}\n\n", title.replace(['{', '}'], ""));
    let chapter_path = root.join(&file);
    if let Some(parent) = chapter_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建目录: {}", e))?;
    }
    fs::write(&chapter_path, initial_content)
        .map_err(|e| format!("无法创建章节文件: {}", e))?;

    manifest.chapters.push(chapter.clone());
    save_manifest_to(&root, &manifest)?;
    sync_main_tex(&root, &manifest)?;

    Ok(chapter)
}

/// 删除章节
#[tauri::command]
pub fn delete_chapter(root: String, id: String) -> Result<(), String> {
    let root = PathBuf::from(&root);
    let mpath = manifest_path(&root);
    let content = fs::read_to_string(&mpath)
        .map_err(|e| format!("无法读取 manifest.json: {}", e))?;
    let mut manifest: Manifest = serde_json::from_str(&content)
        .map_err(|e| format!("manifest.json 格式错误: {}", e))?;

    if let Some(pos) = manifest.chapters.iter().position(|c| c.id == id) {
        let chapter = manifest.chapters.remove(pos);
        let _ = fs::remove_file(root.join(&chapter.file));
        save_manifest_to(&root, &manifest)?;
        sync_main_tex(&root, &manifest)?;
    }
    Ok(())
}

/// 纯逻辑：按给定 id 顺序重排章节并重新编号 order（1..n）
fn apply_reorder(manifest: &mut Manifest, ids: &[String]) {
    // 未在 ids 中的章节排到末尾
    let rank = |id: &str| ids.iter().position(|x| x == id).unwrap_or(ids.len());
    manifest.chapters.sort_by_key(|c| rank(&c.id));
    for (i, ch) in manifest.chapters.iter_mut().enumerate() {
        ch.order = i + 1;
    }
}

/// 按给定 id 顺序重排章节（order 重新编号为 1..n），并同步 main.tex
#[tauri::command]
pub fn reorder_chapters(root: String, ids: Vec<String>) -> Result<Vec<Chapter>, String> {
    let root_path = PathBuf::from(&root);
    let mpath = manifest_path(&root_path);
    let content = fs::read_to_string(&mpath).map_err(|e| format!("无法读取 manifest.json: {}", e))?;
    let mut manifest: Manifest = serde_json::from_str(&content)
        .map_err(|e| format!("manifest.json 格式错误: {}", e))?;

    apply_reorder(&mut manifest, &ids);

    let result = manifest.chapters.clone();
    save_manifest_to(&root_path, &manifest)?;
    sync_main_tex(&root_path, &manifest)?;
    Ok(result)
}

/// 更新章节元数据（标题/摘要/状态），状态变化时同步 main.tex
#[tauri::command]
pub fn update_chapter(root: String, id: String, title: String, summary: String, status: String) -> Result<Chapter, String> {
    let root_path = PathBuf::from(&root);
    let mpath = manifest_path(&root_path);
    let content = fs::read_to_string(&mpath).map_err(|e| format!("无法读取 manifest.json: {}", e))?;
    let mut manifest: Manifest = serde_json::from_str(&content)
        .map_err(|e| format!("manifest.json 格式错误: {}", e))?;

    let ch = manifest.chapters.iter_mut().find(|c| c.id == id)
        .ok_or_else(|| format!("找不到章节: {}", id))?;
    ch.title = title;
    ch.summary = summary;
    ch.status = status;
    let updated = ch.clone();

    save_manifest_to(&root_path, &manifest)?;
    sync_main_tex(&root_path, &manifest)?;
    Ok(updated)
}

fn sanitize_filename(s: &str) -> String {
    s.chars()
        .take(20)
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .collect()
}

fn uuid_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("{}", now)
}

/// 按优先级查找 tectonic 引擎
fn find_tectonic(root: &Path) -> Option<PathBuf> {
    let mut candidates = Vec::new();

    // 1. 项目内的 tools/tectonic.exe
    candidates.push(root.join("tools/tectonic.exe"));
    candidates.push(root.join("tectonic.exe"));

    // 2. 应用 exe 相邻目录（开发模式 target/release 与 resources 相邻）
    if let Ok(exe_dir) = std::env::current_exe() {
        if let Some(parent) = exe_dir.parent() {
            candidates.push(parent.join("resources/tectonic.exe"));
            candidates.push(parent.join("tectonic.exe"));
            // target/release -> src-tauri/resources（开发模式）
            candidates.push(parent.join("../../../src-tauri/resources/tectonic.exe"));
        }
    }

    // 3. 环境变量
    if let Ok(p) = std::env::var("TECTONIC_PATH") {
        candidates.push(PathBuf::from(p));
    }

    candidates.into_iter().find(|p| p.exists())
}

#[derive(Debug, Clone, Serialize)]
pub struct CompileIssue {
    /// "error" 或 "warning"
    pub level: String,
    /// 出错文件（可能为空）
    pub file: Option<String>,
    /// 行号（若能从日志解析）
    pub line: Option<usize>,
    /// 错误消息正文
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompileResult {
    pub success: bool,
    pub message: String,
    pub pdf_path: Option<String>,
    /// tectonic 的完整输出日志
    pub log: String,
    /// 结构化解析出的错误/警告列表
    pub issues: Vec<CompileIssue>,
}

/// 从 tectonic 混合输出中解析结构化问题。
/// 兼容两类格式：
///   error: ...\n  --> main.tex:12:5        （tectonic/rustc 风格）
///   ! LaTeX Error: ...\nl.12 ...           （TeX 风格）
fn parse_issues(log: &str) -> Vec<CompileIssue> {
    let lines: Vec<&str> = log.lines().collect();
    let mut issues = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();
        let mut level: Option<&str> = None;
        let mut message = "";

        if let Some(rest) = line.strip_prefix("error:") {
            level = Some("error");
            message = rest.trim();
        } else if let Some(rest) = line.strip_prefix("warning:") {
            level = Some("warning");
            message = rest.trim();
        } else if let Some(rest) = line.strip_prefix('!') {
            level = Some("error");
            message = rest.trim();
        }

        if let Some(lv) = level {
            let mut file: Option<String> = None;
            let mut lineno: Option<usize> = None;

            // 向后看几行，找位置标记
            for j in (i + 1)..(i + 5).min(lines.len()) {
                let next = lines[j].trim();
                // --> main.tex:12:5
                if let Some(pos) = next.find("-->") {
                    let loc = next[pos + 3..].trim();
                    let parts: Vec<&str> = loc.rsplitn(3, ':').collect();
                    if parts.len() == 3 {
                        if parts[0].parse::<usize>().is_ok() {
                            if let Ok(l) = parts[1].parse::<usize>() {
                                lineno = Some(l);
                                file = Some(parts[2].to_string());
                            }
                        }
                    } else if parts.len() == 2 {
                        if let Ok(l) = parts[0].parse::<usize>() {
                            lineno = Some(l);
                            file = Some(parts[1].to_string());
                        }
                    }
                    break;
                }
                // l.12 ...  （TeX 风格）
                if let Some(rest) = next.strip_prefix("l.") {
                    let num: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
                    if let Ok(l) = num.parse::<usize>() {
                        lineno = Some(l);
                    }
                    break;
                }
            }

            issues.push(CompileIssue {
                level: lv.to_string(),
                file,
                line: lineno,
                message: if message.is_empty() { line.to_string() } else { message.to_string() },
            });
        }
        i += 1;
    }

    // 去重：同一行同一消息只保留一条
    issues.dedup_by(|a, b| a.message == b.message && a.line == b.line);
    issues
}

/// 调用 tectonic 编译项目
#[tauri::command]
pub fn compile_project(root: String, tectonic_path: Option<String>) -> Result<CompileResult, String> {
    let root_path = PathBuf::from(&root);

    let exe = match tectonic_path {
        Some(p) if !p.is_empty() => PathBuf::from(p),
        _ => find_tectonic(&root_path).ok_or_else(|| {
            "未找到 tectonic 引擎。请在设置中指定 tectonic.exe 路径。".to_string()
        })?,
    };

    if !exe.exists() {
        let msg = format!("tectonic 引擎不存在: {}", exe.display());
        return Ok(CompileResult {
            success: false,
            message: msg.clone(),
            pdf_path: None,
            log: msg.clone(),
            issues: vec![CompileIssue {
                level: "error".to_string(),
                file: None,
                line: None,
                message: msg,
            }],
        });
    }

    let output = Command::new(&exe)
        .arg("-X")
        .arg("compile")
        .arg("main.tex")
        .current_dir(&root_path)
        .output()
        .map_err(|e| format!("启动 tectonic 失败: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{}{}", stdout, stderr);
    let issues = parse_issues(&combined);

    if output.status.success() {
        let pdf = root_path.join("main.pdf");
        Ok(CompileResult {
            success: true,
            message: "编译成功！PDF 已生成。".to_string(),
            pdf_path: if pdf.exists() { Some(pdf.to_string_lossy().to_string()) } else { None },
            log: combined,
            issues,
        })
    } else {
        let count = issues.iter().filter(|i| i.level == "error").count();
        let summary = if count > 0 {
            format!("编译失败，发现 {} 个错误。点击下方错误可定位到对应源码行。", count)
        } else {
            "编译失败，未解析出具体错误，请展开完整日志查看。".to_string()
        };
        Ok(CompileResult {
            success: false,
            message: summary,
            pdf_path: None,
            log: combined,
            issues,
        })
    }
}

/// 读取编译生成的 PDF，返回 base64（供前端 pdfjs 渲染预览）
#[tauri::command]
pub fn read_pdf(root: String) -> Result<String, String> {
    use base64::Engine;
    let path = PathBuf::from(&root).join("main.pdf");
    let bytes = fs::read(&path).map_err(|e| format!("无法读取 PDF: {}", e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// 获取 tectonic 路径配置
#[tauri::command]
pub fn get_tectonic_path(root: String) -> Result<String, String> {
    let root = PathBuf::from(&root);
    let config = root.join(".tectonic-path");
    if config.exists() {
        fs::read_to_string(&config).map_err(|e| e.to_string())
    } else {
        Ok(String::new())
    }
}

/// 设置 tectonic 路径配置
#[tauri::command]
pub fn set_tectonic_path(root: String, path: String) -> Result<(), String> {
    let root = PathBuf::from(&root);
    fs::write(root.join(".tectonic-path"), path)
        .map_err(|e| format!("保存配置失败: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ch(id: &str, order: usize, status: &str) -> Chapter {
        Chapter {
            id: id.to_string(),
            file: format!("chapters/{}.tex", id),
            title: id.to_string(),
            status: status.to_string(),
            order,
            summary: String::new(),
        }
    }

    #[test]
    fn reorder_renumbers_and_respects_given_ids() {
        let mut manifest = Manifest::new("测试".to_string());
        manifest.chapters = vec![
            ch("a", 1, "draft"),
            ch("b", 2, "draft"),
            ch("c", 3, "done"),
        ];
        let ids = vec!["c".to_string(), "a".to_string(), "b".to_string()];
        apply_reorder(&mut manifest, &ids);

        let order: Vec<(&str, usize)> = manifest.chapters.iter()
            .map(|c| (c.id.as_str(), c.order)).collect();
        assert_eq!(order, vec![("c", 1), ("a", 2), ("b", 3)]);
    }

    #[test]
    fn reorder_puts_unlisted_chapters_last() {
        let mut manifest = Manifest::new("测试".to_string());
        manifest.chapters = vec![ch("a", 1, "draft"), ch("b", 2, "draft")];
        apply_reorder(&mut manifest, &["b".to_string()]);
        assert_eq!(manifest.chapters[0].id, "b");
        assert_eq!(manifest.chapters[0].order, 1);
        assert_eq!(manifest.chapters[1].id, "a");
        assert_eq!(manifest.chapters[1].order, 2);
    }

    #[test]
    fn parse_issues_handles_tectonic_style() {
        let log = "warning: ...\n\nsome log\nerror: Undefined control sequence.\n  --> main.tex:12:5\n   |\n12 | \\foo\n";
        let issues = parse_issues(log);
        assert_eq!(issues.len(), 2);
        let err = issues.iter().find(|i| i.level == "error").unwrap();
        assert_eq!(err.line, Some(12));
        assert_eq!(err.file.as_deref(), Some("main.tex"));
        assert!(err.message.contains("Undefined control sequence"));
    }

    #[test]
    fn parse_issues_handles_tex_style() {
        let log = "! Missing $ inserted.\n<inserted text> \n                $\nl.42 这是一段中文\n";
        let issues = parse_issues(log);
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].line, Some(42));
        assert!(issues[0].message.contains("Missing $"));
    }

    #[test]
    fn sync_main_tex_uses_order_and_skips_idea() {
        let dir = std::env::temp_dir().join(format!("zhangxu-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let mut manifest = Manifest::new("测试".to_string());
        manifest.chapters = vec![
            ch("a", 3, "draft"),
            ch("b", 1, "idea"),
            ch("c", 2, "done"),
        ];
        fs::write(dir.join("main.tex"), default_main_tex("测试", "")).unwrap();
        sync_main_tex(&dir, &manifest).unwrap();
        let content = fs::read_to_string(dir.join("main.tex")).unwrap();
        let pos_c = content.find("chapters/c.tex").unwrap();
        let pos_a = content.find("chapters/a.tex").unwrap();
        assert!(pos_c < pos_a, "order 小的章节应排在前面");
        assert!(!content.contains("chapters/b.tex"), "idea 状态章节不应进入 main.tex");
        fs::remove_dir_all(&dir).ok();
    }
}
