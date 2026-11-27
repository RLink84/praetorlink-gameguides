import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useApp } from "../ui/state";
import { Page, testerNotes, clearTesterNotes } from "../ui/components";
import { encodeSync, decodeSync, type Profile } from "../core/progress";
import { checkForPackUpdate, rollbackPack, APP_VERSION, UPDATE_BASE } from "../core/pack";
import { checkAppUpdate, setCompactWindow, type AppUpdate } from "../core/appUpdate";
import { isTauri } from "../core/steam";
import { exportShots, allShots } from "../core/shots";
import type { Spoiler } from "../core/types";
import { LOOK_CHOICES, resolveLook, type Look } from "../ui/look";

const SPOILERS: [Spoiler, string, string][] = [
  [0, "Names only", "Just quest and item names. Tap to see more."],
  [1, "Light (default)", "What a quest is about, where it starts and where items are."],
  [2, "Medium", "Also steps, tips and rewards."],
  [3, "Full", "Everything, including choice outcomes and endings."],
];

function LookCard() {
  const { settings, setSettings } = useApp();
  const look = resolveLook(settings.look);
  const set = (k: keyof Look, v: string) => setSettings((s) => ({ ...s, look: { ...resolveLook(s.look), [k]: v } }));
  return (
    <div className="card" id="lookcard">
      <div className="row look-head"><h2>Look and feel</h2>
        <button className="link small" onClick={() => setSettings((s) => ({ ...s, look: undefined }))}>Back to defaults</button></div>
      <p className="muted small">Changes show straight away and are saved on this device only.{settings.reduceMotion ? " Reduce motion is on, so nothing moves whatever you pick here." : ""}</p>
      <div className="lookgrid">
        {LOOK_CHOICES.map(([k, title, opts]) => {
          const cur = opts.find((o) => o[0] === look[k]);
          return (
            <div key={k} className="lookopt" role="group" aria-label={title}>
              <h3>{title}</h3>
              <div className="row">
                {opts.map(([v, label, hint]) => k === "color"
                  ? <button key={v} className={look[k] === v ? "swatch on" : "swatch"} style={{ background: v }} title={label} aria-label={label} aria-pressed={look[k] === v} onClick={() => set(k, v)} />
                  : <button key={v} className={look[k] === v ? "chip on" : "chip"} title={hint} aria-pressed={look[k] === v} onClick={() => set(k, v)}>{label}</button>)}
              </div>
              <p className="muted small lookhint">{cur?.[2] || cur?.[1]}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function syncLists(pack: ReturnType<typeof useApp>["pack"]) {
  return { quests: pack.quests.map((q) => q.id), items: pack.items.map((i) => i.id), achievements: pack.achievements.map((a) => a.id) };
}

/** Import a playthrough from a phone-sync link (#sync=...). Returns the merged profile fields. */
export function applySync(code: string, pack: ReturnType<typeof useApp>["pack"], p: Profile): Profile {
  const s = decodeSync(code, syncLists(pack));
  return { ...p, base: s.base ?? p.base, dlcStep: s.dlcStep ?? p.dlcStep, ownsDlc: !!s.ownsDlc, level: s.level ?? p.level, spoiler: s.spoiler ?? p.spoiler,
    done: { ...p.done, ...s.done }, owned: { ...p.owned, ...s.owned }, achieved: { ...p.achieved, ...s.achieved } };
}

function SyncCard() {
  const { pack, profile } = useApp();
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  const make = async () => {
    const code = encodeSync(profile, syncLists(pack), pack.version);
    const base = UPDATE_BASE.endsWith("/") ? UPDATE_BASE : UPDATE_BASE + "/";
    const link = `${base}#sync=${code}`;
    setUrl(link);
    setQr(await QRCode.toDataURL(link, { margin: 1, width: 260, color: { dark: "#14110f", light: "#f3e9d2" } }));
  };
  return (
    <div className="card">
      <h2>Send to my phone</h2>
      <p className="muted small">Shows a QR code that holds your progress. Scan it with your phone camera and the guide opens with the same progress. The code stays in the link itself: nothing is uploaded.</p>
      <button onClick={make}>Make QR code</button>
      {qr && <div className="qr"><img src={qr} alt="QR code with your progress" /><button className="link small" onClick={() => navigator.clipboard?.writeText(url)}>Copy link instead</button></div>}
    </div>
  );
}

function ShotsCard() {
  const { pack, toast, settings, setSettings } = useApp();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { allShots().then((l) => setCount(l.length)).catch(() => setCount(0)); }, []);
  const send = async () => {
    const zip = await exportShots(pack.game);
    if (!zip) return toast("No screenshots yet. Add some on a quest page.");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(zip);
    a.download = `my-screenshots-${pack.game}-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    toast("Saved the zip. Send it to PraetorLink to add your pictures to the guide.");
  };
  return (
    <div className="card">
      <h2>My screenshots</h2>
      <p className="muted small">{count === null ? "Counting…" : `${count} screenshot${count === 1 ? "" : "s"} attached to quests on this device.`} Saves them with their captions as one zip file, plus a list of your clips and their YouTube links (not the videos themselves). Only include pictures you took yourself.</p>
      {isTauri() && (
        <label>Clips folder (where OBS or Steam saves your video clips)
          <input placeholder="C:\\Users\\you\\Videos" value={settings.clipsFolder ?? ""} onChange={(e) => setSettings((s) => ({ ...s, clipsFolder: e.target.value || undefined }))} />
        </label>
      )}
      <button onClick={() => void send()}>Save my screenshots as a zip</button>
    </div>
  );
}

export function Settings() {
  const { pack, packFrom, profiles, profile, setProfile, settings, setSettings, addProfile, removeProfile, toast } = useApp();
  const [taps, setTaps] = useState(0);
  const [newName, setNewName] = useState("");
  const [app, setApp] = useState<AppUpdate | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => { void checkAppUpdate().then(setApp); }, []);

  const tapVersion = () => {
    const n = taps + 1;
    setTaps(n);
    if (n >= 7) {
      setSettings((s) => ({ ...s, tester: !s.tester }));
      toast(settings.tester ? "Tester mode off" : "Tester mode on: every page gets confirm and flag buttons");
      setTaps(0);
    }
  };
  const exportNotes = () => {
    const blob = new Blob([JSON.stringify({ pack: pack.version, app: APP_VERSION, notes: testerNotes() }, null, 1)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tester-notes-${pack.game}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  const updatePack = async () => {
    setChecking(true);
    const r = await checkForPackUpdate(pack, { force: true });
    setChecking(false);
    if (r.status === "updated") { toast(`Guide updated to ${r.version}. Reloading…`); setTimeout(() => location.reload(), 900); }
    else if (r.status === "needs-app-update") toast("New guide data needs a newer app. Update the app first.");
    else if (r.status === "error") toast(`Couldn't update: ${r.message}`);
    else toast("The guide is up to date.");
  };

  return (
    <Page title="Settings">
      <div className="card">
        <h2>Playthrough</h2>
        <div className="row">
          <select value={profile.id} onChange={(e) => setSettings((s) => ({ ...s, activeProfile: e.target.value }))} aria-label="Playthrough">
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="New playthrough name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button onClick={() => { if (newName.trim()) { addProfile(newName.trim()); setNewName(""); } }}>Add</button>
        </div>
        <div className="row">
          <label>Name <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} /></label>
          {profiles.length > 1 && <button className="danger" onClick={() => { if (confirm(`Delete "${profile.name}"? This can't be undone.`)) removeProfile(profile.id); }}>Delete this playthrough</button>}
        </div>
        <label className="check big">
          <input type="checkbox" checked={profile.ownsDlc} onChange={(e) => setProfile((p) => ({ ...p, ownsDlc: e.target.checked }))} />
          I own Dark Arisen (shows everything tagged DLC)
        </label>
      </div>

      <div className="card">
        <h2>Spoilers</h2>
        {SPOILERS.map(([v, l, d]) => (
          <label key={v} className="radio">
            <input type="radio" name="spoiler" checked={profile.spoiler === v} onChange={() => setProfile((p) => ({ ...p, spoiler: v }))} />
            <span><strong>{l}</strong><br /><span className="muted small">{d}</span></span>
          </label>
        ))}
        <p className="muted small">Content from parts of the story you haven't reached is always hidden until you tap, whatever you choose here.</p>
      </div>

      <LookCard />

      <div className="card">
        <h2>Display and controls</h2>
        <label>Text size
          <input type="range" min={0.85} max={1.6} step={0.05} value={settings.textScale} onChange={(e) => setSettings((s) => ({ ...s, textScale: Number(e.target.value) }))} />
          <span className="muted">{Math.round(settings.textScale * 100)}%</span>
        </label>
        <label className="check"><input type="checkbox" checked={settings.highContrast} onChange={(e) => setSettings((s) => ({ ...s, highContrast: e.target.checked }))} /> High contrast</label>
        <label className="check"><input type="checkbox" checked={settings.reduceMotion} onChange={(e) => setSettings((s) => ({ ...s, reduceMotion: e.target.checked }))} /> Reduce motion</label>
        <label className="check"><input type="checkbox" checked={settings.compact} onChange={(e) => { const on = e.target.checked; setSettings((s) => ({ ...s, compact: on })); void setCompactWindow(on); }} />
          Compact mode {isTauri() ? "(small window that stays on top of the game)" : "(narrow layout for a side screen)"}</label>
        <label>Read-aloud speed
          <input type="range" min={0.6} max={1.6} step={0.1} value={settings.voiceRate} onChange={(e) => setSettings((s) => ({ ...s, voiceRate: Number(e.target.value) }))} />
        </label>
        <p className="muted small">Keyboard: / to search, Esc to go back, Tab to move. Controllers work too: D-pad moves, A selects, B goes back. Tags use shapes as well as colour.</p>
        {isTauri() && (
          <label>Steam folder (only if sync can't find it)
            <input placeholder="C:\Program Files (x86)\Steam" value={settings.steamPath ?? ""} onChange={(e) => setSettings((s) => ({ ...s, steamPath: e.target.value || undefined }))} />
          </label>
        )}
      </div>

      <SyncCard />

      <ShotsCard />

      <div className="card">
        <h2>Updates</h2>
        <p className="small">Guide data {pack.version} ({packFrom === "update" ? "downloaded update" : "built in"}). The app checks for new guide data on launch and every 6 hours.</p>
        <div className="row">
          <button onClick={updatePack} disabled={checking}>{checking ? "Checking…" : "Check for guide updates"}</button>
          {packFrom === "update" && <button onClick={() => { rollbackPack(pack.game); location.reload(); }}>Undo last guide update</button>}
        </div>
        {isTauri() && (app?.available
          ? <p>App update {app.version} is ready. <button onClick={() => app.install?.()}>Install and restart</button></p>
          : <p className="muted small">The app is up to date.</p>)}
      </div>

      {settings.tester && (
        <div className="card tester">
          <h2>Tester mode</h2>
          <p className="small">{testerNotes().length} notes saved on this device. Export them and send the file to PraetorLink. Each note says which entry, whether it was right, and what you wrote.</p>
          <div className="row">
            <button onClick={exportNotes}>Export notes</button>
            <button className="danger" onClick={() => { if (confirm("Delete all tester notes on this device?")) { clearTesterNotes(); toast("Notes cleared"); } }}>Clear notes</button>
          </div>
        </div>
      )}

      <div className="card about">
        <h2>About</h2>
        <p className="small">{pack.disclaimer}</p>
        <p className="small"><strong>Privacy:</strong> no account, no ads, no tracking. Your progress and screenshots are saved only on this device. The app goes online to check for guide and app updates, to load the Pawn board, and to play a quest's YouTube video when you tap Play. A pawn you post there is public until you remove it or it expires after 60 days.</p>
        <p className="small">Facts gathered with thanks from: {Object.values(pack.sourceList).map((s) => s.name).join(", ")}. All wording is our own.</p>
        <p className="small muted" onClick={tapVersion} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && tapVersion()}>PraetorLink Game Guides {APP_VERSION} · PraetorLink Games</p>
      </div>
    </Page>
  );
}
