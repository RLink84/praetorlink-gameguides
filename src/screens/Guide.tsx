import { useState } from "react";
import { useApp } from "../ui/state";
import { Page, Tag, Reveal, Speak, TesterBar, Empty } from "../ui/components";
import { visible, reached, nameAllowed } from "../core/logic";
import type { Tip } from "../core/types";
import { statLine } from "./Items";

function TipCard({ t }: { t: Tip }) {
  const text = [t.name, t.body, ...(t.steps ?? [])].join(". ");
  return (
    <div className="card">
      <h2>{t.name} {t.dlc && <Tag kind="dlc" />} {t.platform && <span className="tag">{t.platform}</span>} <Speak text={text} /></h2>
      {t.level && <p className="muted small">Levels {t.level[0]} to {t.level[1]} (rough guide)</p>}
      <Reveal entry={t} level={t.spoiler}>
        <p>{t.body}</p>
        {t.steps?.length ? <ol>{t.steps.map((s, i) => <li key={i}>{s}</li>)}</ol> : null}
      </Reveal>
      <TesterBar kind="tip" entry={t} />
    </div>
  );
}

function TipList({ topics, intro }: { topics: Tip["topic"][]; intro?: string }) {
  const { pack, profile } = useApp();
  const list = pack.tips.filter((t) => topics.includes(t.topic) && visible(t, profile));
  return (
    <>
      {intro && <p className="muted">{intro}</p>}
      {list.length ? list.map((t) => <TipCard key={t.id} t={t} />) : <Empty>Nothing here yet.</Empty>}
    </>
  );
}

export function Leveling() {
  return <Page title="Levelling up"><TipList topics={["leveling"]} intro="XP figures are per kill and come from player testing. Treat them as close, not exact." /></Page>;
}

export function FixIt() {
  return (
    <Page title="Fix it">
      <p className="muted">Common errors and what players say helps. These come from player reports, not Capcom, unless noted. Try one fix at a time.</p>
      <TipList topics={["error"]} />
    </Page>
  );
}

export function Secrets() {
  const [tab, setTab] = useState<"riddle" | "boss" | "secret" | "ending" | "general">("riddle");
  const tabs: [typeof tab, string][] = [["riddle", "Sphinx riddles"], ["boss", "Boss cards"], ["secret", "Secrets"], ["ending", "Endings"], ["general", "Good to know"]];
  return (
    <Page title="Secrets and bosses">
      <div className="chips">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "chip on" : "chip"} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === "ending" && <p className="note">Endings are the biggest spoilers in the game. Everything stays hidden until you tap.</p>}
      <TipList topics={[tab]} />
    </Page>
  );
}

export function World() {
  const { pack, profile, pos, go } = useApp();
  const regions = pack.areas.filter((a) => !a.parent && visible(a, profile));
  return (
    <Page title="World">
      <p className="muted">Places in our own words. Map coordinates will come from our own playthrough.</p>
      {regions.map((r) => {
        const kids = pack.areas.filter((a) => a.parent === r.id && visible(a, profile));
        const shown = nameAllowed(pack, pos, profile, r);
        return (
          <div key={r.id} className="card">
            <h2>{shown ? r.name : "A later region"} {r.dlc && <Tag kind="dlc" />}</h2>
            <Reveal entry={r} level={r.spoiler}><p>{r.summary}</p></Reveal>
            {kids.map((a) => (
              <button key={a.id} className="row-btn" onClick={() => go(`area/${a.id}`)}>
                <span className="row-title">{nameAllowed(pack, pos, profile, a) ? a.name : "A later place"}</span>
                <span className="row-meta muted">{a.quests?.length ? `${a.quests.length} quest${a.quests.length === 1 ? "" : "s"}` : ""}</span>
              </button>
            ))}
          </div>
        );
      })}
    </Page>
  );
}

