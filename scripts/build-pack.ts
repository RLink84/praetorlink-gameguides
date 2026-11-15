// Builds a game's content pack from content/<game>/*.json, checks it, and writes
// public/packs/<game>/pack.json plus manifest.json (version, sha256, size).
// Usage: tsx scripts/build-pack.ts [--check] [game]   (default game: dd2)
// PACK_VERSION in the environment overrides the version in pack.meta.json (CI uses this).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
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
