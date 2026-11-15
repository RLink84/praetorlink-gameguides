import { useMemo, useState } from "react";
import { useApp } from "../ui/state";
import { Page, Tag, Reveal, TesterBar, Empty, Speak } from "../ui/components";
import { visible } from "../core/logic";
import type { Item, ItemCategory } from "../core/types";

const CATS: [ItemCategory | "all", string][] = [
  ["all", "All"], ["weapon", "Weapons"], ["shield", "Shields"], ["head", "Head"], ["body", "Body"], ["legs", "Legs"],
  ["cloak", "Cloaks"], ["ring", "Rings"], ["key", "Key items"], ["tome", "Tomes"], ["consumable", "Consumables"],
  ["material", "Materials"], ["collectible", "Collectibles"],
];
const VOCS = ["Fighter", "Archer", "Mage", "Thief", "Warrior", "Sorcerer", "Mystic Spearhand", "Magick Archer", "Trickster", "Warfarer"];

export function statLine(i: Item) {
  if (!i.stats) return "";
  return Object.entries(i.stats).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v}`).join(" · ");
}

export function Items() {
  const { pack, profile, go, route } = useApp();
  const [cat, setCat] = useState<ItemCategory | "all">((route[1] as ItemCategory) || "weapon");
  const [voc, setVoc] = useState("");
  const [q, setQ] = useState("");
  const [onlyKnown, setOnlyKnown] = useState(false);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pack.items.filter((i) => visible(i, profile) && (cat === "all" || i.category === cat) && (!voc || i.vocations?.includes(voc)) &&
      (!needle || i.name.toLowerCase().includes(needle) || i.sources.some((s) => s.text.toLowerCase().includes(needle))) &&
      (!onlyKnown || i.sources.length > 0));
  }, [pack, profile, cat, voc, q, onlyKnown]);
  return (
    <Page title="Items and gear">
      <div className="chips">{CATS.map(([k, l]) => <button key={k} className={cat === k ? "chip on" : "chip"} onClick={() => setCat(k)}>{l}</button>)}</div>
      <div className="row filters">
        <input type="search" placeholder="Filter by name or place (e.g. Melve)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter items" />
        {(cat === "weapon" || cat === "shield" || cat === "all") && (
          <select value={voc} onChange={(e) => setVoc(e.target.value)} aria-label="Vocation">
            <option value="">Any vocation</option>
            {VOCS.map((v) => <option key={v}>{v}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={onlyKnown} onChange={(e) => setOnlyKnown(e.target.checked)} /> Only with known location</label>
      </div>
      <p className="muted small">{list.length} items</p>
      {list.length === 0 && <Empty>Nothing matches.</Empty>}
      <ul className="list">
        {list.slice(0, 400).map((i) => (
          <li key={i.id}>
            <button className="row-btn" onClick={() => go(`item/${i.id}`)}>
              <span className="row-title">{profile.owned[i.id] ? "✓ " : ""}{i.name}</span>
              <span className="row-meta">
                {i.type && <span className="muted">{i.type}</span>}
                {statLine(i) && <span className="muted">{statLine(i)}</span>}
                {i.dlc && <Tag kind="dlc" />}
                {profile.shopping[i.id] && <span className="tag">🛒</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Page>
  );
}

export function ItemDetail({ id }: { id: string }) {
  const { pack, profile, setProfile, go } = useApp();
  const i = pack.items.find((x) => x.id === id);
  if (!i || !visible(i, profile)) return <Page title="Not found"><Empty>That item isn't in this guide.</Empty></Page>;
  const usedIn = pack.quests.filter((q) => visible(q, profile) && (q.rewards ?? []).some((r) => (r.items ?? []).some((n) => n.toLowerCase().startsWith(i.name.toLowerCase()))));
  const flip = (k: "owned" | "shopping") => setProfile((p) => {
    const m = { ...p[k] };
    if (m[i.id]) delete m[i.id];
    else m[i.id] = true;
    return { ...p, [k]: m };
  });
  return (
    <Page title={i.name} actions={<>
      <Speak text={`${i.name}. ${i.sources.map((s) => s.text).join(" ")}`} />
      <button className={profile.shopping[i.id] ? "done-btn on" : "done-btn"} onClick={() => flip("shopping")}>{profile.shopping[i.id] ? "🛒 On list" : "Add to shopping list"}</button>
      <button className={profile.owned[i.id] ? "done-btn on" : "done-btn"} onClick={() => flip("owned")}>{profile.owned[i.id] ? "✓ Have it" : "I have it"}</button>
    </>}>
      <div className="tags">
        <span className="tag">{i.type ?? i.category}</span>
        {i.dlc && <Tag kind="dlc">DLC · Dark Arisen</Tag>}
        {i.vocations?.map((v) => <span key={v} className="tag">{v}</span>)}
      </div>
      {statLine(i) && <p className="lead">{statLine(i)} <span className="muted small">(base values)</span></p>}
      {i.note && <p className="note">{i.note}</p>}
      <div className="card">
        <h2>Where to get it</h2>
        <Reveal entry={i} level={1} label="where to get it">
          {i.sources.length ? (
            <ul className="sources">{i.sources.map((s, k) => <li key={k}><span className={`src src-${s.kind}`}>{s.kind}</span> {s.text}</li>)}</ul>
          ) : <p className="muted">We don't have a confirmed location yet. Found it? Use Tester mode to tell us.</p>}
        </Reveal>
      </div>
      {usedIn.length > 0 && (
        <div className="card"><h2>Quest reward from</h2>{usedIn.map((q) => <button key={q.id} className="row-btn" onClick={() => go(`quest/${q.id}`)}>{q.name}</button>)}</div>
      )}
      <TesterBar kind="item" entry={i} />
    </Page>
  );
}

export function Shopping() {
  const { pack, profile, go, setProfile } = useApp();
  const list = pack.items.filter((i) => profile.shopping[i.id]);
  // Group by first shop mentioned, so one trip covers several items.
  const groups = new Map<string, Item[]>();
  for (const i of list) {
    const shop = i.sources.find((s) => s.kind === "shop")?.text.replace(/^Sold by /, "").split(/,| or | for /)[0].replace(/\.$/, "") ?? "Found in the world";
    groups.set(shop, [...(groups.get(shop) ?? []), i]);
  }
  return (
    <Page title="Shopping list" actions={list.length ? <button onClick={() => setProfile((p) => ({ ...p, shopping: {} }))}>Clear</button> : null}>
      {list.length === 0 && <Empty>Add items from their page with “Add to shopping list”. They're grouped here by where to get them.</Empty>}
      {[...groups].map(([shop, items]) => (
        <div key={shop} className="card">
          <h2>{shop}</h2>
          {items.map((i) => <button key={i.id} className="row-btn" onClick={() => go(`item/${i.id}`)}><span className="row-title">{i.name}</span><span className="row-meta muted">{i.sources[0]?.text}</span></button>)}
        </div>
      ))}
    </Page>
  );
}
