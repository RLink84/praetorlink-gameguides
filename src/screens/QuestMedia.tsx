// Maps and pictures for one quest: links to an online map and guide page, our own shipped screenshots,
// and "My screenshots" the player attaches (from Steam F12 shots on PC, or any picture file).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../ui/state";
import { Reveal, openExternal } from "../ui/components";
import { UPDATE_BASE } from "../core/pack";
import { DD2_APPID, isTauri } from "../core/steam";
import { shotsFor, addShot, deleteShot, saveShot, steamShots, readSteamShot, type Shot, type SteamShot } from "../core/shots";
import type { Quest } from "../core/types";

const base = UPDATE_BASE.endsWith("/") ? UPDATE_BASE : UPDATE_BASE + "/";

/** Shipped picture: use the copy built into the app, fall back to the website (for pictures added by a guide update). */
function PackImage({ game, file, alt }: { game: string; file: string; alt: string }) {
  const [src, setSrc] = useState(`./packs/${game}/img/${file}`);
  return <img src={src} alt={alt} loading="lazy" onError={() => setSrc((s) => (s.startsWith("./") ? `${base}packs/${game}/img/${file}` : s))} />;
}

function Zoom({ alt, onClose, children }: { alt: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onClose]);
  return (
    <div className="zoom" role="dialog" aria-label={alt} onClick={onClose}>
      {children}
      <button className="zoom-close" onClick={onClose} aria-label="Close">✕</button>
    </div>
  );
}

function SteamPicker({ onPick, onClose }: { onPick: (s: SteamShot) => void; onClose: () => void }) {
  const { settings } = useApp();
  const [list, setList] = useState<SteamShot[] | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    steamShots(DD2_APPID, settings.steamPath).then(setList).catch((e) => setErr(String(e)));
  }, [settings.steamPath]);
  useEffect(() => () => list?.forEach((s) => s.thumb && URL.revokeObjectURL(s.thumb)), [list]);
  return (
    <div className="steam-pick">
      <div className="row"><strong>Your latest Steam screenshots</strong><button className="link small" onClick={onClose}>Close</button></div>
      {err && <p className="muted small">{err}</p>}
      {!list && !err && <p className="muted small">Looking…</p>}
      {list && !list.length && <p className="muted small">No screenshots yet. Press F12 in the game to take one.</p>}
      <div className="shot-grid">
        {list?.map((s) => (
          <button key={s.path} className="shot-pick" onClick={() => onPick(s)} title={new Date(s.taken * 1000).toLocaleString()}>
            {s.thumb ? <img src={s.thumb} alt={`Screenshot from ${new Date(s.taken * 1000).toLocaleString()}`} /> : <span>{new Date(s.taken * 1000).toLocaleTimeString()}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

function MyShots({ quest }: { quest: Quest }) {
  const { settings, toast } = useApp();
  const [shots, setShots] = useState<(Shot & { url: string })[]>([]);
  const [picking, setPicking] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const load = () => shotsFor(quest.id).then((l) => setShots((old) => {
    old.forEach((s) => URL.revokeObjectURL(s.url));
    return l.map((s) => ({ ...s, url: URL.createObjectURL(s.blob) }));
  }));
  useEffect(() => { void load(); }, [quest.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      for (const f of Array.from(files)) await addShot(quest.id, f);
      toast(files.length === 1 ? "Screenshot added" : `${files.length} screenshots added`);
    } catch (e) { toast(`Couldn't add that: ${String(e)}`); }
    void load();
  };
  const addSteam = async (s: SteamShot) => {
    try {
      await addShot(quest.id, await readSteamShot(DD2_APPID, s.path, settings.steamPath));
      toast("Screenshot added");
    } catch (e) { toast(`Couldn't add that: ${String(e)}`); }
    void load();
  };

  return (
    <div className="my-shots">
      <h3>My screenshots</h3>
      <p className="muted small">Pictures you took yourself, saved only on this device. Send them to PraetorLink from Settings and they can go in the guide for everyone.</p>
      <div className="row">
        {isTauri() && <button onClick={() => setPicking((p) => !p)}>📷 From Steam (F12 shots)</button>}
        <button onClick={() => file.current?.click()}>Add a picture</button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
      </div>
      {picking && <SteamPicker onPick={(s) => void addSteam(s)} onClose={() => setPicking(false)} />}
      {shots.length > 0 && (
        <div className="shot-grid">
          {shots.map((s) => (
            <figure key={s.id} className="shot">
              <button className="shot-img" onClick={() => setZoom(s.url)} aria-label="Show bigger"><img src={s.url} alt={s.caption || "My screenshot"} /></button>
              <input value={s.caption} placeholder="What does this show?" aria-label="Caption"
                onChange={(e) => setShots((l) => l.map((x) => (x.id === s.id ? { ...x, caption: e.target.value } : x)))}
                onBlur={(e) => void saveShot({ id: s.id, quest: s.quest, caption: e.target.value, added: s.added, blob: s.blob })} />
              <button className="link small danger" onClick={() => { if (confirm("Remove this screenshot from the guide on this device?")) void deleteShot(s.id).then(load); }}>Remove</button>
            </figure>
          ))}
        </div>
      )}
      {zoom && <Zoom alt="My screenshot" onClose={() => setZoom(null)}><img src={zoom} alt="My screenshot" /></Zoom>}
    </div>
  );
}

export function QuestMedia({ quest }: { quest: Quest }) {
  const { pack } = useApp();
  const [zoom, setZoom] = useState<{ file: string; caption: string } | null>(null);
  return (
    <div className="card media">
      <h2>Maps and pictures</h2>
      <div className="row">
        {pack.mapUrl && <a className="btn" href={pack.mapUrl} target="_blank" rel="noreferrer" onClick={openExternal}>🗺 Open the interactive map</a>}
        {quest.guideUrl && <a className="btn" href={quest.guideUrl} target="_blank" rel="noreferrer" onClick={openExternal}>Pictures and map for this quest online ↗</a>}
      </div>
      {quest.guideUrl && <p className="muted small">These open other websites in your browser. Their pages may show spoilers.</p>}
      {quest.images?.length ? (
        <Reveal entry={quest} level={2} label="pictures">
          <div className="shot-grid">
            {quest.images.map((im) => (
              <figure key={im.file} className="shot">
                <button className="shot-img" onClick={() => setZoom(im)} aria-label="Show bigger"><PackImage game={pack.game} file={im.file} alt={im.caption} /></button>
                <figcaption className="small">{im.caption}{im.by ? <span className="muted"> · {im.by}</span> : null}</figcaption>
              </figure>
            ))}
          </div>
        </Reveal>
      ) : null}
      {zoom && <Zoom alt={zoom.caption} onClose={() => setZoom(null)}><PackImage game={pack.game} file={zoom.file} alt={zoom.caption} /></Zoom>}
      <MyShots quest={quest} />
    </div>
  );
}
