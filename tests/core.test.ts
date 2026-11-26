import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Pack } from "../src/core/types";
import { validatePack, compareVersions } from "../src/core/validate";
import { newProfile, encodeSync, decodeSync } from "../src/core/progress";
import { position, questStatus, missableSoon, nextStep, advanceAfter, recommended, nameAllowed } from "../src/core/logic";
import { buildIndex, ask } from "../src/core/search";
import { parseBinaryKV, unlockedAchievements, normName } from "../src/core/steam";

let pack: Pack;
beforeAll(() => {
  execSync("npx tsx scripts/build-pack.ts", { stdio: "ignore" });
  pack = JSON.parse(readFileSync("public/packs/dd2/pack.json", "utf8"));
});

describe("pack", () => {
  it("passes its checks", () => {
    expect(validatePack(pack).errors).toEqual([]);
  });
  it("tags every Dark Arisen story quest as DLC", () => {
    const dlcMain = pack.quests.filter((q) => q.stage.startsWith("d"));
    expect(dlcMain.length).toBeGreaterThan(9);
    expect(dlcMain.every((q) => q.dlc)).toBe(true);
  });
  it("flags banned phrases", () => {
    expect(validatePack(pack, [pack.quests[0].premise]).errors.length).toBe(1);
  });
  it("has a walkthrough for every main quest", () => {
    expect(pack.quests.filter((q) => q.kind === "main" && !q.steps?.length).map((q) => q.id)).toEqual([]);
  });
  it("links quests to an online map page", () => {
    expect(pack.mapUrl).toMatch(/^https:/);
    expect(pack.quests.filter((q) => q.guideUrl).length).toBeGreaterThan(100);
  });
  it("compares versions numerically", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBe(1);
    expect(compareVersions("2026.11.15.1", "2026.11.15.1")).toBe(0);
  });
});

describe("progress logic", () => {
  it("hides DLC quests unless the player owns it", () => {
    const p = newProfile("t");
    const pos = position(pack, p);
    const q = pack.quests.find((x) => x.dlc)!;
    expect(questStatus(pack, pos, p, q)).toBe("hidden");
    expect(questStatus(pack, position(pack, { ...p, ownsDlc: true }), { ...p, ownsDlc: true }, q)).not.toBe("hidden");
  });
  it("marks missable quests as missed after their lock point", () => {
    const p = { ...newProfile("t"), base: "m11" };
    const q = pack.quests.find((x) => x.id === "readvent-of-calamity")!;
    expect(questStatus(pack, position(pack, p), p, q)).toBe("missed");
  });
  it("warns about quests that close soon", () => {
    const p = { ...newProfile("t"), base: "m09" };
    expect(missableSoon(pack, position(pack, p), p).map((q) => q.id)).toContain("readvent-of-calamity");
    expect(nextStep(pack, position(pack, p), p).quest).toBeDefined();
  });
  it("moves the story marker when a main quest is done", () => {
    const p = { ...newProfile("t"), base: "m04" };
    const q = pack.quests.find((x) => x.id === "seat-of-the-sovran")!;
    expect(advanceAfter(pack, p, q).base).toBe("m05");
  });
  it("recommends available side quests", () => {
    const p = { ...newProfile("t"), base: "m04", level: 10 };
    const r = recommended(pack, position(pack, p), p);
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((q) => q.kind === "side")).toBe(true);
  });
  it("treats main quests before the story marker as done", () => {
    const p = { ...newProfile("t"), base: "m08" };
    const q = pack.quests.find((x) => x.id === "seat-of-the-sovran")!;
    expect(questStatus(pack, position(pack, p), p, q)).toBe("done");
  });
  it("hides later-story names at the default spoiler level", () => {
    const p = newProfile("t");
    const legacy = pack.quests.find((x) => x.id === "legacy")!;
    expect(nameAllowed(pack, position(pack, p), p, legacy)).toBe(false);
    expect(nameAllowed(pack, position(pack, p), { ...p, spoiler: 2 }, legacy)).toBe(true);
  });
  it("gives late-game items a late stage", () => {
    expect(pack.items.find((i) => i.name === "Dragon's Dogma")!.stage).toBe("m15");
    expect(pack.items.find((i) => i.name === "Trusty Sword")!.stage).toBe("m03");
  });
  it("round-trips a phone sync code", () => {
    const p = { ...newProfile("Rob's run"), base: "m07", ownsDlc: true, level: 22, done: { "spellbound": true as const } };
    const lists = { quests: pack.quests.map((q) => q.id), items: pack.items.map((i) => i.id), achievements: pack.achievements.map((a) => a.id) };
    const code = encodeSync(p, lists, pack.version);
    const back = decodeSync(code, lists);
    expect(back.base).toBe("m07");
    expect(back.name).toBe("Rob's run");
    expect(back.done).toEqual({ spellbound: true });
    expect(code.length).toBeLessThan(400);
  });
});

describe("search", () => {
  it("answers where-to-get questions with items", () => {
    const ms = buildIndex(pack);
    const r = ask(ms, "where do I get the Lifetaker?");
    expect(r.intent).toBe("item");
    expect(r.hits[0].name).toBe("Lifetaker");
  });
  it("finds error fixes", () => {
    const r = ask(buildIndex(pack), "fatal d3d crash");
    expect(r.hits[0].kind).toBe("tip");
  });
});

// ---- tiny binary KeyValues writer for the Steam parser test
function kv(obj: Record<string, unknown>): number[] {
  const out: number[] = [];
  const str = (s: string) => { out.push(...new TextEncoder().encode(s), 0); };
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "object") { out.push(0); str(k); out.push(...kv(v as Record<string, unknown>)); }
    else if (typeof v === "number") { out.push(2); str(k); const b = new DataView(new ArrayBuffer(4)); b.setInt32(0, v, true); out.push(...new Uint8Array(b.buffer)); }
    else { out.push(1); str(k); str(String(v)); }
  }
  out.push(8);
  return out;
}

describe("steam sync", () => {
  const schema = new Uint8Array(kv({ "2054970": { stats: { "1": { type: "4", bits: {
    "0": { name: "ACH_01", display: { name: { english: "First Taste of Freedom" } } },
    "1": { name: "ACH_02", display: { name: { english: "Seat of the Proxy" } } },
    "2": { name: "ACH_03", display: { name: { english: "Dragon’s Dogma 2" } } },
  } } } } }));
  const user = new Uint8Array(kv({ cache: { crc: 1, "1": { data: 0b101 } } }));
  it("parses binary KeyValues", () => {
    const o = parseBinaryKV(schema) as any;
    expect(o["2054970"].stats["1"].bits["1"].name).toBe("ACH_02");
  });
  it("reads unlocked achievements from the bits", () => {
    expect(unlockedAchievements(schema, user)).toEqual(["First Taste of Freedom", "Dragon’s Dogma 2"]);
  });
  it("matches names despite curly quotes", () => {
    expect(normName("Dragon’s Dogma 2")).toBe(normName("Dragon's Dogma 2"));
  });
});

describe("look and feel", () => {
  it("fills in defaults and ignores unknown choices", async () => {
    const { resolveLook, DEFAULT_LOOK } = await import("../src/ui/look");
    expect(resolveLook(undefined)).toEqual(DEFAULT_LOOK);
    expect(resolveLook({ look: "holo", color: "#7fd4ff" })).toEqual({ ...DEFAULT_LOOK, look: "holo", color: "#7fd4ff" });
    expect(resolveLook({ look: "nope" as never, menu: "dock" })).toEqual({ ...DEFAULT_LOOK, menu: "dock" });
  });
});
