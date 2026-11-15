// PraetorLink pawn board API (Cloudflare Worker + D1).
// GET    /pawns?game=dd2&platform=pc&vocation=Mage&q=text&minLevel=&maxLevel=   list (newest first, max 100)
// POST   /pawns            {pawnId,name,level,vocation,platform,specialization?,notes?} -> {id, deleteCode}
// POST   /pawns/:id/report  hides a post after 3 reports
// DELETE /pawns/:id         {deleteCode}
// Nothing identifying is stored: no accounts, no IPs. Posts expire after 60 days.
interface Env {
  DB: D1Database;
  RATE?: { limit(o: { key: string }): Promise<{ success: boolean }> };
  ALLOWED_ORIGINS: string;
}

const PLATFORMS = ["pc", "playstation", "xbox"];
const VOCATIONS = ["Fighter", "Archer", "Mage", "Thief", "Warrior", "Sorcerer", "Mystic Spearhand", "Magick Archer", "Trickster"];
const DAY = 86_400_000;
const clean = (s: unknown, max: number) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function cors(env: Env, req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const ok = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const h = cors(env, req);
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });
    if (req.method === "OPTIONS") return new Response(null, { headers: h });
    const url = new URL(req.url);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "pawns") return json({ error: "not found" }, 404);
    const now = Date.now();

    if (req.method !== "GET" && env.RATE) {
      // Rate limit key is a hash of the connecting address, held only in Cloudflare's limiter memory.
      const key = await sha256(req.headers.get("CF-Connecting-IP") ?? "x");
      if (!(await env.RATE.limit({ key })).success) return json({ error: "Too many requests. Try again in a minute." }, 429);
    }

    if (req.method === "GET" && parts.length === 1) {
      const game = clean(url.searchParams.get("game") || "dd2", 16);
      const where = ["game = ?", "expires_at > ?", "reports < 3"];
      const args: unknown[] = [game, now];
      const platform = url.searchParams.get("platform");
      if (platform && PLATFORMS.includes(platform)) { where.push("platform = ?"); args.push(platform); }
      const vocation = url.searchParams.get("vocation");
      if (vocation && VOCATIONS.includes(vocation)) { where.push("vocation = ?"); args.push(vocation); }
      const minL = Number(url.searchParams.get("minLevel")) || 0;
      const maxL = Number(url.searchParams.get("maxLevel")) || 999;
      where.push("level BETWEEN ? AND ?"); args.push(minL, maxL);
      const q = clean(url.searchParams.get("q"), 40);
      if (q) { where.push("(name LIKE ? OR specialization LIKE ? OR notes LIKE ? OR pawn_id = ?)"); args.push(`%${q}%`, `%${q}%`, `%${q}%`, q.toUpperCase()); }
      const { results } = await env.DB.prepare(
        `SELECT id, pawn_id AS pawnId, name, level, vocation, platform, specialization, notes, created_at AS createdAt FROM pawns WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT 100`,
      ).bind(...args).all();
      return json({ pawns: results });
    }

    if (req.method === "POST" && parts.length === 1) {
      let b: Record<string, unknown>;
      try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
      const pawnId = clean(b.pawnId, 16).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const name = clean(b.name, 24);
      const level = Math.round(Number(b.level));
      const vocation = clean(b.vocation, 24);
      const platform = clean(b.platform, 16);
      if (pawnId.length < 6) return json({ error: "Pawn ID looks too short." }, 400);
      if (!name) return json({ error: "Add your pawn's name." }, 400);
      if (!(level >= 1 && level <= 300)) return json({ error: "Level must be 1 to 300." }, 400);
      if (!VOCATIONS.includes(vocation)) return json({ error: "Pick a vocation." }, 400);
      if (!PLATFORMS.includes(platform)) return json({ error: "Pick a platform." }, 400);
      const deleteCode = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
      // Re-posting the same pawn updates the existing post only for its owner (the old delete code) or once
      // it has expired. Otherwise anyone could take over a post, or clear its reports by posting again.
      const row = await env.DB.prepare(
        `INSERT INTO pawns (id, game, pawn_id, name, level, vocation, platform, specialization, notes, delete_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(game, platform, pawn_id) DO UPDATE SET name=excluded.name, level=excluded.level, vocation=excluded.vocation,
           specialization=excluded.specialization, notes=excluded.notes, delete_hash=excluded.delete_hash,
           reports=CASE WHEN pawns.expires_at <= ? THEN 0 ELSE pawns.reports END,
           created_at=excluded.created_at, expires_at=excluded.expires_at
         WHERE pawns.delete_hash = ? OR pawns.expires_at <= ?
         RETURNING id`,
      ).bind(crypto.randomUUID(), clean(b.game || "dd2", 16), pawnId, name, level, vocation, platform, clean(b.specialization, 40), clean(b.notes, 160),
        await sha256(deleteCode), now, now + 60 * DAY, now, await sha256(clean(b.deleteCode, 40)), now).first<{ id: string }>();
      if (!row) return json({ error: "This pawn is already on the board. Remove the old post first, from the device that posted it." }, 409);
      const id = row.id;
      return json({ id, deleteCode }, 201);
    }

    if (req.method === "POST" && parts.length === 3 && parts[2] === "report") {
      await env.DB.prepare("UPDATE pawns SET reports = reports + 1 WHERE id = ?").bind(clean(parts[1], 40)).run();
      return json({ ok: true });
    }

    if (req.method === "DELETE" && parts.length === 2) {
      let b: Record<string, unknown> = {};
      try { b = await req.json(); } catch { /* empty */ }
      const r = await env.DB.prepare("DELETE FROM pawns WHERE id = ? AND delete_hash = ?").bind(clean(parts[1], 40), await sha256(clean(b.deleteCode, 40))).run();
      return json({ ok: (r.meta?.changes ?? 0) > 0 });
    }
    return json({ error: "not found" }, 404);
  },
};
