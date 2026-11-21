// Builds a game's content pack from content/<game>/*.json, checks it, and writes
// public/packs/<game>/pack.json plus manifest.json (version, sha256, size).
// Usage: tsx scripts/build-pack.ts [--check] [game]   (default game: dd2)
// PACK_VERSION in the environment overrides the version in pack.meta.json (CI uses this).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pack, Manifest } from "../src/core/types";
import { validatePack } from "../src/core/validate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const game = args.find((a) => !a.startsWith("--")) ?? "dd2";
const dir = join(root, "content", game);

const read = <T>(f: string): T => JSON.parse(readFileSync(join(dir, f), "utf8")) as T;
const meta = read<Omit<Pack, "story" | "quests" | "choices" | "items" | "areas" | "tips" | "achievements" | "builtAt">>("pack.meta.json");

const pack: Pack = {
  ...meta,
  version: process.env.PACK_VERSION || meta.version,
  builtAt: new Date().toISOString(),
  story: read("story.json"),
  quests: read("quests.json"),
  choices: read("choices.json"),
  items: read("items.json"),
  areas: read("areas.json"),
  tips: read("tips.json"),
  achievements: read("achievements.json"),
};

// Walkthroughs live in their own file (quest id -> steps) and are merged into the quests here.
const wtFile = join(dir, "walkthroughs.json");
if (existsSync(wtFile)) {
  const wt = JSON.parse(readFileSync(wtFile, "utf8")) as Record<string, string[] | string>;
  for (const [id, steps] of Object.entries(wt)) {
    if (id.startsWith("_")) continue;
    const q = pack.quests.find((x) => x.id === id);
    if (!q) { console.error(`error: walkthroughs.json has unknown quest id ${id}`); process.exit(1); }
    if (Array.isArray(steps)) q.steps = steps;
  }
}

// Links: quest id -> one online page with maps and pictures. "_map" is the interactive map.
const linkFile = join(dir, "links.json");
if (existsSync(linkFile)) {
  const links = JSON.parse(readFileSync(linkFile, "utf8")) as Record<string, string>;
  if (links._map) pack.mapUrl = links._map;
  for (const [id, url] of Object.entries(links)) {
    if (id.startsWith("_")) continue;
    const q = pack.quests.find((x) => x.id === id);
    if (!q) { console.error(`error: links.json has unknown quest id ${id}`); process.exit(1); }
    if (!/^https:\/\//.test(url)) { console.error(`error: links.json ${id} must be an https link`); process.exit(1); }
    q.guideUrl = url;
  }
}

// Our own screenshots: content/<game>/images/images.json maps quest id -> [{file, caption, by}].
// Files sit next to it and are copied to public/packs/<game>/img/.
const imgDir = join(dir, "images");
const imgIndex = join(imgDir, "images.json");
const imgFiles: string[] = [];
if (existsSync(imgIndex)) {
  const idx = JSON.parse(readFileSync(imgIndex, "utf8")) as Record<string, { file: string; caption: string; by?: string }[]>;
  for (const [id, list] of Object.entries(idx)) {
    if (id.startsWith("_")) continue;
    const q = pack.quests.find((x) => x.id === id);
    if (!q) { console.error(`error: images.json has unknown quest id ${id}`); process.exit(1); }
    for (const im of list) {
      if (!/^[a-z0-9-]+\/[a-z0-9._-]+\.(jpe?g|png|webp)$/.test(im.file) || !existsSync(join(imgDir, im.file))) {
        console.error(`error: images.json ${id}: missing or badly named file ${im.file}`); process.exit(1);
      }
      imgFiles.push(im.file);
    }
    q.images = list;
  }
}

// Our own videos (SuperRobio): content/<game>/videos.json maps quest id -> [{url, title}]. YouTube links only.
const vidFile = join(dir, "videos.json");
if (existsSync(vidFile)) {
  const vids = JSON.parse(readFileSync(vidFile, "utf8")) as Record<string, { url: string; title: string }[]>;
  for (const [id, list] of Object.entries(vids)) {
    if (id.startsWith("_")) continue;
    const q = pack.quests.find((x) => x.id === id);
    if (!q) { console.error(`error: videos.json has unknown quest id ${id}`); process.exit(1); }
    for (const v of list) {
      if (!/^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{6,}/.test(v.url)) { console.error(`error: videos.json ${id}: not a YouTube link: ${v.url}`); process.exit(1); }
    }
    q.videos = list;
  }
}

// Optional banned-phrase list: exact sentences we must never ship (e.g. copied text found in review).
const bannedFile = join(dir, "banned-phrases.json");
const banned: string[] = existsSync(bannedFile) ? JSON.parse(readFileSync(bannedFile, "utf8")) : [];

const { errors, warnings } = validatePack(pack, banned);
for (const w of warnings) console.warn("warn:", w);
if (errors.length) {
  for (const e of errors) console.error("error:", e);
  console.error(`\n${errors.length} error(s). Pack not written.`);
  process.exit(1);
}
const counts = `${pack.quests.length} quests, ${pack.choices.length} choices, ${pack.items.length} items, ${pack.areas.length} areas, ${pack.tips.length} tips, ${pack.achievements.length} achievements`;
if (checkOnly) {
  console.log(`OK ${game} ${pack.version}: ${counts} (${warnings.length} warnings)`);
  process.exit(0);
}

const out = join(root, "public", "packs", game);
mkdirSync(out, { recursive: true });
const body = JSON.stringify(pack);
writeFileSync(join(out, "pack.json"), body);
for (const f of imgFiles) {
  mkdirSync(dirname(join(out, "img", f)), { recursive: true });
  copyFileSync(join(imgDir, f), join(out, "img", f));
}
const manifest: Manifest = {
  game,
  version: pack.version,
  minAppVersion: pack.minAppVersion,
  url: "pack.json",
  sha256: createHash("sha256").update(body).digest("hex"),
  size: Buffer.byteLength(body),
};
writeFileSync(join(out, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`Wrote ${game} ${pack.version}: ${counts}, ${(manifest.size / 1024).toFixed(0)} KB`);
