// Look and feel: the PraetorLink family design (frosted glass over slow colour light).
// Choices are saved with the other settings on this device only. Reduce motion (ours or the system's) always wins.
export type LookName = "aurora" | "deck" | "holo";
export type Motion = "calm" | "alive" | "max";
export type MenuPlace = "side" | "top" | "dock";
export type Density = "roomy" | "balanced" | "dense";
export interface Look { look: LookName; motion: Motion; menu: MenuPlace; density: Density; color: string }

export const DEFAULT_LOOK: Look = { look: "aurora", motion: "alive", menu: "side", density: "roomy", color: "#e8c27a" };

type Opt = [value: string, label: string, hint: string];
export const LOOK_CHOICES: [keyof Look, string, Opt[]][] = [
  ["look", "Look", [
    ["aurora", "Aurora", "Frosted glass on slow colour light. The PraetorLink family look."],
    ["deck", "Graphite", "Solid dark panels and sharp edges. The calmest to read."],
    ["holo", "Holo table", "Glowing edges, cut corners and a grid floor, like a war table."],
  ]],
  ["motion", "Movement", [
    ["calm", "Calm", "Nothing moves."],
    ["alive", "Alive", "The background drifts slowly."],
    ["max", "Full motion", "A faster background and glowing cards."],
  ]],
  ["menu", "Menu place", [
    ["side", "Side rail", "The menu down the left side."],
    ["top", "Top tabs", "Tabs across the top, the guide gets the full width."],
    ["dock", "Floating dock", "A glass dock at the bottom, out of the way."],
  ]],
  ["density", "Density", [
    ["roomy", "Roomy", "Space to breathe."],
    ["balanced", "Balanced", "In between."],
    ["dense", "Dense", "Tight rows, more on screen."],
  ]],
  ["color", "Main colour", [
    ["#e8c27a", "Praetor gold", ""], ["#7fd4ff", "Ice blue", ""], ["#35e0d2", "Teal", ""],
    ["#a58bff", "Violet", ""], ["#b6f36a", "Lime", ""], ["#ff7aa8", "Rose", ""],
  ]],
];

/** Fill in missing or unknown choices with the defaults (older saved settings have none). */
export function resolveLook(saved?: Partial<Look>): Look {
  const out = { ...DEFAULT_LOOK };
  for (const [k, , opts] of LOOK_CHOICES) {
    const v = saved?.[k];
    if (typeof v === "string" && opts.some((o) => o[0] === v)) (out as Record<string, string>)[k] = v;
  }
  return out;
}

const systemReduce = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Puts the look on the page: lk-/mo-/mn-/dn- classes on <html> and the main colour variable. */
export function applyLook(look: Look, reduceMotion: boolean) {
  const r = document.documentElement;
  const still = reduceMotion || systemReduce();
  const keep = r.className.split(" ").filter((c) => c && !/^(lk|mo|mn|dn)-/.test(c));
  r.className = keep.concat([`lk-${look.look}`, `mo-${still ? "calm" : look.motion}`, `mn-${look.menu}`, `dn-${look.density}`]).join(" ");
  r.style.setProperty("--acc", look.color);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = look.look === "deck" ? "#07090d" : look.look === "holo" ? "#02040a" : "#060814";
}

// ---------- the moving background (a canvas behind everything) ----------
const rgb = (h: string, a: number) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

export function startBackground(canvas: HTMLCanvasElement, get: () => { look: Look; still: boolean; plain: boolean }) {
  const cx = canvas.getContext("2d");
  if (!cx) return () => {};
  let W = 0, H = 0, T = 0, last = 0, raf = 0, dirty = true, key = "";
  const pts = Array.from({ length: 60 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random() }));
  const size = () => { W = canvas.width = innerWidth; H = canvas.height = innerHeight; dirty = true; };
  const paint = (L: Look, m: number, plain: boolean) => {
    T += 0.004 * m;
    const acc = L.color;
    if (plain) { cx.fillStyle = "#000"; cx.fillRect(0, 0, W, H); return; }
    if (L.look === "deck") {
      cx.fillStyle = "#07090d"; cx.fillRect(0, 0, W, H);
      cx.strokeStyle = "rgba(255,255,255,.03)"; cx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
      for (let y = 0; y < H; y += 40) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
    } else if (L.look === "holo") {
      const g0 = cx.createRadialGradient(W / 2, H * 0.3, 0, W / 2, H * 0.3, W * 0.7);
      g0.addColorStop(0, "#0a1a2c"); g0.addColorStop(1, "#02040a"); cx.fillStyle = g0; cx.fillRect(0, 0, W, H);
      const hz = H * 0.55; cx.strokeStyle = rgb(acc, 0.14); cx.lineWidth = 1;
      for (let i = -16; i <= 16; i++) { cx.beginPath(); cx.moveTo(W / 2 + i * 18, hz); cx.lineTo(W / 2 + i * 220, H); cx.stroke(); }
      for (let k = 0; k < 14; k++) { const z = ((k + T * 0.6) % 14) / 14, y = hz + Math.pow(z, 2.2) * (H - hz); cx.globalAlpha = z; cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
      cx.globalAlpha = 1;
      for (const p of pts) { p.y -= 0.0005 * p.z * m; if (p.y < 0) p.y = 1; cx.fillStyle = rgb(acc, 0.12 + p.z * 0.4); cx.beginPath(); cx.arc(p.x * W, p.y * H, p.z * 1.5, 0, 7); cx.fill(); }
    } else {
      cx.fillStyle = "#060814"; cx.fillRect(0, 0, W, H); cx.globalCompositeOperation = "lighter";
      [acc, "#7b5cff", "#2fd6a0", "#2f7bff", acc].forEach((c, i) => {
        const x = W * (0.5 + 0.42 * Math.sin(T * 0.23 + i * 1.9)), y = H * (0.5 + 0.4 * Math.cos(T * 0.19 + i * 2.6)), r = Math.max(W, H) * (0.34 + 0.08 * Math.sin(T * 0.3 + i));
        const g = cx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgb(c, 0.2)); g.addColorStop(1, rgb(c, 0)); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      });
      cx.globalCompositeOperation = "source-over";
    }
  };
  // About 30 frames a second while moving. When still (Calm, reduce motion, hidden window) it draws once and rests.
  const loop = (t: number) => {
    raf = requestAnimationFrame(loop);
    if (document.hidden || t - last < 33) return;
    last = t;
    const { look, still, plain } = get();
    const k = JSON.stringify([look, still, plain]);
    if (k !== key) { key = k; dirty = true; }
    if (still && !dirty) return;
    paint(look, still ? 0 : look.motion === "max" ? 2.2 : 1, plain);
    dirty = false;
  };
  addEventListener("resize", size); size(); raf = requestAnimationFrame(loop);
  return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); };
}
