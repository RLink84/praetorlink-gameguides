// Maps and pictures for one quest: links to an online map and guide page, our own shipped screenshots,
// and "My screenshots" the player attaches (from Steam F12 shots on PC, or any picture file).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../ui/state";
import { Reveal, openExternal } from "../ui/components";
import { UPDATE_BASE } from "../core/pack";
import { DD2_APPID, isTauri } from "../core/steam";
import { shotsFor, addShot, deleteShot, saveShot, steamShots, readSteamShot, clipsFor, saveClip, deleteClip, openClip, type Shot, type SteamShot, type ClipRef } from "../core/shots";
import type { Quest, WalkVideo } from "../core/types";

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
  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener("plgg-shots-changed", on);
    return () => window.removeEventListener("plgg-shots-changed", on);
  }, [quest.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
      {isTauri() && <AutoToggle quest={quest} />}
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
      {isTauri() && <MyClips quest={quest} />}
      {zoom && <Zoom alt="My screenshot" onClose={() => setZoom(null)}><img src={zoom} alt="My screenshot" /></Zoom>}
    </div>
  );
}

function AutoToggle({ quest }: { quest: Quest }) {
  const { settings, setSettings, toast, pack } = useApp();
  const on = settings.activeQuest === quest.id;
  const other = settings.activeQuest && !on ? pack.quests.find((q) => q.id === settings.activeQuest)?.name : undefined;
  const flip = () => {
    setSettings((s) => (on ? { ...s, activeQuest: undefined, activeSince: undefined } : { ...s, activeQuest: quest.id, activeSince: Date.now() }));
    toast(on ? "Auto-attach off" : "Auto-attach on: press F12 in the game and the shot lands here");
  };
  return (
    <label className="check auto">
      <input type="checkbox" checked={on} onChange={flip} />
      <span><strong>I'm doing this quest:</strong> attach my new F12 screenshots{settings.clipsFolder ? " and clips" : ""} here automatically
        {other && <span className="muted small"> (this moves it from {other})</span>}</span>
    </label>
  );
}

function MyClips({ quest }: { quest: Quest }) {
  const { settings } = useApp();
  const [clips, setClips] = useState<ClipRef[]>(() => clipsFor(quest.id));
  useEffect(() => {
    setClips(clipsFor(quest.id));
    const on = () => setClips(clipsFor(quest.id));
    window.addEventListener("plgg-shots-changed", on);
    return () => window.removeEventListener("plgg-shots-changed", on);
  }, [quest.id]);
  const update = (c: ClipRef) => { saveClip(c); setClips(clipsFor(quest.id)); };
  if (!clips.length) {
    return settings.clipsFolder ? null : <p className="muted small">Record video with OBS or Steam? Set your clips folder in Settings and new clips attach here too.</p>;
  }
  return (
    <div className="clips">
      <h3>My clips</h3>
      {clips.map((c) => (
        <div key={c.id} className="clip">
          <div className="row">
            <span className="row-title">🎬 {c.name}</span>
            <button className="small" onClick={() => void openClip(c.path)}>Play</button>
            <button className="small" onClick={() => void openClip(c.path, true)}>Show in folder</button>
            <button className="link small danger" onClick={() => { deleteClip(c.id); setClips(clipsFor(quest.id)); }}>Remove</button>
          </div>
          <input placeholder="YouTube link once it's on SuperRobio" aria-label="YouTube link" defaultValue={c.youtube ?? ""}
            onBlur={(e) => update({ ...c, youtube: e.target.value.trim() || undefined })} />
        </div>
      ))}
    </div>
  );
}

/** Another creator's walkthrough, played in YouTube's own player. Nothing loads from YouTube until the player taps Play. */
export function VideoWalk({ video }: { video: WalkVideo }) {
  const [on, setOn] = useState(false);
  const watch = `https://www.youtube.com/watch?v=${video.yt}`;
  return (
    <div className="walk-video">
      {on ? (
        <div className="yt-frame">
          <iframe src={`https://www.youtube-nocookie.com/embed/${video.yt}?autoplay=1&rel=0`} title={`Video walkthrough by ${video.by}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      ) : (
        <button className="yt-play" onClick={() => setOn(true)}>
          <span className="yt-tri" aria-hidden>▶</span>
          <span><strong>Play the video walkthrough</strong><br /><span className="muted small">by {video.by}{video.len ? ` · ${video.len}` : ""}</span></span>
        </button>
      )}
      <p className="muted small">Video by {video.by} on YouTube, not made by PraetorLink. Playing it connects to YouTube.{" "}
        <a href={watch} target="_blank" rel="noreferrer" onClick={openExternal}>Watch on YouTube ↗</a></p>
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
      {quest.videos?.length ? (
        <Reveal entry={quest} level={2} label="videos">
          <div className="row">
            {quest.videos.map((v) => <a key={v.url} className="btn video" href={v.url} target="_blank" rel="noreferrer" onClick={openExternal}>▶ Watch on SuperRobio: {v.title}</a>)}
          </div>
        </Reveal>
      ) : null}
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
