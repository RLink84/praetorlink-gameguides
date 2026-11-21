// Native side of PraetorLink Game Guides. Kept tiny on purpose: the whole guide runs in the web view.
// Native features: reading Steam's local achievement files and this game's Steam screenshots (read-only, nothing is sent anywhere).
mod steam;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    }
    builder
        .invoke_handler(tauri::generate_handler![steam::read_steam_stats, steam::list_steam_screenshots, steam::read_steam_screenshot, steam::list_clips])
        .run(tauri::generate_context!())
        .expect("error while running PraetorLink Game Guides");
}
