import { useState } from "react";
import { useApp } from "../ui/state";
import { Page, Tag, Reveal } from "../ui/components";
import { isTauri, syncFromSteam, normName } from "../core/steam";

const TRACKERS: { id: string; name: string; max: number; dlc?: boolean; note: string }[] = [
  { id: "seekers", name: "Seeker's Tokens", max: 240, note: "Turn them in at any Vocation Guild. Milestones are listed below." },
  { id: "riddles", name: "Sphinx riddles solved", max: 10, note: "See Secrets → Sphinx riddles." },
  { id: "maisters", name: "Maister teachings learned", max: 10, note: "One per vocation." },
  { id: "beetles", name: "Golden Trove Beetles", max: 999, note: "Found on trees around the world. Keep a running count." },
  { id: "obelisks", name: "Obelisks of Benediction", max: 9, dlc: true, note: "Norgan only. See Secrets." },
  { id: "lostrites", name: "Lost Rites dungeons cleared", max: 12, dlc: true, note: "Repeatable." },
];

export function Checklist() {
  const { pack, profile, setProfile, settings, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const achs = pack.achievements.filter((a) => !a.dlc || profile.ownsDlc);
  const got = achs.filter((a) => profile.achieved[a.id]).length;
  const milestones = pack.items
    .flatMap((i) => i.sources.filter((s) => s.kind === "tokens").map((s) => ({ n: Number(/(\d+)/.exec(s.text)?.[1] ?? 0), item: i.name })))
    .filter((m) => m.n > 0).sort((a, b) => a.n - b.n);
  const seekers = profile.counters.seekers ?? 0;

  const steam = async () => {
    setBusy(true);
    try {
      const { names } = await syncFromSteam(settings.steamPath);
      const want = new Set(names.map(normName));
      setProfile((p) => {
        const achieved = { ...p.achieved };
        const done = { ...p.done };
        let base = p.base;
        let dlcStep = p.dlcStep;
        const order = (id: string) => pack.story.find((s) => s.id === id)?.order ?? 0;
        for (const a of pack.achievements) {
          if (!want.has(normName(a.name))) continue;
          achieved[a.id] = true;
          for (const m of a.marks) {
            const step = pack.story.find((s) => s.id === m);
            // Story marks only ever move your position forward; quest marks mean the quest is finished.
            if (step?.track === "base" && step.order > order(base)) base = step.id;
            else if (step?.track === "dlc" && step.order > order(dlcStep)) dlcStep = step.id;
            else if (!step) done[m] = true;
          }
        }
        return { ...p, achieved, done, base, dlcStep };
      });
      toast(`Steam: ${names.length} achievements found on this PC`);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Checklist" actions={isTauri() ? <button disabled={busy} onClick={steam}>{busy ? "Reading…" : "⟳ Sync from Steam"}</button> : null}>
      {isTauri() && <p className="muted small">Steam sync reads the achievement files Steam keeps on this PC. It doesn't log in and sends nothing anywhere. Quests tied to an achievement are ticked off too.</p>}
      <div className="grid">
        {TRACKERS.filter((t) => !t.dlc || profile.ownsDlc).map((t) => {
          const v = profile.counters[t.id] ?? 0;
          const set = (n: number) => setProfile((p) => ({ ...p, counters: { ...p.counters, [t.id]: Math.max(0, Math.min(t.max, n)) } }));
          return (
            <div key={t.id} className="card tracker">
              <h2>{t.name} {t.dlc && <Tag kind="dlc" />}</h2>
              <div className="counter">
                <button aria-label={`Remove one ${t.name}`} onClick={() => set(v - 1)}>−</button>
                <input type="number" value={v} min={0} max={t.max} onChange={(e) => set(Number(e.target.value) || 0)} aria-label={t.name} />
                {t.max < 999 && <span className="muted">/ {t.max}</span>}
                <button aria-label={`Add one ${t.name}`} onClick={() => set(v + 1)}>+</button>
              </div>
              {t.max < 999 && <progress value={v} max={t.max} />}
              <p className="muted small">{t.note}</p>
            </div>
          );
        })}
      </div>
      {milestones.length > 0 && (
        <div className="card">
          <h2>Seeker's Token rewards</h2>
          <ul className="milestones">{milestones.map((m) => <li key={m.item} className={seekers >= m.n ? "done" : ""}>{seekers >= m.n ? "✓" : "○"} {m.n} tokens: {m.item}</li>)}</ul>
        </div>
      )}
      <div className="card">
        <h2>Achievements · {got}/{achs.length}</h2>
        <ul className="list">
          {achs.map((a) => (
            <li key={a.id} className="ach">
              <label className="check">
                <input type="checkbox" checked={!!profile.achieved[a.id]} onChange={() => setProfile((p) => {
                  const m = { ...p.achieved };
                  if (m[a.id]) delete m[a.id];
                  else m[a.id] = true;
                  return { ...p, achieved: m };
                })} />
                <span><strong>{a.name}</strong> {a.dlc && <Tag kind="dlc" />}<br />
                  <Reveal entry={{ ...a, stage: "m01" }} level={a.spoiler} label="how to get it"><span className="muted">{a.how}</span></Reveal>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </Page>
  );
}
