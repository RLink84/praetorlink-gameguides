import { useState } from "react";
import { useApp } from "../ui/state";
import { Page, Tag } from "../ui/components";
import { ask, type Hit } from "../core/search";
import { reached } from "../core/logic";

const KIND_LABEL: Record<Hit["kind"], string> = { quest: "Quest", item: "Item", area: "Place", tip: "Tip", achievement: "Achievement", choice: "Choice" };
const route = (h: Hit) => {
  switch (h.kind) {
    case "quest": return `quest/${h.id}`;
    case "item": return `item/${h.id}`;
    case "area": return `area/${h.id}`;
    case "achievement": return "checklist";
    case "choice": return "choices";
    default: return h.id.startsWith("error") ? "fixit" : h.id.startsWith("leveling") ? "leveling" : "secrets";
  }
};

export function AskBox({ compact }: { compact?: boolean }) {
  const { index, go, profile, pack, pos } = useApp();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const run = (text: string) => {
    if (!text.trim()) return setHits(null);
    const r = ask(index, text);
    setHits(r.hits.filter((h) => !h.dlc || profile.ownsDlc));
  };
  return (
    <div className={compact ? "card ask compact" : "ask"}>
      <form onSubmit={(e) => { e.preventDefault(); run(q); }} role="search">
        <input type="search" value={q} onChange={(e) => { setQ(e.target.value); run(e.target.value); }}
          placeholder="Ask the guide: where do I get a Ferrystone?" aria-label="Ask the guide" id={compact ? undefined : "ask-input"} />
      </form>
      {hits && (
        <ul className="list">
          {hits.length === 0 && <li className="muted">No match. Try fewer words, like a name or a place.</li>}
          {hits.map((h) => {
            const later = !reached(pack, pos, h.stage) && profile.spoiler < 2;
            return (
              <li key={`${h.kind}:${h.id}`}>
                <button className="row-btn" onClick={() => go(route(h))}>
                  <span className="row-title">{later && h.kind === "quest" ? "A later quest" : h.name}</span>
                  <span className="row-meta"><span className="tag">{KIND_LABEL[h.kind]}</span>{h.dlc && <Tag kind="dlc" />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Ask() {
  return (
    <Page title="Ask the guide">
      <p className="muted">Works offline. Ask plain questions like “how do I start Spellbound”, “where to buy Lifetaker” or “fatal D3D crash”.</p>
      <AskBox />
    </Page>
  );
}
