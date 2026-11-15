import { useState, type ReactNode } from "react";
import type { Base, Reward, Alignment } from "../core/types";
import { detailAllowed } from "../core/logic";
import { useApp } from "./state";

/** Shows children only when the spoiler setting allows `level`; otherwise a tap-to-reveal button. */
export function Reveal({ entry, level, label, children }: { entry: Base; level: number; label?: string; children: ReactNode }) {
  const { pack, pos, profile } = useApp();
  const [open, setOpen] = useState(false);
  const allowed = detailAllowed(pack, pos, profile, entry);
  if (open || level <= allowed) return <>{children}</>;
  const what = label ?? (level >= 3 ? "outcomes" : level === 2 ? "steps and rewards" : "details");
  return (
    <button className="reveal" onClick={() => setOpen(true)} aria-label={`Show ${what} (spoiler)`}>
      <span aria-hidden>👁</span> Tap to show {what}
    </button>
  );
}

const ALIGN: Record<Alignment, { sym: string; text: string }> = {
  good: { sym: "▲", text: "Kind" },
  evil: { sym: "▼", text: "Ruthless" },
  neutral: { sym: "●", text: "Neutral" },
};

export function Tag({ kind, children }: { kind: "dlc" | "missable" | "timed" | "done" | "missed" | "upcoming" | "available" | Alignment | "info"; children?: ReactNode }) {
  const label: Record<string, string> = {
    dlc: "DLC", missable: "⚠ Missable", timed: "⏱ Timed", done: "✓ Done", missed: "✕ Missed", upcoming: "◷ Later", available: "◆ Open",
  };
  if (kind === "good" || kind === "evil" || kind === "neutral")
    return <span className={`tag tag-${kind}`}><span aria-hidden>{ALIGN[kind].sym}</span> {ALIGN[kind].text}</span>;
  return <span className={`tag tag-${kind}`}>{children ?? label[kind]}</span>;
}

export function Rewards({ list }: { list?: Reward[] }) {
  if (!list?.length) return null;
  return (
    <ul className="rewards">
      {list.map((r, i) => (
        <li key={i}>
          {r.outcome && <strong>{r.outcome}: </strong>}
          {[r.xp != null && `${r.xp.toLocaleString()} XP`, r.gold != null && `${r.gold.toLocaleString()} gold`, ...(r.items ?? []), ...(r.unlocks ?? []).map((u) => `unlocks ${u}`), (r as { note?: string }).note]
            .filter(Boolean).join(", ")}
        </li>
      ))}
    </ul>
  );
}

/** Read-aloud button using the device's built-in voice (offline on most devices). */
export function Speak({ text }: { text: string }) {
  const { settings } = useApp();
  if (typeof speechSynthesis === "undefined") return null;
  return (
    <button className="icon-btn" title="Read aloud" aria-label="Read aloud" onClick={() => {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = settings.voiceRate;
      speechSynthesis.speak(u);
    }}>🔊</button>
  );
}

export function Page({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="page">
      <header className="page-head">
        <h1>{title}</h1>
        <div className="actions">{actions}</div>
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}

// ---- Tester mode: confirm / flag / note per entry, kept on this device and exported as JSON.
export type TesterNote = { key: string; name: string; verdict: "ok" | "wrong"; note: string; at: string; pack: string };
const TKEY = "plgg.tester.notes";
export const testerNotes = (): TesterNote[] => { try { return JSON.parse(localStorage.getItem(TKEY) || "[]"); } catch { return []; } };
const saveNote = (n: TesterNote) => {
  const list = testerNotes().filter((x) => x.key !== n.key);
  localStorage.setItem(TKEY, JSON.stringify([...list, n]));
};
export const clearTesterNotes = () => localStorage.removeItem(TKEY);

export function TesterBar({ kind, entry }: { kind: string; entry: Base }) {
  const { settings, pack, toast } = useApp();
  const [note, setNote] = useState("");
  if (!settings.tester) return null;
  const key = `${kind}:${entry.id}`;
  const existing = testerNotes().find((n) => n.key === key);
  const save = (verdict: "ok" | "wrong") => {
    saveNote({ key, name: entry.name, verdict, note, at: new Date().toISOString(), pack: pack.version });
    toast(verdict === "ok" ? "Marked as correct" : "Flagged for fixing");
  };
  return (
    <div className="tester">
      <strong>Tester</strong>
      {existing && <span className="muted"> last: {existing.verdict === "ok" ? "correct" : "flagged"}</span>}
      <textarea placeholder="What's wrong or missing? Where exactly? (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="row">
        <button onClick={() => save("ok")}>✓ Looks right</button>
        <button onClick={() => save("wrong")}>⚑ Something's wrong</button>
      </div>
    </div>
  );
}
