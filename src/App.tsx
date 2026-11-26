import { useEffect, useRef, useState } from "react";
import { applyLook, resolveLook, startBackground } from "./ui/look";
import { autoCapture } from "./core/shots";
import { isTauri, DD2_APPID } from "./core/steam";
import type { Pack } from "./core/types";
import { loadPack, checkForPackUpdate } from "./core/pack";
import { AppProvider, useApp } from "./ui/state";
import { Now } from "./screens/Now";
import { Quests, QuestDetail, Choices } from "./screens/Quests";
import { Items, ItemDetail, Shopping } from "./screens/Items";
import { World, AreaDetail, Leveling, Secrets, FixIt, Party } from "./screens/Guide";
import { Checklist } from "./screens/Checklist";
import { Settings, applySync } from "./screens/Settings";
import { Ask } from "./screens/Ask";
import { Pawns } from "./screens/Pawns";
import { useGamepadNav, goBack } from "./ui/gamepad";
import { setCompactWindow } from "./core/appUpdate";

const NAV: [string, string, string][] = [
  ["now", "Now", "◎"], ["quests", "Quests", "✦"], ["choices", "Choices", "⚖"], ["items", "Items", "⚔"], ["world", "World", "⛰"],
  ["leveling", "Level up", "⬆"], ["secrets", "Secrets", "✧"], ["checklist", "Checklist", "☑"], ["party", "Party", "⚑"], ["pawns", "Pawn board", "☺"],
  ["shopping", "Shopping", "🛒"], ["fixit", "Fix it", "🛠"], ["ask", "Ask", "?"], ["settings", "Settings", "⚙"],
];

/** The slow colour light behind the glass panels. Still when motion is off; plain black in high contrast. */
function Background() {
  const { settings } = useApp();
  const ref = useRef<HTMLCanvasElement>(null);
  const now = useRef(settings);
  now.current = settings;
  useEffect(() => {
    if (!ref.current) return;
    const reduce = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    return startBackground(ref.current, () => {
      const s = now.current, look = resolveLook(s.look);
      return { look, still: s.reduceMotion || reduce() || look.motion === "calm", plain: s.highContrast };
    });
  }, []);
  return <canvas id="fxbg" ref={ref} aria-hidden="true" />;
}

