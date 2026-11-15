// Offline search and "Ask the guide". Only spoiler-light fields are indexed so a search never reveals outcomes.
import MiniSearch from "minisearch";
import type { Pack } from "./types";

export type DocKind = "quest" | "item" | "area" | "tip" | "achievement" | "choice";
export interface Doc { id: string; key: string; kind: DocKind; name: string; text: string; dlc: boolean; stage: string; extra?: string }

export function buildDocs(pack: Pack): Doc[] {
  const docs: Doc[] = [];
  for (const q of pack.quests)
    docs.push({ id: q.id, key: `quest:${q.id}`, kind: "quest", name: q.name, dlc: q.dlc, stage: q.stage,
      text: [q.premise, q.area, q.giver, q.unlock].filter(Boolean).join(" "),
      extra: (q.rewards ?? []).flatMap((r) => r.items ?? []).join(" ") });
  for (const i of pack.items)
    docs.push({ id: i.id, key: `item:${i.id}`, kind: "item", name: i.name, dlc: i.dlc, stage: i.stage,
      text: [i.category, i.type, (i.vocations ?? []).join(" ")].filter(Boolean).join(" "),
      extra: i.sources.map((s) => s.text).join(" ") });
  for (const a of pack.areas)
    docs.push({ id: a.id, key: `area:${a.id}`, kind: "area", name: a.name, dlc: a.dlc, stage: a.stage, text: `${a.region} ${a.spoiler <= 1 ? a.summary : ""}` });
  for (const t of pack.tips)
    docs.push({ id: t.id, key: `tip:${t.id}`, kind: "tip", name: t.name, dlc: t.dlc, stage: t.stage,
      text: `${t.topic} ${t.platform ?? ""} ${t.spoiler <= 1 ? t.body : ""}` });
  for (const a of pack.achievements)
    docs.push({ id: a.id, key: `achievement:${a.id}`, kind: "achievement", name: a.name, dlc: a.dlc, stage: "m01", text: a.spoiler <= 1 ? a.how : "achievement trophy" });
  for (const c of pack.choices) {
    const q = pack.quests.find((x) => x.id === c.quest);
    docs.push({ id: c.id, key: `choice:${c.id}`, kind: "choice", name: `${q?.name ?? ""} choice`, dlc: c.dlc, stage: c.stage, text: c.prompt });
  }
  return docs;
}

export function buildIndex(pack: Pack) {
  const docs = buildDocs(pack);
  const ms = new MiniSearch<Doc>({
    idField: "key",
    fields: ["name", "text", "extra"],
    storeFields: ["id", "kind", "name", "dlc", "stage"],
    searchOptions: { boost: { name: 3, text: 1, extra: 0.7 }, prefix: true, fuzzy: 0.2 },
  });
  ms.addAll(docs);
  return ms;
}

export type Hit = { id: string; kind: DocKind; name: string; dlc: boolean; stage: string; score: number };

const STOP = new Set(["how", "do", "i", "the", "a", "an", "to", "where", "is", "can", "what", "get", "find", "of", "in", "for", "my",
  "me", "start", "buy", "fix", "does", "it", "which", "who", "you", "be", "on", "at", "and", "or", "with", "should"]);

/** Turns a plain question into a search with a guess at what kind of answer is wanted. */
export function ask(ms: MiniSearch<Doc>, question: string, limit = 8): { intent: DocKind | "any"; hits: Hit[] } {
  const q = question.toLowerCase();
  let intent: DocKind | "any" = "any";
  if (/\b(where|buy|get|find|drop|farm|sold)\b/.test(q)) intent = "item";
  if (/\b(quest|start|unlock|missable|reward|begin)\b/.test(q)) intent = "quest";
  if (/\b(error|crash|fix|d3d|freeze|stutter|server)\b/.test(q)) intent = "tip";
  if (/\b(level|xp|exp|grind|farm xp)\b/.test(q)) intent = "tip";
  if (/\b(trophy|achievement)\b/.test(q)) intent = "achievement";
  if (/\b(choose|choice|pick|decide|side with)\b/.test(q)) intent = "choice";
  const words = q.replace(/[^a-z0-9' -]/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
  const terms = words.join(" ") || q;
  const raw = ms.search(terms, { combineWith: "OR" }) as unknown as Hit[];
  const hits = raw
    .map((h) => ({ ...h, score: h.score * (intent !== "any" && h.kind === intent ? 2 : 1) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return { intent, hits };
}
