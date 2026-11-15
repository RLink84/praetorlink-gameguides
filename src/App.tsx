import { useEffect, useState } from "react";
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
import { useGamepadNav } from "./ui/gamepad";

const NAV: [string, string, string][] = [
  ["now", "Now", "◎"], ["quests", "Quests", "✦"], ["choices", "Choices", "⚖"], ["items", "Items", "⚔"], ["world", "World", "⛰"],
  ["leveling", "Level up", "⬆"], ["secrets", "Secrets", "✧"], ["checklist", "Checklist", "☑"], ["party", "Party", "⚑"], ["pawns", "Pawn board", "☺"],
  ["shopping", "Shopping", "🛒"], ["fixit", "Fix it", "🛠"], ["ask", "Ask", "?"], ["settings", "Settings", "⚙"],
];

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
      setProfile(() => next);
      toast("Progress imported from your other device");
    } catch (e) {
      toast(e instanceof Error ? e.message : "That sync code didn't work");
    }
    history.replaceState(null, "", location.pathname + "#/now");
    go("now");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: "/" focuses search, Escape goes back.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === "/" && !typing) { e.preventDefault(); go("ask"); setTimeout(() => document.getElementById("ask-input")?.focus(), 50); }
      if (e.key === "Escape" && !typing && route[0] !== "now") history.back();
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
  }, [settings]);

  const [page, id] = route;
  let body;
  switch (page) {
    case "quests": body = <Quests />; break;
    case "quest": body = <QuestDetail id={id} />; break;
    case "choices": body = <Choices />; break;
    case "items": body = <Items />; break;
    case "item": body = <ItemDetail id={id} />; break;
    case "shopping": body = <Shopping />; break;
    case "world": body = <World />; break;
    case "area": body = <AreaDetail id={id} />; break;
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
  const active = page === "quest" ? "quests" : page === "item" ? "items" : page === "area" ? "world" : page;
  return (
    <div className="shell">
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
      <main id="main">{body}</main>
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