function Shell() {
  const { route, go, settings, pack, profile, setProfile, toast } = useApp();
  const [menu, setMenu] = useState(false);
  useGamepadNav();

  // Phone sync link: #sync=<code>
  useEffect(() => {
    const m = /#sync=([^&]+)/.exec(location.hash);
    if (!m) return;
    try {
      // Decode outside the state updater so a bad code is caught here instead of crashing the render.
      const next = applySync(m[1], pack, profile);
      const ok = Object.keys(profile.done).length === 0 ||
        confirm(`Copy progress from your other device into "${profile.name}"? Quests you've ticked here stay ticked.`);
      if (ok) {
        setProfile(() => next);
        toast("Progress imported from your other device");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "That sync code didn't work");
    }
    history.replaceState(null, "", location.pathname + "#/now");
    go("now");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore the compact always-on-top window on launch (PC).
  useEffect(() => { if (settings.compact) void setCompactWindow(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reminders fire wherever you are in the app, with a system notification when allowed.
  useEffect(() => {
    const check = () => {
      for (const t of profile.timers) {
        if (t.endsAt <= Date.now() && !sessionStorage.getItem(`fired.${t.id}`)) {
          sessionStorage.setItem(`fired.${t.id}`, "1");
          toast(`⏰ ${t.label}`);
          try {
            if ("Notification" in window && Notification.permission === "granted") new Notification("Guide reminder", { body: t.label });
          } catch { /* some webviews have no notifications */ }
        }
      }
    };
    check();
    const i = setInterval(check, 15_000);
    return () => clearInterval(i);
  }, [profile.timers, toast]);

  // Auto-attach: while a quest is active, new Steam screenshots and clips attach to it (desktop app).
  useEffect(() => {
    if (!isTauri() || !settings.activeQuest || !settings.activeSince) return;
    const quest = settings.activeQuest;
    const name = pack.quests.find((q) => q.id === quest)?.name ?? "your quest";
    let busy = false;
    const run = async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await autoCapture({ appid: DD2_APPID, quest, since: settings.activeSince!, steamPath: settings.steamPath, clipsFolder: settings.clipsFolder });
        if (r.shots || r.clips) {
          window.dispatchEvent(new Event("plgg-shots-changed"));
          const parts = [r.shots && `${r.shots} screenshot${r.shots === 1 ? "" : "s"}`, r.clips && `${r.clips} clip${r.clips === 1 ? "" : "s"}`].filter(Boolean).join(" and ");
          toast(`📷 Added ${parts} to ${name}`);
        }
      } finally { busy = false; }
    };
    void run();
    const i = setInterval(() => void run(), 20_000);
    return () => clearInterval(i);
  }, [settings.activeQuest, settings.activeSince, settings.steamPath, settings.clipsFolder, pack, toast]);

  // Keyboard shortcuts: "/" focuses search, Escape goes back.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === "/" && !typing) { e.preventDefault(); go("ask"); setTimeout(() => document.getElementById("ask-input")?.focus(), 50); }
      if (e.key === "Escape" && !typing && route[0] !== "now") goBack(go);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [go, route]);

  useEffect(() => {
    const r = document.documentElement;
    r.style.setProperty("--scale", String(settings.textScale));
    r.classList.toggle("hc", settings.highContrast);
    r.classList.toggle("calm", settings.reduceMotion);
    r.classList.toggle("compact", settings.compact);
    applyLook(resolveLook(settings.look), settings.reduceMotion);
  }, [settings]);

  const [page, id] = route;
  let body;
  switch (page) {
    case "quests": body = <Quests />; break;
    case "quest": body = <QuestDetail key={id} id={id} />; break;
    case "choices": body = <Choices />; break;
    case "items": body = <Items />; break;
    case "item": body = <ItemDetail key={id} id={id} />; break;
    case "shopping": body = <Shopping />; break;
    case "world": body = <World />; break;
    case "area": body = <AreaDetail key={id} id={id} />; break;
    case "leveling": body = <Leveling />; break;
    case "secrets": body = <Secrets />; break;
    case "fixit": body = <FixIt />; break;
    case "checklist": body = <Checklist />; break;
    case "party": body = <Party />; break;
    case "pawns": body = <Pawns />; break;
    case "ask": body = <Ask />; break;
    case "settings": body = <Settings />; break;
    default: body = <Now />;
  }
  // Move focus to the new page and name it, so screen readers and keyboard users follow navigation.
  useEffect(() => {
    const h1 = document.querySelector<HTMLElement>("main h1");
    document.title = `${h1?.textContent ?? "Guide"} · ${pack.title} · PraetorLink Game Guides`;
    if (route.join("/") !== "now") h1?.focus({ preventScroll: true });
  }, [route, pack.title]);
  const active = page === "quest" ? "quests" : page === "item" ? "items" : page === "area" ? "world" : page;
  return (
    <div className="shell">
      <Background />
      <header className="top">
        <button className="icon-btn menu-btn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>☰</button>
        <button className="brand" onClick={() => go("now")}><img src="icon.svg" alt="" width={24} height={24} /> Game Guides <span className="muted">· {pack.title}</span></button>
        {profile.ownsDlc && <span className="tag tag-dlc" title="Dark Arisen content is shown">DLC on</span>}
        <button className="icon-btn" aria-label="Ask the guide" onClick={() => go("ask")}>🔍</button>
      </header>
      <nav className={menu ? "side open" : "side"} aria-label="Sections" onClick={() => setMenu(false)}>
        {NAV.map(([k, l, i]) => (
          <button key={k} className={active === k ? "nav on" : "nav"} aria-current={active === k ? "page" : undefined} onClick={() => go(k)}>
            <span aria-hidden className="nav-i">{i}</span> {l}
          </button>
        ))}
        <p className="side-foot">Unofficial fan guide. Not affiliated with Capcom.</p>
      </nav>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <main id="main" tabIndex={-1}>{body}</main>
      <nav className="tabbar" aria-label="Quick sections">
        {NAV.slice(0, 4).concat([NAV.find((n) => n[0] === "ask")!]).map(([k, l, i]) => (
          <button key={k} className={active === k ? "on" : ""} onClick={() => go(k)}><span aria-hidden>{i}</span><small>{l}</small></button>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  const [state, setState] = useState<{ pack: Pack; from: "update" | "bundled" } | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  useEffect(() => {
    loadPack("dd2").then(setState).catch((e) => setError(String(e)));
  }, []);
  // Quiet background check for new guide data (applies next launch).
  useEffect(() => {
    if (!state) return;
    const run = () => checkForPackUpdate(state.pack).then((r) => { if (r.status === "updated") setToast(`New guide data ${r.version} downloaded. It loads next time you open the app.`); });
    const t = setTimeout(run, 4000);
    const i = setInterval(run, 6 * 3600_000);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [state]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  if (error) return <div className="boot">Couldn't load the guide data. {error}</div>;
  if (!state) return <div className="boot">Loading the guide…</div>;
  return (
    <AppProvider pack={state.pack} packFrom={state.from} onToast={setToast}>
      <Shell />
      {toast && <div className="toast" role="status">{toast}</div>}
    </AppProvider>
  );
}
