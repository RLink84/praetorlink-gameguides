// Finds Steam's local stats cache and returns the raw bytes of two files for one game:
//   appcache/stats/UserGameStatsSchema_<appid>.bin
//   appcache/stats/UserGameStats_<accountid>_<appid>.bin   (newest one if several Steam accounts used this PC)
// Parsing happens in the web view (src/core/steam.ts). Read-only.
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
pub struct SteamStats {
    schema: Vec<u8>,
    user: Vec<u8>,
    account: String,
}

fn candidates(custom: Option<String>) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(c) = custom.filter(|c| !c.trim().is_empty()) {
        v.push(PathBuf::from(c.trim()));
    }
    for var in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Ok(p) = std::env::var(var) {
            v.push(Path::new(&p).join("Steam"));
        }
    }
    for p in ["C:\\Steam", "D:\\Steam", "D:\\Program Files (x86)\\Steam", "E:\\Steam"] {
        v.push(PathBuf::from(p));
    }
    if let Ok(home) = std::env::var("HOME") {
        v.push(Path::new(&home).join(".steam/steam"));
        v.push(Path::new(&home).join(".local/share/Steam"));
        v.push(Path::new(&home).join("Library/Application Support/Steam"));
    }
    v
}

#[tauri::command]
pub fn read_steam_stats(appid: u32, steam_path: Option<String>) -> Result<SteamStats, String> {
    let stats_dir = candidates(steam_path)
        .into_iter()
        .map(|p| p.join("appcache").join("stats"))
        .find(|p| p.join(format!("UserGameStatsSchema_{appid}.bin")).exists())
        .ok_or_else(|| {
            "Couldn't find Steam's achievement files. Open the game once in Steam, or set your Steam folder in Settings.".to_string()
        })?;
    let schema = std::fs::read(stats_dir.join(format!("UserGameStatsSchema_{appid}.bin"))).map_err(|e| e.to_string())?;
    let suffix = format!("_{appid}.bin");
    let mut best: Option<(std::time::SystemTime, PathBuf, String)> = None;
    for entry in std::fs::read_dir(&stats_dir).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(rest) = name.strip_prefix("UserGameStats_") {
            if let Some(account) = rest.strip_suffix(&suffix) {
                if account.chars().all(|c| c.is_ascii_digit()) {
                    let modified = entry.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                    if best.as_ref().map_or(true, |b| modified > b.0) {
                        best = Some((modified, entry.path(), account.to_string()));
                    }
                }
            }
        }
    }
    let (_, path, account) = best.ok_or_else(|| "Steam has no saved achievements for this game on this PC yet.".to_string())?;
    let user = std::fs::read(path).map_err(|e| e.to_string())?;
    Ok(SteamStats { schema, user, account })
}
