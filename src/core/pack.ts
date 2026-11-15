// Content pack loading and over-the-air updates (data only, no code).
// Order on launch: last verified downloaded pack -> pack bundled with the app.
// Update check: fetch manifest from the update site, compare versions, download, verify sha256 and checks,
// then keep the old pack as a rollback copy.
import type { Pack, Manifest } from "./types";
import { validatePack, compareVersions } from "./validate";

export const APP_VERSION = __APP_VERSION__;
/** Where published packs live (GitHub Pages for this repo). Overridable at build time. */
export const UPDATE_BASE = (import.meta.env.VITE_UPDATE_BASE as string | undefined) ?? "https://rlink84.github.io/praetorlink-gameguides/";

const K_CUR = (g: string) => `plgg.pack.${g}.current`;
const K_OLD = (g: string) => `plgg.pack.${g}.previous`;
const K_CHECK = (g: string) => `plgg.pack.${g}.checkedAt`;

async function sha256(text: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function usable(p: Pack | null): p is Pack {
  return !!p && validatePack(p).errors.length === 0 && compareVersions(APP_VERSION, p.minAppVersion) >= 0;
}

function cached(game: string, key = K_CUR(game)): Pack | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Pack) : null;
  } catch {
    return null;
  }
}

export async function loadPack(game = "dd2"): Promise<{ pack: Pack; from: "update" | "bundled" }> {
  const bundled = (await (await fetch(`packs/${game}/pack.json`)).json()) as Pack;
  const c = cached(game);
  if (usable(c) && compareVersions(c.version, bundled.version) > 0) return { pack: c, from: "update" };
  return { pack: bundled, from: "bundled" };
}

export type UpdateResult = { status: "none" | "updated" | "needs-app-update" | "error"; version?: string; message?: string };

export async function checkForPackUpdate(current: Pack, opts: { force?: boolean } = {}): Promise<UpdateResult> {
  const game = current.game;
  const last = Number(localStorage.getItem(K_CHECK(game)) || 0);
  if (!opts.force && Date.now() - last < 6 * 3600_000) return { status: "none" };
  try {
    const base = UPDATE_BASE.endsWith("/") ? UPDATE_BASE : UPDATE_BASE + "/";
    const m = (await (await fetch(`${base}packs/${game}/manifest.json`, { cache: "no-store" })).json()) as Manifest;
    localStorage.setItem(K_CHECK(game), String(Date.now()));
    if (compareVersions(m.version, current.version) <= 0) return { status: "none" };
    if (compareVersions(APP_VERSION, m.minAppVersion) < 0) return { status: "needs-app-update", version: m.version };
    const body = await (await fetch(new URL(m.url, `${base}packs/${game}/`).toString(), { cache: "no-store" })).text();
    if ((await sha256(body)) !== m.sha256) return { status: "error", message: "Download didn't match its checksum, so it was ignored." };
    const pack = JSON.parse(body) as Pack;
    const { errors } = validatePack(pack);
    if (errors.length) return { status: "error", message: "The new guide data failed its checks, so it was ignored." };
    const prev = localStorage.getItem(K_CUR(game));
    if (prev) localStorage.setItem(K_OLD(game), prev);
    localStorage.setItem(K_CUR(game), body);
    return { status: "updated", version: pack.version };
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Go back to the previous downloaded pack (or the bundled one). */
export function rollbackPack(game = "dd2"): boolean {
  const prev = localStorage.getItem(K_OLD(game));
  if (prev) localStorage.setItem(K_CUR(game), prev);
  else localStorage.removeItem(K_CUR(game));
  localStorage.removeItem(K_OLD(game));
  return true;
}
