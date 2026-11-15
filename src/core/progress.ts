// Playthrough profiles. Everything stays on this device (localStorage). Nothing is sent anywhere.
import type { Spoiler } from "./types";

export interface Timer { id: string; label: string; endsAt: number; questId?: string }

export interface Profile {
  id: string;
  name: string;
  game: string;
  /** Current main story step id (base track) and Dark Arisen step id (dlc track). */
  base: string;
  dlcStep: string;
  ownsDlc: boolean;
  level: number;
  spoiler: Spoiler;
  done: Record<string, true>;       // quest ids
  picked: Record<string, number>;   // choice id -> option index the player picked
  owned: Record<string, true>;      // item ids collected
  shopping: Record<string, true>;   // item ids on the shopping list
  counters: Record<string, number>; // collectible counters (e.g. seeker tokens)
  achieved: Record<string, true>;   // achievement ids (manual or Steam)
  timers: Timer[];
  last?: { route: string; at: number };
  createdAt: number;
}

export interface Settings {
  activeProfile: string;
  textScale: number;      // 1 = normal
  highContrast: boolean;
  reduceMotion: boolean;
  tester: boolean;
  compact: boolean;
  steamPath?: string;
  voiceRate: number;
  welcomed: boolean;
}

const KEY_PROFILES = "plgg.profiles.v1";
const KEY_SETTINGS = "plgg.settings.v1";

export function newProfile(name: string, game = "dd2"): Profile {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name,
    game,
    base: "m01",
    dlcStep: "d01",
    ownsDlc: false,
    level: 1,
    spoiler: 1,
    done: {},
    picked: {},
    owned: {},
    shopping: {},
    counters: {},
    achieved: {},
    timers: [],
    createdAt: Date.now(),
  };
}

export const defaultSettings = (profileId: string): Settings => ({
  activeProfile: profileId,
  textScale: 1,
  highContrast: false,
  reduceMotion: false,
  tester: false,
  compact: false,
  voiceRate: 1,
  welcomed: false,
});

type Store = Pick<Storage, "getItem" | "setItem">;
const mem = new Map<string, string>();
const fallback: Store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v) };
const store = (): Store => (typeof localStorage !== "undefined" ? localStorage : fallback);

export function loadProfiles(): Profile[] {
  try {
    const raw = store().getItem(KEY_PROFILES);
    const list = raw ? (JSON.parse(raw) as Profile[]) : [];
    if (list.length) return list.map((p) => ({ ...newProfile(p.name, p.game), ...p }));
  } catch { /* corrupted: start fresh below */ }
  return [newProfile("My playthrough")];
}
export function saveProfiles(list: Profile[]) { store().setItem(KEY_PROFILES, JSON.stringify(list)); }

export function loadSettings(profiles: Profile[]): Settings {
  try {
    const raw = store().getItem(KEY_SETTINGS);
    if (raw) {
      const s = { ...defaultSettings(profiles[0].id), ...(JSON.parse(raw) as Settings) };
      if (!profiles.some((p) => p.id === s.activeProfile)) s.activeProfile = profiles[0].id;
      return s;
    }
  } catch { /* ignore */ }
  return defaultSettings(profiles[0].id);
}
export function saveSettings(s: Settings) { store().setItem(KEY_SETTINGS, JSON.stringify(s)); }

// ---- compact sync code (for the phone QR). Quest/item/achievement flags become bitsets over pack order.
export interface SyncLists { quests: string[]; items: string[]; achievements: string[] }

function toBits(ids: string[], set: Record<string, unknown>): string {
  const bytes = new Uint8Array(Math.ceil(ids.length / 8));
  ids.forEach((id, i) => { if (set[id]) bytes[i >> 3] |= 1 << (i & 7); });
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromBits(ids: string[], code: string): Record<string, true> {
  const b64 = code.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out: Record<string, true> = {};
  ids.forEach((id, i) => { if ((bin.charCodeAt(i >> 3) || 0) & (1 << (i & 7))) out[id] = true; });
  return out;
}

/** Short fingerprint of the id lists, so a code is only applied to a pack with the same quest/item/achievement order. */
export function listsHash(lists: SyncLists): string {
  let h = 0x811c9dc5;
  const text = [lists.quests.join(","), lists.items.join(","), lists.achievements.join(",")].join("|");
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(36);
}

// encodeURIComponent leaves "!" and "~" alone, but they are the field separators here.
const escName = (s: string) => encodeURIComponent(s).replace(/!/g, "%21").replace(/~/g, "%7E");

export function encodeSync(p: Profile, lists: SyncLists, packVersion: string): string {
  const head = [1, p.game, packVersion, p.base, p.dlcStep, p.ownsDlc ? 1 : 0, p.level, p.spoiler, escName(p.name), listsHash(lists)].join("~");
  return [head, toBits(lists.quests, p.done), toBits(lists.items, p.owned), toBits(lists.achievements, p.achieved)].join("!");
}

export function decodeSync(code: string, lists: SyncLists): Partial<Profile> & { packVersion: string } {
  const [head, q, i, a] = code.split("!");
  const [ver, game, packVersion, base, dlcStep, owns, level, spoiler, name, hash] = head.split("~");
  if (ver !== "1") throw new Error("This sync code is from a newer app version.");
  if (hash && hash !== listsHash(lists))
    throw new Error("This sync code was made with different guide data. Update the guide on both devices and try again.");
  return {
    game, packVersion, base, dlcStep, ownsDlc: owns === "1", level: Number(level) || 1,
    spoiler: (Math.min(3, Math.max(0, Number(spoiler) || 0)) as Spoiler), name: decodeURIComponent(name || "Synced"),
    done: fromBits(lists.quests, q || ""), owned: fromBits(lists.items, i || ""), achieved: fromBits(lists.achievements, a || ""),
  };
}
