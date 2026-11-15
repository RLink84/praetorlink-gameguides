// App-wide state: the loaded pack, profiles, settings and a tiny hash router.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Pack } from "../core/types";
import { loadProfiles, loadSettings, saveProfiles, saveSettings, newProfile, type Profile, type Settings } from "../core/progress";
import { position, type Position } from "../core/logic";
import { buildIndex } from "../core/search";

export interface Ctx {
  pack: Pack;
  packFrom: "update" | "bundled";
  profiles: Profile[];
  profile: Profile;
  pos: Position;
  settings: Settings;
  route: string[];
  index: ReturnType<typeof buildIndex>;
  go: (path: string) => void;
  setProfile: (fn: (p: Profile) => Profile) => void;
  setSettings: (fn: (s: Settings) => Settings) => void;
  addProfile: (name: string) => void;
  removeProfile: (id: string) => void;
  toast: (msg: string) => void;
}

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(C);
  if (!c) throw new Error("no app context");
  return c;
};

const parseRoute = () => (location.hash.replace(/^#\/?/, "").split("?")[0] || "now").split("/").map(decodeURIComponent);

export function AppProvider({ pack, packFrom, children, onToast }: { pack: Pack; packFrom: "update" | "bundled"; children: ReactNode; onToast: (m: string) => void }) {
  const [profiles, setProfiles] = useState<Profile[]>(() => loadProfiles());
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(profiles));
  const [route, setRoute] = useState<string[]>(parseRoute);

  useEffect(() => {
    const on = () => setRoute(parseRoute());
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  useEffect(() => saveProfiles(profiles), [profiles]);
  useEffect(() => saveSettings(settings), [settings]);

  const profile = profiles.find((p) => p.id === settings.activeProfile) ?? profiles[0];
  const pos = useMemo(() => position(pack, profile), [pack, profile]);
  const index = useMemo(() => buildIndex(pack), [pack]);

  // Remember where the player left off (resume).
  useEffect(() => {
    const r = route.join("/");
    if (r === "now" || r.startsWith("settings") || r.startsWith("sync")) return;
    setProfiles((list) => list.map((p) => (p.id === profile.id ? { ...p, last: { route: r, at: Date.now() } } : p)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.join("/")]);

  const value: Ctx = {
    pack, packFrom, profiles, profile, pos, settings, route, index,
    go: (path) => { location.hash = "#/" + path; window.scrollTo({ top: 0 }); },
    setProfile: (fn) => setProfiles((list) => list.map((p) => (p.id === profile.id ? fn(p) : p))),
    setSettings: (fn) => setSettingsState(fn),
    addProfile: (name) => {
      const p = newProfile(name, pack.game);
      setProfiles((l) => [...l, p]);
      setSettingsState((s) => ({ ...s, activeProfile: p.id }));
    },
    removeProfile: (id) => {
      setProfiles((l) => {
        const next = l.filter((p) => p.id !== id);
        const keep = next.length ? next : [newProfile("My playthrough", pack.game)];
        setSettingsState((s) => ({ ...s, activeProfile: keep[0].id }));
        return keep;
      });
    },
    toast: onToast,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
