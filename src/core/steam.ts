// Steam achievement sync (PC only). Steam keeps a local copy of each game's achievement schema and the
// signed-in user's progress under <Steam>/appcache/stats. We only READ those two files on this PC.
// No login, no Steam Web API, nothing is sent anywhere.
//   UserGameStatsSchema_<appid>.bin  - which stat/bit is which achievement, with English names
//   UserGameStats_<accountid>_<appid>.bin - the user's stat values (achievement bits)
// Both are Valve "binary KeyValues".

export type KV = { [k: string]: KVValue };
export type KVValue = KV | string | number | bigint;

export function parseBinaryKV(buf: Uint8Array): KV {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let i = 0;
  const utf8 = new TextDecoder("utf-8");
  const cstr = () => {
    const start = i;
    while (i < buf.length && buf[i] !== 0) i++;
    const s = utf8.decode(buf.subarray(start, i));
    i++; // skip NUL
    return s;
  };
  const obj = (): KV => {
    const out: KV = {};
    while (i < buf.length) {
      const t = buf[i++];
      if (t === 8 || t === 11) return out; // end of object
      const name = cstr();
      switch (t) {
        case 0: out[name] = obj(); break;
        case 1: out[name] = cstr(); break;
        case 2: case 4: case 6: out[name] = view.getInt32(i, true); i += 4; break;
        case 3: out[name] = view.getFloat32(i, true); i += 4; break;
        case 7: out[name] = view.getBigUint64(i, true); i += 8; break;
        case 10: out[name] = view.getBigInt64(i, true); i += 8; break;
        case 5: { // wide string, NUL-terminated UTF-16
          const start = i;
          while (i + 1 < buf.length && (buf[i] | buf[i + 1]) !== 0) i += 2;
          out[name] = new TextDecoder("utf-16le").decode(buf.subarray(start, i));
          i += 2;
          break;
        }
        default: throw new Error(`Unknown KeyValues type ${t} at byte ${i - 1}`);
      }
    }
    return out;
  };
  return obj();
}

export interface SchemaAchievement { statId: string; bit: number; apiName: string; english: string }

const isObj = (v: KVValue | undefined): v is KV => typeof v === "object" && v !== null && typeof v !== "bigint";

export function readSchema(schema: KV): SchemaAchievement[] {
  const out: SchemaAchievement[] = [];
  const root = Object.values(schema).find(isObj) as KV | undefined; // { "<appid>": { stats: ... } }
  const stats = root && isObj(root.stats) ? root.stats : undefined;
  if (!stats) return out;
  for (const [statId, st] of Object.entries(stats)) {
    if (!isObj(st) || !isObj(st.bits)) continue;
    for (const [bit, b] of Object.entries(st.bits)) {
      if (!isObj(b)) continue;
      const disp = isObj(b.display) && isObj(b.display.name) ? b.display.name : undefined;
      const english = disp && typeof disp.english === "string" ? disp.english : String(b.name ?? "");
      out.push({ statId, bit: Number(bit), apiName: String(b.name ?? ""), english });
    }
  }
  return out;
}

function findStatValues(user: KV): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (o: KV) => {
    for (const [k, v] of Object.entries(o)) {
      if (!isObj(v)) continue;
      if (/^\d+$/.test(k) && (typeof v.data === "number" || typeof v.data === "bigint")) out[k] = Number(v.data);
      else walk(v);
    }
  };
  walk(user);
  return out;
}

export const normName = (s: string) =>
  s.toLowerCase().replace(/[’‘`]/g, "'").replace(/…/g, "...").replace(/[^a-z0-9']+/g, " ").trim();

/** Returns the English names of unlocked achievements. */
export function unlockedAchievements(schemaBuf: Uint8Array, userBuf: Uint8Array): string[] {
  const schema = readSchema(parseBinaryKV(schemaBuf));
  const values = findStatValues(parseBinaryKV(userBuf));
  return schema.filter((a) => ((values[a.statId] ?? 0) >>> a.bit) & 1).map((a) => a.english);
}

export const DD2_APPID = 2054970;

/** Tauri-only: ask the native side for the two files, then parse here. */
export async function syncFromSteam(steamPath?: string): Promise<{ names: string[]; account: string }> {
  const { invoke } = await import("@tauri-apps/api/core");
  const r = await invoke<{ schema: number[]; user: number[]; account: string }>("read_steam_stats", { appid: DD2_APPID, steamPath: steamPath ?? null });
  return { names: unlockedAchievements(new Uint8Array(r.schema), new Uint8Array(r.user)), account: r.account };
}

export const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
