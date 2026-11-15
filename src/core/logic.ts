// Story position, quest availability, missable warnings and recommendations.
import type { Pack, Quest, StoryStep, Base } from "./types";
import type { Profile } from "./progress";

export type QuestStatus = "done" | "available" | "upcoming" | "missed" | "hidden";

export interface Position { base: number; dlc: number }

export function stepById(pack: Pack, id: string): StoryStep | undefined {
  return pack.story.find((s) => s.id === id);
}

export function position(pack: Pack, p: Profile): Position {
  return { base: stepById(pack, p.base)?.order ?? 0, dlc: p.ownsDlc ? stepById(pack, p.dlcStep)?.order ?? 0 : -1 };
}

/** Has the player reached (started) the given story step? */
export function reached(pack: Pack, pos: Position, stepId: string): boolean {
  const s = stepById(pack, stepId);
  if (!s) return true;
  return s.track === "base" ? s.order <= pos.base : s.order <= pos.dlc;
}

/** Is this entry allowed to show at all for this profile (DLC switch)? */
export function visible(e: Base, p: Profile): boolean {
  return !e.dlc || p.ownsDlc;
}

/**
 * Spoiler gate: what level of detail can be shown without a tap-to-reveal.
 * Entries from story steps the player hasn't reached yet are capped at name-only (0).
 */
export function detailAllowed(pack: Pack, pos: Position, p: Profile, e: Base): number {
  if (!reached(pack, pos, e.stage)) return 0;
  return p.spoiler;
}

/** May this entry's NAME be shown without a tap? Later-story names stay hidden below spoiler level 2. */
export function nameAllowed(pack: Pack, pos: Position, p: Profile, e: Base): boolean {
  return reached(pack, pos, e.stage) || p.spoiler >= 2;
}

export function questStatus(pack: Pack, pos: Position, p: Profile, q: Quest): QuestStatus {
  if (!visible(q, p)) return "hidden";
  if (p.done[q.id]) return "done";
  // Main-story quests before the player's story marker are finished by definition.
  if (q.kind === "main") {
    const s = stepById(pack, q.stage);
    if (s && s.id === q.stage && pack.story.some((x) => x.id === q.stage)) {
      const cur = s.track === "dlc" ? pos.dlc : pos.base;
      if (s.order < cur) return "done";
    }
  }
  if (q.locksAt) {
    const lock = stepById(pack, q.locksAt);
    const cur = lock?.track === "dlc" ? pos.dlc : pos.base;
    if (lock && cur > lock.order) return "missed";
  }
  if (!reached(pack, pos, q.stage)) return "upcoming";
  for (const r of q.requires ?? []) if (!p.done[r]) return "upcoming";
  return "available";
}

/** Quests that close at the next one or two story steps and aren't done yet. */
export function missableSoon(pack: Pack, pos: Position, p: Profile, lookahead = 2): Quest[] {
  return pack.quests.filter((q) => {
    if (!q.locksAt || p.done[q.id] || !visible(q, p)) return false;
    const lock = stepById(pack, q.locksAt);
    if (!lock) return false;
    const cur = lock.track === "dlc" ? pos.dlc : pos.base;
    return lock.order >= cur && lock.order - cur <= lookahead && reached(pack, pos, q.stage);
  });
}

function questLevel(pack: Pack, q: Quest): number {
  return q.level ?? stepById(pack, q.stage)?.level ?? 1;
}

/** Available quests sorted by how well they fit the player's level (closest first, missable first). */
export function recommended(pack: Pack, pos: Position, p: Profile, limit = 6): Quest[] {
  return pack.quests
    .filter((q) => q.kind === "side" && questStatus(pack, pos, p, q) === "available")
    .map((q) => ({ q, score: Math.abs(questLevel(pack, q) - p.level) - (q.missable ? 8 : 0) - (q.timed ? 4 : 0) }))
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((x) => x.q);
}

/** The single most useful next thing to do: the current main quest, unless a missable is about to close. */
export function nextStep(pack: Pack, pos: Position, p: Profile): { quest?: Quest; reason: string } {
  const soon = missableSoon(pack, pos, p, 1);
  if (soon.length) return { quest: soon[0], reason: "Closes soon if you push the story on" };
  const main = pack.quests.find((q) => q.kind === "main" && !q.dlc && q.stage === p.base && !p.done[q.id]);
  if (main) return { quest: main, reason: "Your current main quest" };
  const rec = recommended(pack, pos, p, 1)[0];
  if (rec) return { quest: rec, reason: "Good fit for your level" };
  return { reason: "Move your story marker forward when you start the next main quest" };
}

/** When a main quest is marked done, move the story marker to the next step on that track. */
export function advanceAfter(pack: Pack, p: Profile, q: Quest): Profile {
  if (q.kind !== "main") return p;
  const s = stepById(pack, q.stage);
  if (!s) return p;
  const next = pack.story.find((x) => x.track === s.track && x.order === s.order + 1);
  if (!next) return p;
  if (s.track === "base" && p.base === s.id) return { ...p, base: next.id };
  if (s.track === "dlc" && p.dlcStep === s.id) return { ...p, dlcStep: next.id };
  return p;
}

export function percentDone(pack: Pack, p: Profile): number {
  const list = pack.quests.filter((q) => visible(q, p));
  if (!list.length) return 0;
  return Math.round((list.filter((q) => p.done[q.id]).length / list.length) * 100);
}
