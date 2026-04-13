import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";
import type { TornMember, SharedTarget } from "./src/types";
import enemiesData from "./src/data/enemies.json" assert { type: "json" };

type Mode = "development" | "production";
const app = new Hono();
const mode: Mode = process.env.NODE_ENV === "production" ? "production" : "development";

// ─── In-memory store ─────────────────────────────────────────────────────────
let sharedTargets: SharedTarget[] = [];

// ─── Config ──────────────────────────────────────────────────────────────────
const TORN_API = "https://api.torn.com";
const TORN_KEY = process.env.TORN_API_KEY ?? "";
const FFSCOUT_KEY = "TmljODt3hutU7dWT";
const CACHE_TTL_MS = 30_000;

// ─── Enemy faction from local JSON ───────────────────────────────────────────
const ENEMY_IDS = (enemiesData as any[]).map((e: any) => e.id);
const ENEMY_MAP = new Map((enemiesData as any[]).map((e: any) => [e.id, e]));

// ─── Profile cache ────────────────────────────────────────────────────────────
interface CacheEntry { data: any; fetchedAt: number }
const profileCache = new Map<number, CacheEntry>();
function getCached(id: number) {
  const e = profileCache.get(id);
  if (e && Date.now() - e.fetchedAt < CACHE_TTL_MS) return e.data;
  profileCache.delete(id);
  return undefined;
}

