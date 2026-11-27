import { useState } from "react";
import { useApp } from "../ui/state";
import { Page, Tag, Reveal, Rewards, Speak, TesterBar, Empty } from "../ui/components";
import { questStatus, advanceAfter, stepById, visible, nameAllowed, detailAllowed, type QuestStatus } from "../core/logic";
import type { Choice, WalkVideo } from "../core/types";
import { QuestMedia, VideoWalk } from "./QuestMedia";

type Filter = "open" | "all" | "main" | "side" | "dlc" | "missable" | "done";

export function Quests() {
  const { pack, pos, profile, go } = useApp();
  const [f, setF] = useState<Filter>("open");
  const list = pack.quests
    .map((q) => ({ q, s: questStatus(pack, pos, profile, q) }))
    .filter(({ q, s }) => s !== "hidden" && (
      f === "all" || (f === "open" && s === "available") || (f === "main" && q.kind === "main") || (f === "side" && q.kind === "side") ||
      (f === "dlc" && q.dlc) || (f === "missable" && (q.missable || q.timed) && s !== "done") || (f === "done" && s === "done")));
  const order: Record<QuestStatus, number> = { available: 0, upcoming: 1, done: 2, missed: 3, hidden: 4 };
  list.sort((a, b) => order[a.s] - order[b.s]);
  const filters: [Filter, string][] = [["open", "Open now"], ["main", "Main"], ["side", "Side"], ["missable", "Missable"], ["done", "Done"], ["all", "All"]];
  if (profile.ownsDlc) filters.splice(3, 0, ["dlc", "DLC"]);
  return (
    <Page title="Quests">
      <div className="chips" role="tablist">
        {filters.map(([k, l]) => <button key={k} role="tab" aria-selected={f === k} className={f === k ? "chip on" : "chip"} onClick={() => setF(k)}>{l}</button>)}
      </div>
      {list.length === 0 && <Empty>No quests here yet. If you've moved on in the story, update your position on the Now screen.</Empty>}
      <ul className="list">
        {list.map(({ q, s }) => {
          const showName = nameAllowed(pack, pos, profile, q);
          return (
            <li key={q.id}>
              <button className="row-btn" onClick={() => go(`quest/${q.id}`)}>
                <span className="row-title">{showName ? q.name : "Later quest"}</span>
                <span className="row-meta">
                  <Tag kind={s === "available" ? "available" : s === "done" ? "done" : s === "missed" ? "missed" : "upcoming"} />
                  {q.kind === "main" && <span className="tag">Main</span>}
                  {q.dlc && <Tag kind="dlc" />}
                  {q.missable && <Tag kind="missable" />}
                  {q.timed && <Tag kind="timed" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

export function ChoiceCard({ c }: { c: Choice }) {
  const { profile, setProfile } = useApp();
  return (
    <div className="choice">
      <div className="choice-prompt">{c.prompt}</div>
      <Reveal entry={c} level={3} label="choices and what they lead to">
        <ol className="options">
          {c.options.map((o, i) => (
            <li key={i} className={profile.picked[c.id] === i ? "picked" : ""}>
              <div><strong>{o.label}</strong> {o.alignment && <Tag kind={o.alignment} />}</div>
              <div>{o.result}</div>
              <button className="link small" onClick={() => setProfile((p) => ({ ...p, picked: { ...p.picked, [c.id]: i } }))}>
                {profile.picked[c.id] === i ? "✓ I picked this" : "I picked this"}
              </button>
            </li>
          ))}
        </ol>
        {c.advice && <p className="note">💡 {c.advice}</p>}
      </Reveal>
    </div>
  );
}

function Walkthrough({ steps, name, video }: { steps: string[]; name: string; video?: WalkVideo }) {
  const [stage, setStage] = useState<"closed" | "warn" | "open">("closed");
  return (
    <div className="card walkthrough">
      <h2>Full walkthrough</h2>
      {stage === "closed" && <button className="walk-btn" onClick={() => setStage("warn")}>📖 Show the full walkthrough</button>}
      {stage === "warn" && (
        <div className="note">
          <p><strong>⚠ Spoiler alert.</strong> This goes through {name} step by step{video ? ", with a video," : ""} including who you meet, what happens and how it can end.</p>
          <div className="row"><button className="done-btn on" onClick={() => setStage("open")}>Show it</button><button onClick={() => setStage("closed")}>Not now</button></div>
        </div>
      )}
      {stage === "open" && (
        <>
          {video && <VideoWalk video={video} />}
          <ol className="steps">{steps.map((t, i) => <li key={i}>{t}</li>)}</ol>
          <button className="link small" onClick={() => setStage("closed")}>Hide walkthrough</button>
        </>
      )}
    </div>
  );
}

export function QuestDetail({ id }: { id: string }) {
  const { pack, pos, profile, setProfile, go, toast } = useApp();
  const q = pack.quests.find((x) => x.id === id);
  if (!q || !visible(q, profile)) return <Page title="Not found"><Empty>That quest isn't in this guide.</Empty></Page>;
  const s = questStatus(pack, pos, profile, q);
  const choices = pack.choices.filter((c) => c.quest === q.id);
  const lock = q.locksAt ? stepById(pack, q.locksAt) : undefined;
  const opens = stepById(pack, q.stage);
  const toggle = () => {
    const marking = !profile.done[q.id];
    const moved = marking && advanceAfter(pack, profile, q) !== profile;
    setProfile((p) => {
      const done = { ...p.done };
      if (done[q.id]) delete done[q.id];
      else done[q.id] = true;
      const next = { ...p, done };
      return done[q.id] ? advanceAfter(pack, next, q) : next;
    });
    if (moved) toast("Done. Story marker moved on.");
  };
  const allowed = detailAllowed(pack, pos, profile, q);
  const title = nameAllowed(pack, pos, profile, q) ? q.name : "A later quest";
  const speakText = [title, allowed >= 1 && q.premise, allowed >= 1 && q.unlock && `How to start: ${q.unlock}`, ...(allowed >= 2 ? q.tips ?? [] : [])].filter(Boolean).join(". ");
  return (
    <Page title={title} actions={<><Speak text={speakText} /><button className={profile.done[q.id] ? "done-btn on" : "done-btn"} onClick={toggle}>{profile.done[q.id] ? "✓ Done" : "Mark done"}</button></>}>
      <div className="tags">
        <span className="tag">{q.kind === "main" ? "Main quest" : "Side quest"}</span>
        {q.dlc && <Tag kind="dlc">DLC · Dark Arisen</Tag>}
        {q.missable && <Tag kind="missable" />}
        {q.timed && <Tag kind="timed" />}
        <Tag kind={s === "available" ? "available" : s === "done" ? "done" : s === "missed" ? "missed" : "upcoming"} />
      </div>
      <Reveal entry={q} level={1} label="what this quest is about">
        <p className="lead">{q.premise}</p>
        <dl className="facts">
          {q.area && <><dt>Where</dt><dd>{q.area}</dd></>}
          {q.giver && <><dt>Who</dt><dd>{q.giver}</dd></>}
          {q.unlock && <><dt>How to start</dt><dd>{q.unlock}</dd></>}
          {opens && <><dt>Opens</dt><dd>{opens.track === "dlc" ? "Dark Arisen: " : ""}{opens.name}</dd></>}
          {lock && <><dt>Closes</dt><dd>When {lock.name} starts</dd></>}
          {q.level && <><dt>Level</dt><dd>About {q.level} (our estimate)</dd></>}
          {q.achievement && <><dt>Achievement</dt><dd>{q.achievement}</dd></>}
        </dl>
      </Reveal>
      {q.timed && q.failure && (
        <div className="card warn"><strong>⏱ Timed.</strong> <Reveal entry={q} level={2} label="what happens if you're late">{q.failure}</Reveal></div>
      )}
      {q.tips?.length ? (
        <div className="card"><h2>Tips</h2><Reveal entry={q} level={2} label="tips"><ul>{q.tips.map((t, i) => <li key={i}>{t}</li>)}</ul></Reveal></div>
      ) : null}
      {q.rewards?.length ? (
        <div className="card"><h2>Rewards</h2><Reveal entry={q} level={2} label="rewards"><Rewards list={q.rewards} outcomes={allowed >= 3} /></Reveal></div>
      ) : null}
      {choices.length > 0 && (
        <div className="card"><h2>Choices</h2>{choices.map((c) => <ChoiceCard key={c.id} c={c} />)}</div>
      )}
      {q.steps?.length ? (
        <Walkthrough steps={q.steps} video={q.walkVideo} name={nameAllowed(pack, pos, profile, q) ? q.name : "this quest"} />
      ) : <div className="card walkthrough"><h2>Full walkthrough</h2><p className="muted small">Coming soon for this quest.</p></div>}
      <QuestMedia quest={q} />
      {q.related?.length ? (
        <div className="card"><h2>Linked quests</h2>
          {q.related.map((r) => { const o = pack.quests.find((x) => x.id === r); return o && visible(o, profile) ? <button key={r} className="row-btn" onClick={() => go(`quest/${r}`)}>{nameAllowed(pack, pos, profile, o) ? o.name : "A later quest"}</button> : null; })}
        </div>
      ) : null}
      <TesterBar kind="quest" entry={q} />
    </Page>
  );
}

export function Choices() {
  const { pack, profile, pos, go } = useApp();
  const list = pack.choices.filter((c) => visible(c, profile) && nameAllowed(pack, pos, profile, c));
  return (
    <Page title="Choices">
      <p className="muted">Every decision we know about. Outcomes stay hidden until you tap. Tags show our own read: ▲ kind, ▼ ruthless, ● neutral.</p>
      {list.map((c) => {
        const q = pack.quests.find((x) => x.id === c.quest);
        return (
          <div key={c.id} className="card">
            <h2><button className="link" onClick={() => go(`quest/${c.quest}`)}>{q?.name}</button> {c.dlc && <Tag kind="dlc" />}</h2>
            <ChoiceCard c={c} />
          </div>
        );
      })}
    </Page>
  );
}
