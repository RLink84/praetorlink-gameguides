// Controller navigation with the standard Gamepad API: D-pad / left stick move focus, A selects, B goes back,
// LB/RB scroll the page. Works in browsers (including Steam's) and in the desktop app.
import { useEffect } from "react";

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

function move(dir: 1 | -1) {
  const els = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => !e.hasAttribute("disabled") && e.offsetParent !== null);
  if (!els.length) return;
  const i = els.indexOf(document.activeElement as HTMLElement);
  const next = els[(i + dir + els.length) % els.length];
  next.focus();
  next.scrollIntoView({ block: "nearest" });
}

export function useGamepadNav() {
  useEffect(() => {
    let raf = 0;
    const prev: Record<number, boolean> = {};
    let lastAxis = 0;
    const tick = () => {
      const pads = navigator.getGamepads?.() ?? [];
      const gp = pads.find((p) => p);
      if (gp) {
        const pressed = (b: number) => !!gp.buttons[b]?.pressed;
        const edge = (b: number) => { const p = pressed(b); const e = p && !prev[b]; prev[b] = p; return e; };
        if (edge(12)) move(-1); // up
        if (edge(13)) move(1); // down
        if (edge(14)) move(-1); // left
        if (edge(15)) move(1); // right
        if (edge(0)) (document.activeElement as HTMLElement | null)?.click(); // A
        if (edge(1)) history.back(); // B
        if (edge(4)) window.scrollBy({ top: -400, behavior: "smooth" });
        if (edge(5)) window.scrollBy({ top: 400, behavior: "smooth" });
        const y = gp.axes[1] ?? 0;
        const now = performance.now();
        if (Math.abs(y) > 0.6 && now - lastAxis > 220) { move(y > 0 ? 1 : -1); lastAxis = now; }
      }
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf) raf = requestAnimationFrame(tick); };
    addEventListener("gamepadconnected", start);
    if ((navigator.getGamepads?.() ?? []).some((p) => p)) start();
    return () => { cancelAnimationFrame(raf); removeEventListener("gamepadconnected", start); };
  }, []);
}
