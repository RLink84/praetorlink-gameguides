// PC app updates (code). Uses the Tauri updater: it reads a signed latest.json from this repo's newest
// GitHub release, downloads the installer, checks its signature and restarts. Web builds update by reloading.
import { isTauri } from "./steam";

export type AppUpdate = { available: boolean; version?: string; notes?: string; install?: () => Promise<void> };

export async function checkAppUpdate(): Promise<AppUpdate> {
  if (!isTauri()) return { available: false };
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const u = await check();
    if (!u) return { available: false };
    return {
      available: true,
      version: u.version,
      notes: u.body ?? undefined,
      install: async () => {
        await u.downloadAndInstall();
        const { relaunch } = await import("@tauri-apps/plugin-process");
        await relaunch();
      },
    };
  } catch {
    return { available: false };
  }
}

/** Compact always-on-top window for following along beside the game (PC). */
export async function setCompactWindow(on: boolean): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWindow, LogicalSize } = await import("@tauri-apps/api/window");
  const w = getCurrentWindow();
  await w.setAlwaysOnTop(on);
  await w.setSize(on ? new LogicalSize(420, 720) : new LogicalSize(1100, 800));
}
