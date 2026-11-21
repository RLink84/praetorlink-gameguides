// "My screenshots": pictures the player attaches to a quest. Kept only on this device (IndexedDB).
// Export packs them into a zip the player can send to PraetorLink, so they can be added to the guide for everyone.
import { zipSync, strToU8 } from "fflate";
import { isTauri } from "./steam";

export interface Shot { id: string; quest: string; caption: string; added: number; blob: Blob }

const DB = "plgg-shots";
const STORE = "shots";

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("quest", "quest");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const req = fn(d.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const shotsFor = (quest: string) => tx<Shot[]>("readonly", (s) => s.index("quest").getAll(quest)).then((l) => l.sort((a, b) => a.added - b.added));
export const allShots = () => tx<Shot[]>("readonly", (s) => s.getAll());
export const saveShot = (shot: Shot) => tx("readwrite", (s) => s.put(shot));
export const deleteShot = (id: string) => tx("readwrite", (s) => s.delete(id));

/** Shrink a picture to at most 1600 px wide as a JPEG, so a few hundred shots stay small. */
export async function shrink(input: Blob, max = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(input);
  const scale = Math.min(1, max / bmp.width);
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale);
  c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that picture"))), "image/jpeg", 0.85));
}

export async function addShot(quest: string, input: Blob, caption = ""): Promise<Shot> {
  const shot: Shot = { id: `${quest}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, quest, caption, added: Date.now(), blob: await shrink(input) };
  await saveShot(shot);
  return shot;
}

/** Zip of every attached screenshot plus captions, laid out the way content/<game>/images/ expects. */
export async function exportShots(game: string): Promise<Blob | null> {
  const list = await allShots();
  if (!list.length && !allClips().length) return null;
  const files: Record<string, Uint8Array> = {};
  const index: Record<string, { file: string; caption: string }[]> = {};
  for (const s of list) {
    const file = `${s.quest}/${s.id}.jpg`;
    files[file] = new Uint8Array(await s.blob.arrayBuffer());
    (index[s.quest] ??= []).push({ file, caption: s.caption });
  }
  files["images.json"] = strToU8(JSON.stringify(index, null, 1));
  const clips = allClips().map(({ quest, name, youtube, caption }) => ({ quest, name, youtube, caption }));
  if (clips.length) files["clips.json"] = strToU8(JSON.stringify(clips, null, 1));
  files["README.txt"] = strToU8(`My ${game} screenshots for PraetorLink Game Guides. Only pictures I took myself.\n`);
  const zipped = zipSync(files, { level: 0 });
  return new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
}

// ---- Steam F12 screenshots (desktop app only)
export interface SteamShot { path: string; taken: number; thumb: string }

export async function steamShots(appid: number, steamPath?: string): Promise<SteamShot[]> {
  if (!isTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  const list = await invoke<{ path: string; taken: number; thumb: number[] }[]>("list_steam_screenshots", { appid, steamPath: steamPath ?? null, limit: 24 });
  return list.map((s) => ({ path: s.path, taken: s.taken, thumb: s.thumb.length ? URL.createObjectURL(new Blob([new Uint8Array(s.thumb)], { type: "image/jpeg" })) : "" }));
}

export async function readSteamShot(appid: number, path: string, steamPath?: string): Promise<Blob> {
  const { invoke } = await import("@tauri-apps/api/core");
  const buf = await invoke<ArrayBuffer>("read_steam_screenshot", { appid, steamPath: steamPath ?? null, path });
  return new Blob([buf], { type: path.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg" });
}

// ---- Video clips: we keep only a reference (file path + optional YouTube link), never the video itself.
export interface ClipRef { id: string; quest: string; path: string; name: string; taken: number; youtube?: string; caption?: string }
const CLIPS = "plgg.clips.v1";
export const allClips = (): ClipRef[] => { try { return JSON.parse(localStorage.getItem(CLIPS) || "[]"); } catch { return []; } };
const writeClips = (l: ClipRef[]) => localStorage.setItem(CLIPS, JSON.stringify(l));
export const clipsFor = (quest: string) => allClips().filter((c) => c.quest === quest).sort((a, b) => a.taken - b.taken);
export function saveClip(c: ClipRef) { writeClips([...allClips().filter((x) => x.id !== c.id), c]); }
export function deleteClip(id: string) { writeClips(allClips().filter((x) => x.id !== id)); }

export interface DiskClip { path: string; name: string; taken: number; size: number }
export async function listClips(folder: string): Promise<DiskClip[]> {
  if (!isTauri() || !folder.trim()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<DiskClip[]>("list_clips", { folder, limit: 30 });
}
export async function openClip(path: string, reveal = false) {
  const m = await import("@tauri-apps/plugin-opener");
  return reveal ? m.revealItemInDir(path) : m.openPath(path);
}

// ---- Auto-attach: while a quest is "active", new Steam screenshots and clips attach to it.
const SEEN = "plgg.autocapture.seen";
const seen = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(SEEN) || "[]")); } catch { return new Set(); } };

/** One pass. Returns how many screenshots and clips were attached. */
export async function autoCapture(opts: { appid: number; quest: string; since: number; steamPath?: string; clipsFolder?: string }): Promise<{ shots: number; clips: number }> {
  const done = seen();
  let shots = 0, clips = 0;
  const sinceSec = Math.floor(opts.since / 1000);
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const list = await invoke<{ path: string; taken: number }[]>("list_steam_screenshots", { appid: opts.appid, steamPath: opts.steamPath ?? null, limit: 12 });
    for (const s of list.filter((x) => x.taken >= sinceSec && !done.has(x.path)).reverse()) {
      await addShot(opts.quest, await readSteamShot(opts.appid, s.path, opts.steamPath));
      done.add(s.path); shots++;
    }
  } catch { /* no Steam screenshots folder yet */ }
  if (opts.clipsFolder) {
    try {
      for (const c of (await listClips(opts.clipsFolder)).filter((x) => x.taken >= sinceSec && !done.has(x.path)).reverse()) {
        saveClip({ id: `clip-${c.taken}-${c.name}`, quest: opts.quest, path: c.path, name: c.name, taken: c.taken });
        done.add(c.path); clips++;
      }
    } catch { /* folder missing */ }
  }
  localStorage.setItem(SEEN, JSON.stringify([...done].slice(-500)));
  return { shots, clips };
}
