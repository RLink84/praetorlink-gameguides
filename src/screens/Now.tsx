import { useEffect, useState } from "react";
import { useApp } from "../ui/state";
import { Page, Tag } from "../ui/components";
import { missableSoon, nextStep, recommended, percentDone, stepById } from "../core/logic";
import type { Quest } from "../core/types";
import { AskBox } from "./Ask";

export function QuestRow({ q }: { q: Quest }) {
  const { go } = useApp();
  return (
    <button className="row-btn" onClick={() => go(`quest/${q.id}`)}>
      <span className="row-title">{q.name}</span>
      <span className="row-meta">
        {q.area && <span className="muted">{q.area}</span>}
        {q.dlc && <Tag kind="dlc" />}
        {q.missable && <Tag kind="missable" />}
        {q.timed && <Tag kind="timed" />}
      </span>
    </button>
  );
}

export function StoryPicker() {
  const { pack, profile, setProfile } = useApp();
  const base = pack.story.filter((s) => s.track === "base");
  const dlc = pack.story.filter((s) => s.track === "dlc");
  return (
    <div className="story-picker">
      <label>
        Main story: I'm on
        <select value={profile.base} onChange={(e) => setProfile((p) => ({ ...p, base: e.target.value }))}>
          {base.map((s) => <option key={s.id} value={s.id}>{s.order + 1 <= 16 ? `${s.order + 1}. ` : ""}{s.name}</option>)}
        </select>
      </label>
      {profile.ownsDlc && (
        <label>
          Dark Arisen: I'm on
          <select value={profile.dlcStep} onChange={(e) => setProfile((p) => ({ ...p, dlcStep: e.target.value }))}>
            {dlc.map((s) => <option key={s.id} value={s.id}>{s.order + 1}. {s.name}</option>)}
          </select>
        </label>
      )}
      <label>
        My level
        <input type="number" min={1} max={300} value={profile.level}
          onChange={(e) => setProfile((p) => ({ ...p, level: Math.max(1, Math.min(300, Number(e.target.value) || 1)) }))} />
      </label>
    </div>
  );
}

function Timers() {
  const { profile, setProfile } = useApp();
  const [now, setNow] = useState(Date.now());
  const [label, setLabel] = useState("");
  const [mins, setMins] = useState(30);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const add = () => {
    if (!label.trim()) return;
    if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    setProfile((p) => ({ ...p, timers: [...p.timers, { id: Math.random().toString(36).slice(2), label: label.trim(), endsAt: Date.now() + mins * 60_000 }] }));
    setLabel("");
  };
  return (
    <div className="card">
      <h2>Reminders</h2>
      <p className="muted small">Real-world timers, handy for timed quests or respawns. Time in the game runs faster than real time, and resting skips ahead, so pick a cautious time.</p>
      {profile.timers.map((t) => {
        const left = Math.max(0, Math.round((t.endsAt - now) / 60_000));
        return (
          <div key={t.id} className="timer">
            <span>{t.label}</span>
            <span className={left === 0 ? "due" : "muted"}>{left === 0 ? "Due now" : `${left} min left`}</span>
            <button className="icon-btn" aria-label="Remove reminder" onClick={() => setProfile((p) => ({ ...p, timers: p.timers.filter((x) => x.id !== t.id) }))}>✕</button>
          </div>
        );
      })}
      <div className="row">
        <input placeholder="e.g. Check on Wilhelmina's evidence" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select value={mins} onChange={(e) => setMins(Number(e.target.value))} aria-label="Minutes">
          {[10, 20, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m} min</option>)}
        </select>
        <button onClick={add}>Add</button>
      </div>
    </div>
  );
}

function Welcome() {
  const { pack, profile, setProfile, setSettings } = useApp();
  return (
    <Page title="Welcome">
      <div className="card welcome">
        <h2>A free guide to follow along with {pack.title}</h2>
        <p>Tell us where you are and we'll keep spoilers out of the way. You can change all of this later in Settings.</p>
        <label className="check big">
          <input type="checkbox" checked={profile.ownsDlc} onChange={(e) => setProfile((p) => ({ ...p, ownsDlc: e.target.checked }))} />
          I own the Dark Arisen DLC
        </label>
        <StoryPicker />
        <p className="muted small">{pack.disclaimer}</p>
        <button className="done-btn on" onClick={() => setSettings((s) => ({ ...s, welcomed: true }))}>Start</button>
      </div>
    </Page>
  );
}

export function Now() {
  const { pack, pos, profile, go, settings } = useApp();
  const next = nextStep(pack, pos, profile);
  const soon = missableSoon(pack, pos, profile);
  const rec = recommended(pack, pos, profile);
  const step = stepById(pack, profile.base);
  const done = percentDone(pack, profile);
  if (!settings.welcomed) return <Welcome />;
  return (
    <Page title={`${pack.title}`} actions={<span className="muted small">{profile.name} · {done}% of quests done</span>}>
      {profile.last && profile.last.route !== "now" && (
        <button className="resume" onClick={() => go(profile.last!.route)}>↩ Pick up where you left off</button>
      )}
      <div className="card next">
        <div className="eyebrow">Next step</div>
        {next.quest ? (
          <>
            <h2><button className="link" onClick={() => go(`quest/${next.quest!.id}`)}>{next.quest.name}</button></h2>
            <p>{next.quest.premise}</p>
          </>
        ) : null}
        <p className="muted small">{next.reason}{step?.level ? ` · Suggested level for this part of the story: about ${step.level} (our estimate)` : ""}</p>
        {step?.note && <p className="note">{step.note}</p>}
      </div>
      <StoryPicker />
      {soon.length > 0 && (
        <div className="card warn">
          <h2>⚠ Closing soon</h2>
          <p className="small">These close if you push the main story on. Do the ones you want first.</p>
          {soon.map((q) => <QuestRow key={q.id} q={q} />)}
        </div>
      )}
      <AskBox compact />
      <div className="card">
        <h2>Good quests for level {profile.level}</h2>
        {rec.length ? rec.map((q) => <QuestRow key={q.id} q={q} />) : <p className="muted">Nothing open right now. Move your story marker when you start the next main quest.</p>}
        <button className="link" onClick={() => go("quests")}>All quests →</button>
      </div>
      <Timers />
    </Page>
  );
}