export function AreaDetail({ id }: { id: string }) {
  const { pack, profile, pos, go } = useApp();
  const a = pack.areas.find((x) => x.id === id);
  if (!a || !visible(a, profile)) return <Page title="Not found"><Empty>That place isn't in this guide.</Empty></Page>;
  const items = pack.items.filter((i) => visible(i, profile) && i.sources.some((s) => s.text.includes(a.name))).slice(0, 60);
  return (
    <Page title={a.name} actions={<Speak text={`${a.name}. ${a.summary}`} />}>
      <div className="tags"><span className="tag">{a.region}</span>{a.dlc && <Tag kind="dlc" />}</div>
      <Reveal entry={a} level={a.spoiler}><p className="lead">{a.summary}</p></Reveal>
      {a.quests?.length ? (
        <div className="card"><h2>Quests here</h2>
          {a.quests.map((qid) => { const q = pack.quests.find((x) => x.id === qid); return q && visible(q, profile) ? <button key={qid} className="row-btn" onClick={() => go(`quest/${qid}`)}>{profile.done[qid] ? "✓ " : ""}{nameAllowed(pack, pos, profile, q) ? q.name : "A later quest"}</button> : null; })}
        </div>
      ) : null}
      {items.length > 0 && (
        <div className="card"><h2>Items found or sold here</h2>
          {items.map((i) => <button key={i.id} className="row-btn" onClick={() => go(`item/${i.id}`)}><span className="row-title">{i.name}</span><span className="row-meta muted">{i.type ?? i.category}</span></button>)}
        </div>
      )}
      <TesterBar kind="area" entry={a} />
    </Page>
  );
}

// Party helper: pick your vocation and your pawn's, see the gear that fits and a few pairing notes.
const PAIRING: Record<string, string> = {
  Fighter: "Front-line tank with a shield. Pairs well with a Mage pawn for healing and buffs.",
  Archer: "Picks off weak spots from range. Likes a Fighter or Warrior pawn to hold attention.",
  Mage: "Heals and enchants weapons. Keep a Fighter pawn close to protect you.",
  Thief: "Fast, climbs big monsters. A Mage pawn's weapon enchant adds elemental damage.",
  Warrior: "Huge hits, slow swings. A Mage or Archer pawn covers the gaps.",
  Sorcerer: "Big area spells that take time to cast. Bring a Fighter pawn to keep enemies off you.",
  "Mystic Spearhand": "Flexible melee with magic tricks. Works with almost any pawn.",
  "Magick Archer": "Homing magic arrows, can heal. A Fighter or Warrior pawn fits well.",
  Trickster: "Makes illusions to confuse enemies. Fill the party with damage-dealing pawns.",
  Warfarer: "Uses any weapon. Build pawns around what you're missing.",
};
export function Party() {
  const { pack, profile, pos, go } = useApp();
  const [mine, setMine] = useState("Fighter");
  const [pawn, setPawn] = useState("Mage");
  const VOCS = Object.keys(PAIRING);
  const gear = (v: string) => pack.items
    .filter((i) => visible(i, profile) && (i.category === "weapon" || i.category === "shield") && i.vocations?.includes(v) && v !== "Warfarer" && reached(pack, pos, i.stage))
    .sort((a, b) => Object.values(b.stats ?? {}).reduce((x, y) => x + y, 0) - Object.values(a.stats ?? {}).reduce((x, y) => x + y, 0))
    .slice(0, 8);
  return (
    <Page title="Party helper">
      <div className="row">
        <label>Me <select value={mine} onChange={(e) => setMine(e.target.value)}>{VOCS.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Main pawn <select value={pawn} onChange={(e) => setPawn(e.target.value)}>{VOCS.filter((v) => v !== "Warfarer").map((v) => <option key={v}>{v}</option>)}</select></label>
      </div>
      {[mine, pawn].map((v, k) => (
        <div className="card" key={k}>
          <h2>{k === 0 ? "You" : "Your pawn"}: {v}</h2>
          <p>{PAIRING[v]}</p>
          <h3>Strongest weapons we list</h3>
          {gear(v).length ? gear(v).map((i) => <button key={i.id} className="row-btn" onClick={() => go(`item/${i.id}`)}><span className="row-title">{i.name}</span><span className="row-meta muted">{statLine(i)}</span></button>)
            : <p className="muted">Warfarer can use any weapon. Pick another vocation to see gear.</p>}
        </div>
      ))}
      <p className="muted small">A balanced party usually has someone to hold attention, someone to heal, and someone dealing damage from range.</p>
    </Page>
  );
}
