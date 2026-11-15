// Pawn board: players post their main pawn so others can find and hire it. Needs the small pawn-board
// server (worker/). Until it's set up (VITE_PAWN_API), the screen shows community links instead.
import { useEffect, useState } from "react";
import { useApp } from "../ui/state";
import { Page, Empty } from "../ui/components";

const API = (import.meta.env.VITE_PAWN_API as string | undefined)?.replace(/\/$/, "");
const VOCS = ["Fighter", "Archer", "Mage", "Thief", "Warrior", "Sorcerer", "Mystic Spearhand", "Magick Archer", "Trickster"];
const PLATFORMS: [string, string][] = [["pc", "PC (Steam)"], ["playstation", "PlayStation"], ["xbox", "Xbox"]];
const MINE = "plgg.pawns.mine";

interface Pawn { id: string; pawnId: string; name: string; level: number; vocation: string; platform: string; specialization?: string; notes?: string; createdAt: number }
type Mine = { id: string; deleteCode: string; name: string }[];
const mine = (): Mine => { try { return JSON.parse(localStorage.getItem(MINE) || "[]"); } catch { return []; } };

function Post({ onDone }: { onDone: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState({ pawnId: "", name: "", level: 10, vocation: "Mage", platform: "pc", specialization: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: k === "level" ? Number(e.target.value) : e.target.value });
  const send = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/pawns`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, game: "dd2" }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't post");
      localStorage.setItem(MINE, JSON.stringify([...mine(), { id: j.id, deleteCode: j.deleteCode, name: f.name }]));
      toast("Pawn posted. It stays up for 60 days.");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card">
      <h2>Post my pawn</h2>
      <p className="muted small">Only what you type here is shared, and anyone can see it. No account needed. Don't include personal details.</p>
      <div className="row">
        <label>Pawn ID <input value={f.pawnId} onChange={set("pawnId")} maxLength={16} placeholder="From the Pawn Guild menu" /></label>
        <label>Pawn name <input value={f.name} onChange={set("name")} maxLength={24} /></label>
      </div>
      <div className="row">
        <label>Level <input type="number" min={1} max={300} value={f.level} onChange={set("level")} /></label>
        <label>Vocation <select value={f.vocation} onChange={set("vocation")}>{VOCS.map((v) => <option key={v}>{v}</option>)}</select></label>
        <label>Platform <select value={f.platform} onChange={set("platform")}>{PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <label>Specialization <input value={f.specialization} onChange={set("specialization")} maxLength={40} placeholder="e.g. Chirurgeon" /></label>
      <label>Gifts, rewards or notes <input value={f.notes} onChange={set("notes")} maxLength={160} placeholder="e.g. Comes back with Wakestone Shards, knows Sphinx riddles" /></label>
      <button className="done-btn on" disabled={busy} onClick={send}>{busy ? "Posting…" : "Post pawn"}</button>
    </div>
  );
}

export function Pawns() {
  const { toast } = useApp();
  const [platform, setPlatform] = useState("pc");
  const [voc, setVoc] = useState("");
  const [q, setQ] = useState("");
  const [list, setList] = useState<Pawn[] | null>(null);
  const [posting, setPosting] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    if (!API) return;
    setErr("");
    try {
      const u = new URL(`${API}/pawns`);
      u.searchParams.set("game", "dd2");
      u.searchParams.set("platform", platform);
      if (voc) u.searchParams.set("vocation", voc);
      if (q.trim()) u.searchParams.set("q", q.trim());
      const r = await fetch(u.toString());
      setList(((await r.json()) as { pawns: Pawn[] }).pawns);
    } catch {
      setErr("Couldn't reach the pawn board. Check your connection.");
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [platform, voc]);

  const report = async (id: string) => {
    await fetch(`${API}/pawns/${id}/report`, { method: "POST" });
    toast("Thanks. Posts with several reports are hidden.");
  };
  const remove = async (m: Mine[number]) => {
    await fetch(`${API}/pawns/${m.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deleteCode: m.deleteCode }) });
    localStorage.setItem(MINE, JSON.stringify(mine().filter((x) => x.id !== m.id)));
    toast("Your pawn was removed.");
    void load();
  };

  const community = (
    <p className="small">Other places to find pawns: <a href="https://www.reddit.com/r/DragonsDogma/search/?q=pawn%20id" target="_blank" rel="noreferrer">r/DragonsDogma pawn posts</a>, and the Pawn Guild search in the game, which takes a Pawn ID.</p>
  );

  if (!API) {
    return (
      <Page title="Pawn board">
        <div className="card">
          <h2>Coming soon</h2>
          <p>Soon you'll be able to post your main pawn here (ID, level, vocation, specialization and platform) and search for other players' pawns.</p>
          {community}
        </div>
      </Page>
    );
  }
  return (
    <Page title="Pawn board" actions={<button onClick={() => setPosting(!posting)}>{posting ? "Close" : "Post my pawn"}</button>}>
      {posting && <Post onDone={() => { setPosting(false); void load(); }} />}
      <div className="chips">{PLATFORMS.map(([k, l]) => <button key={k} className={platform === k ? "chip on" : "chip"} onClick={() => setPlatform(k)}>{l}</button>)}</div>
      <div className="row filters">
        <select value={voc} onChange={(e) => setVoc(e.target.value)} aria-label="Vocation"><option value="">Any vocation</option>{VOCS.map((v) => <option key={v}>{v}</option>)}</select>
        <input type="search" placeholder="Search names, specializations, notes or an ID" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} />
        <button onClick={load}>Search</button>
      </div>
      {err && <p className="muted">{err}</p>}
      {mine().length > 0 && (
        <div className="card"><h2>My posts</h2>{mine().map((m) => <div key={m.id} className="timer"><span>{m.name}</span><button className="danger" onClick={() => remove(m)}>Remove</button></div>)}</div>
      )}
      {list && list.length === 0 && <Empty>No pawns posted for this filter yet. Be the first!</Empty>}
      <div className="grid">
        {list?.map((p) => (
          <div key={p.id} className="card">
            <h2>{p.name} <span className="muted small">Lv {p.level}</span></h2>
            <div className="tags"><span className="tag">{p.vocation}</span>{p.specialization && <span className="tag">{p.specialization}</span>}</div>
            <p className="lead"><code>{p.pawnId}</code> <button className="link small" onClick={() => { void navigator.clipboard?.writeText(p.pawnId); toast("Pawn ID copied"); }}>Copy</button></p>
            {p.notes && <p className="small">{p.notes}</p>}
            <button className="link small muted" onClick={() => report(p.id)}>Report</button>
          </div>
        ))}
      </div>
      {community}
    </Page>
  );
}