// ─── Torn API ─────────────────────────────────────────────────────────────────
async function tornGet<T>(path: string, key?: string): Promise<T> {
  const k = key ?? TORN_KEY;
  if (!k) throw new Error("No Torn API key");
  const r = await fetch(`${TORN_API}${path}`, {
    headers: { Authorization: `ApiKey ${k}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Torn ${r.status}`);
  return r.json() as Promise<T>;
}

// ─── FFScout ──────────────────────────────────────────────────────────────────
interface FFSResult {
  player_id: number; name?: string; level?: number; rank?: string;
  bs_estimate: number; bs_estimate_human: string; fair_fight: number;
  last_updated: number; last_updated_relative: string;
}

async function fetchFFScout(ids: number[]): Promise<Map<number, FFSResult>> {
  const map = new Map<number, FFSResult>();
  const targets = ids.join(",");
  const r = await fetch(`https://ffscouter.com/api/v1/get-stats?key=${FFSCOUT_KEY}&targets=${targets}`);
  if (!r.ok) return map;
  const arr: FFSResult[] = await r.json();
  for (const e of arr) map.set(e.player_id, e);
  return map;
}

// ─── Torn profiles ─────────────────────────────────────────────────────────────
async function fetchProfiles(ids: number[], key: string): Promise<Map<number, any>> {
  const map = new Map<number, any>();
  for (const id of ids) {
    const cached = getCached(id);
    if (cached) { map.set(id, cached); continue; }
    try {
      await new Promise((r) => setTimeout(r, 130));
      const d = await tornGet<any>(`/v2/user/${id}?selections=profile`, key);
      const p = d.profile ?? d;
      if (p?.id) { profileCache.set(id, { data: p, fetchedAt: Date.now() }); map.set(id, p); }
    } catch { /* skip */ }
  }
  return map;
}

// ─── Map combined data → TornMember ─────────────────────────────────────────
function mapMember(id: number, profile: any | undefined, ffs: FFSResult | undefined): TornMember {
  const now = Math.floor(Date.now() / 1000);
  const ts = profile?.status as any;
  const la = (profile as any)?.last_action as any;
  const rawState = ts?.state ?? ts?.current ?? ts?.description ?? "Offline";
  const stateMap: Record<string, string> = {
    Okay: "Okay", Hospital: "Hospital", Traveling: "Traveling",
    Abroad: "Abroad", "In jail": "In jail", "In federal": "In federal",
  };
  const activity = stateMap[rawState] ?? "Offline";
  let statusDescription = ts?.description ?? "";
  if (rawState === "Hospital" && ts?.until) {
    const s = Math.max(0, ts.until - now);
    statusDescription = `${Math.floor(s / 60)}m ${s % 60}s`;
  } else if (rawState === "Okay" || rawState === "Hospital") {
    statusDescription = rawState;
  }
  const bstatsAge = ffs?.last_updated
    ? new Date(ffs.last_updated * 1000).toLocaleDateString()
    : ffs?.last_updated_relative ?? null;

  return {
    id,
    name: ffs?.name ?? profile?.name ?? String(id),
    level: profile?.level ?? ffs?.level ?? 0,
    rank: ffs?.rank ?? profile?.rank ?? "",
    bstats: ffs?.bs_estimate ?? 0,
    bstats_display: ffs?.bs_estimate_human ?? null,
    fairFight: ffs?.fair_fight ?? null,
    bstats_age: bstatsAge,
    position: ffs?.position ?? profile?.role ?? "",
    status: activity as any,
    statusDescription,
    lastAction: la?.timestamp ?? 0,
    lastActionRelative: la?.relative ?? "",
    activity: activity as any,
    attacks: profile?.attacks_filter?.length ?? 0,
    useref: la?.timestamp ?? 0,
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/faction — Hellfire Club (enemies.json + FFScout + Torn live status)
app.get("/api/faction", async (c) => {
  const userKey = c.req.query("key") || undefined;
  const key = userKey ?? TORN_KEY;
  if (!key) return c.json({ error: "No Torn API key" }, 503);
  try {
    const [ffsMap, profileMap] = await Promise.all([
      fetchFFScout(ENEMY_IDS),
      fetchProfiles(ENEMY_IDS, key),
    ]);
    return c.json(ENEMY_IDS.map((id: number) => mapMember(id, profileMap.get(id), ffsMap.get(id))));
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /api/me
app.get("/api/me", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing key" }, 400);
  try {
    const d = await tornGet<any>(`/v2/user?selections=battlestats`, key);
    return c.json({ id: d.id, name: d.name, bstats: d.battlestats?.total ?? 0 });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500);
  }
});

// GET /api/targets
app.get("/api/targets", async (c) => {
  const userKey = c.req.query("key") || undefined;
  const key = userKey ?? TORN_KEY;
  const ids = sharedTargets.map((t) => t.id);
  if (!ids.length) return c.json([]);
  const [ffsMap, profileMap] = await Promise.all([fetchFFScout(ids), fetchProfiles(ids, key)]);
  return c.json(ids.map((id: number) => mapMember(id, profileMap.get(id), ffsMap.get(id))));
});

// PUT /api/targets/shared
app.put("/api/targets/shared", async (c) => {
  const { ids } = await c.req.json<{ ids: number[] }>();
  const fresh = (ids ?? []).filter((n) => Number.isInteger(n) && n > 0 && !sharedTargets.some((t) => t.id === n));
  sharedTargets.push(...fresh.map((id) => ({ id })));
  return c.json({ ok: true, count: sharedTargets.length });
});

// DELETE /api/targets/shared?id=X
app.delete("/api/targets/shared", async (c) => {
  const id = parseInt(c.req.query("id") ?? "0", 10);
  sharedTargets = sharedTargets.filter((t) => t.id !== id);
  return c.json({ ok: true });
});

// ─── Dev / Prod setup ─────────────────────────────────────────────────────────
if (mode === "production") configureProduction(app);
else await configureDevelopment(app);

const port = process.env.PORT
  ? parseInt(process.env.PORT, 10)
  : mode === "production"
    ? (config.publish?.published_port ?? config.local_port)
    : config.local_port;

export default { fetch: app.fetch, port, idleTimeout: 255 };

function configureProduction(app: Hono) {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.get("/favicon.ico", (c) => c.redirect("/favicon.svg", 302));
  app.use(async (c, next) => {
    if (c.req.method !== "GET") return next();
    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/assets/")) return next();
    const file = Bun.file(`./dist${path}`);
    if (await file.exists()) { const s = await file.stat(); if (s && !s.isDirectory()) return new Response(file); }
    return serveStatic({ path: "./dist/index.html" })(c, next);
  });
}

async function configureDevelopment(app: Hono): Promise<ViteDevServer> {
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    if (c.req.path === "/favicon.ico") return c.redirect("/favicon.svg", 302);
    const url = c.req.path;
    try {
      if (url === "/" || url === "/index.html") {
        let t = await Bun.file("./index.html").text();
        t = await vite.transformIndexHtml(url, t);
        return c.html(t, { headers: { "Cache-Control": "no-store" } });
      }
      const pf = Bun.file(`./public${url}`);
      if (await pf.exists()) { const s = await pf.stat(); if (s && !s.isDirectory()) return new Response(pf, { headers: { "Cache-Control": "no-store" } }); }
      let result;
      try { result = await vite.transformRequest(url); } catch { result = null; }
      if (result) return new Response(result.code, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" } });
      let t = await Bun.file("./index.html").text();
      t = await vite.transformIndexHtml("/", t);
      return c.html(t, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      console.error(err);
      return c.text("Internal Server Error", 500);
    }
  });
  return vite;
}
