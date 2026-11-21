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

// ---- Steam screenshots (F12). Steam keeps them in
//   userdata/<accountid>/760/remote/<appid>/screenshots/*.jpg  (+ thumbnails/ with the same names)
// We only list and read files inside those folders. Read-only.

#[derive(Serialize)]
pub struct Shot {
    /// Full path of the screenshot (passed back to read_steam_screenshot).
    path: String,
    /// Seconds since 1970, newest first.
    taken: u64,
    /// Small JPEG thumbnail bytes (empty if Steam made none).
    thumb: Vec<u8>,
}

fn shot_dirs(appid: u32, steam_path: Option<String>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for root in candidates(steam_path) {
        let userdata = root.join("userdata");
        if let Ok(rd) = std::fs::read_dir(&userdata) {
            for e in rd.flatten() {
                let d = e.path().join("760").join("remote").join(appid.to_string()).join("screenshots");
                if d.is_dir() {
                    dirs.push(d);
                }
            }
        }
        if !dirs.is_empty() {
            break;
        }
    }
    dirs
}

#[tauri::command]
pub fn list_steam_screenshots(appid: u32, steam_path: Option<String>, limit: Option<usize>) -> Result<Vec<Shot>, String> {
    let dirs = shot_dirs(appid, steam_path);
    if dirs.is_empty() {
        return Err("No Steam screenshots for this game yet. Press F12 in the game to take one.".into());
    }
    let mut all: Vec<(u64, PathBuf)> = Vec::new();
    for d in &dirs {
        for e in std::fs::read_dir(d).map_err(|e| e.to_string())?.flatten() {
            let p = e.path();
            let is_jpg = p.extension().map_or(false, |x| x.eq_ignore_ascii_case("jpg") || x.eq_ignore_ascii_case("png"));
            if p.is_file() && is_jpg {
                let t = e.metadata().and_then(|m| m.modified()).ok()
                    .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
                all.push((t, p));
            }
        }
    }
    all.sort_by(|a, b| b.0.cmp(&a.0));
    all.truncate(limit.unwrap_or(24).min(60));
    Ok(all.into_iter().map(|(taken, p)| {
        let thumb_path = p.parent().map(|d| d.join("thumbnails").join(p.file_name().unwrap_or_default()));
        let thumb = thumb_path.and_then(|t| std::fs::read(t).ok()).unwrap_or_default();
        Shot { path: p.to_string_lossy().to_string(), taken, thumb }
    }).collect())
}

#[tauri::command]
pub fn read_steam_screenshot(appid: u32, steam_path: Option<String>, path: String) -> Result<tauri::ipc::Response, String> {
    let wanted = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
    let allowed = shot_dirs(appid, steam_path).into_iter()
        .filter_map(|d| std::fs::canonicalize(d).ok())
        .any(|d| wanted.parent() == Some(d.as_path()));
    if !allowed {
        return Err("That file isn't one of this game's Steam screenshots.".into());
    }
    let bytes = std::fs::read(&wanted).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

// ---- Video clips (OBS replay buffer, Steam game recording exports, etc.)
// Lists the newest video files in a folder the player chose. Read-only; we never copy or upload them.

#[derive(Serialize)]
pub struct Clip {
    path: String,
    name: String,
    taken: u64,
    size: u64,
}

#[tauri::command]
pub fn list_clips(folder: String, limit: Option<usize>) -> Result<Vec<Clip>, String> {
    let dir = PathBuf::from(folder.trim());
    if !dir.is_dir() {
        return Err("That clips folder doesn't exist. Check the folder in Settings.".into());
    }
    let mut all: Vec<Clip> = Vec::new();
    for e in std::fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        let p = e.path();
        let ext = p.extension().map(|x| x.to_string_lossy().to_ascii_lowercase()).unwrap_or_default();
        if !p.is_file() || !["mp4", "mkv", "webm", "mov"].contains(&ext.as_str()) {
            continue;
        }
        let meta = match e.metadata() { Ok(m) => m, Err(_) => continue };
        let taken = meta.modified().ok().and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs());
        all.push(Clip { path: p.to_string_lossy().to_string(), name: e.file_name().to_string_lossy().to_string(), taken, size: meta.len() });
    }
    all.sort_by(|a, b| b.taken.cmp(&a.taken));
    all.truncate(limit.unwrap_or(30).min(100));
    Ok(all)
}
