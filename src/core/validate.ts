// Pack checks, shared by the build script, the tests and the app (a downloaded pack is checked before use).
import type { Pack } from "./types";

export interface Report { errors: string[]; warnings: string[] }

export function validatePack(p: Pack, banned: string[] = []): Report {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!p || typeof p !== "object") return { errors: ["pack is not an object"], warnings };
  for (const k of ["game", "title", "version", "minAppVersion", "disclaimer"] as const) {
    if (!p[k]) errors.push(`missing ${k}`);
  }
  for (const k of ["story", "quests", "choices", "items", "areas", "tips", "achievements"] as const) {
    if (!Array.isArray(p[k])) errors.push(`${k} must be a list`);
  }
  if (errors.length) return { errors, warnings };

  const stories = new Set(p.story.map((s) => s.id));
  const questIds = new Set(p.quests.map((q) => q.id));
  const choiceIds = new Set(p.choices.map((c) => c.id));
  const seen = new Map<string, string>();

  const all = [
    ...p.quests.map((x) => ["quest", x] as const),
    ...p.choices.map((x) => ["choice", x] as const),
    ...p.items.map((x) => ["item", x] as const),
    ...p.areas.map((x) => ["area", x] as const),
    ...p.tips.map((x) => ["tip", x] as const),
  ];
  for (const [kind, e] of all) {
    const key = `${kind}:${e.id}`;
    if (!e.id || !/^[a-z0-9-]+$/.test(e.id)) errors.push(`${key}: bad id`);
    if (seen.has(key)) errors.push(`${key}: duplicate id`);
    seen.set(key, e.name);
    if (!e.name) errors.push(`${key}: missing name`);
    if (![0, 1, 2, 3].includes(e.spoiler)) errors.push(`${key}: spoiler must be 0-3`);
    if (typeof e.dlc !== "boolean") errors.push(`${key}: dlc flag must be true or false`);
    if (!stories.has(e.stage)) errors.push(`${key}: unknown stage ${e.stage}`);
  }
  for (const q of p.quests) {
    if (!q.premise) errors.push(`quest:${q.id}: missing premise`);
    if (q.locksAt && !stories.has(q.locksAt)) errors.push(`quest:${q.id}: unknown locksAt ${q.locksAt}`);
    for (const r of q.related ?? []) if (!questIds.has(r)) errors.push(`quest:${q.id}: related quest ${r} not found`);
    for (const c of q.choices ?? []) if (!choiceIds.has(c)) errors.push(`quest:${q.id}: choice ${c} not found`);
    if (q.timed && !q.failure) warnings.push(`quest:${q.id}: timed but no failure note`);
  }
  for (const c of p.choices) {
    if (!questIds.has(c.quest)) errors.push(`choice:${c.id}: quest ${c.quest} not found`);
    if (!c.options?.length) errors.push(`choice:${c.id}: no options`);
    for (const o of c.options ?? []) for (const l of o.links ?? []) if (!questIds.has(l)) errors.push(`choice:${c.id}: link ${l} not found`);
  }
  for (const a of p.achievements) {
    for (const m of a.marks) if (!questIds.has(m) && !stories.has(m)) errors.push(`achievement:${a.id}: mark ${m} not found`);
  }
  for (const i of p.items) if (!Array.isArray(i.sources)) errors.push(`item:${i.id}: sources must be a list`);
  const noSource = p.items.filter((i) => i.sources.length === 0).length;
  if (noSource) warnings.push(`${noSource} items have no known source yet`);

  // Story order must be 0..n-1 per track.
  for (const track of ["base", "dlc"] as const) {
    const s = p.story.filter((x) => x.track === track).map((x) => x.order).sort((a, b) => a - b);
    s.forEach((o, i) => { if (o !== i) errors.push(`story ${track}: order should be ${i}, got ${o}`); });
  }

  // Never ship sentences flagged as copied.
  if (banned.length) {
    const text = JSON.stringify(p).toLowerCase();
    for (const b of banned) if (b && text.includes(b.toLowerCase())) errors.push(`banned phrase found: "${b.slice(0, 40)}..."`);
  }
  return { errors, warnings };
}

/** Compare dotted version strings like 0.1.10 and 0.1.9. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}
