use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chapter {
    pub id: String,
    pub file: String,
    pub title: String,
    pub status: String,
    pub order: usize,
    #[serde(default)]
    pub summary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub title: String,
    #[serde(default = "default_columns")]
    pub columns: Vec<String>,
    pub chapters: Vec<Chapter>,
    /// 项目根目录（运行时填充，不写入 manifest.json）
    #[serde(skip)]
    pub root: PathBuf,
}

fn default_columns() -> Vec<String> {
    ["构思中", "初稿", "修改中", "已定稿"]
        .iter()
        .map(|s| s.to_string())
        .collect()
}

impl Manifest {
    pub fn new(title: String) -> Self {
        Self {
            title,
            columns: default_columns(),
            chapters: Vec::new(),
            root: PathBuf::new(),
        }
    }
}
