import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import { Hono } from "hono";
import type { TornMember } from "./src/types";
import enemiesData from "./src/data/enemies.json" assert { type: "json" };

const app = new Hono();
const mode: "development" | "production" = process.env.NODE_ENV === "production" ? "production" : "development";

// ─── Config ─────────────────────────────────────────────────────────────────
const TORN_KEY = process.env.TORN_API_KEY ?? "";
const FFSCOUT_KEY = "TmljODt3hutU7dWT";
const CACHE_TTL_MS = 30_000;

// ─── Data ─────────────────────────────────────────────────────────────────
const ENEMY_MAP = new Map<number, any>();
for (const e of enemiesData as any[]) ENEMY_MAP.set(e.id, e);

// ─── Cache ─────────────────────────────────────────────────────────────────
interface CacheEntry { data: any; fetchedAt: number }
const profileCache = new Map<number, CacheEntry>();
function getCached(id: number) {
  const e = profileCache.get(id);
  if (e && Date.now() - e.fetchedAt < CACHE_TTL_MS) return e.data;
  profileCache.delete(id);
  return undefined;
}

// ─── Torn API ─────────────────────────────────────────────────────────────
async function tornGet<T>(path: string): Promise<T> {
  if (!TORN_KEY) throw new Error("No Torn API key");
  const r = await fetch(`https://api.torn.com${path}`, {
    headers: { Authorization: `ApiKey ${TORN_KEY}`, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`Torn ${r.status}`);
  return r.json() as Promise<T>;
}

// ─── FFScout ─────────────────────────────────────────────────────────────
interface FFSResult {
  player_id: number; bs_estimate: number; bs_estimate_human: string;
  fair_fight: number; last_updated_relative: string;
}
async function fetchFFScout(ids: number[]): Promise<Map<number, FFSResult>> {
  const map = new Map<number, FFSResult>();
  const r = await fetch(
    `https://ffscouter.com/api/v1/get-stats?key=${FFSCOUT_KEY}&targets=${ids.join(",")}`
  );
  if (!r.ok) return map;
  const arr: FFSResult[] = await r.json();
  for (const e of arr) map.set(e.player_id, e);
  return map;
}

// ─── Status parser ─────────────────────────────────────────────────────────
function parseTornStatus(p: any) {
  const s = (p as any).status;
  if (!s) return { status: "Unknown", statusDescription: "", activity: "Offline" };
  const cur: string = s.current ?? "";
  const desc: string = s.description ?? "";
  if (cur === "Hospital") return { status: "Hospital", statusDescription: "Hospital", activity: "Hospital" };
  if (cur === "Okay")      return { status: "Okay", statusDescription: "Okay", activity: "Okay" };
  if (cur === "Traveling" || cur === "Abroad") return { status: "Traveling", statusDescription: desc, activity: "Traveling" };
  if (cur === "Idle") return { status: "Idle", statusDescription: desc, activity: "Idle" };
  return { status: "Offline", statusDescription: desc, activity: "Offline" };
}

// ─── Build member list ──────────────────────────────────────────────────────
async function buildMemberList(ids: number[]): Promise<TornMember[]> {
  const [ffsMap, profiles] = await Promise.all([
    fetchFFScout(ids),
    Promise.all(ids.map(async (id) => {
      const cached = getCached(id);
      if (cached) return { id, profile: cached };
      try {
        const profile = await tornGet<any>(`/v2/user/${id}?selections=profile`);
        profileCache.set(id, { data: profile, fetchedAt: Date.now() });
        return { id, profile };
      } catch { return { id, profile: null }; }
    })),
  ]);

  return ids.map((id) => {
    const base = ENEMY_MAP.get(id) ?? { id, name: "Unknown", bstats_display: "?" };
    const ffs = ffsMap.get(id);
    const profile = (profiles.find(p => p.id === id)?.profile) as any;
    const { status, statusDescription, activity } = profile ? parseTornStatus(profile) : { status: "Unknown" as any, statusDescription: "", activity: "Unknown" as any };
    const lastAct = (profile as any)?.last_action;
    return {
      id, name: base.name, level: 0, rank: base.rank ?? "", bstats: ffs?.bs_estimate ?? 0,
      fairFight: ffs?.fair_fight ?? 0, position: "",
      status: status as TornMember["status"], statusDescription,
      lastAction: lastAct?.timestamp ?? 0,
      lastActionRelative: lastAct?.relative ?? ffs?.last_updated_relative ?? "",
      activity: activity as TornMember["activity"], attacks: 0, useref: lastAct?.timestamp ?? 0,
    };
  });
}

// ─── Routes ────────────────────────────────────────────────────────────────
app.get("/api/war-faction", async (c) => {
  try { return c.json(await buildMemberList(Array.from(ENEMY_MAP.keys()))); }
  catch (e) { return c.json({ error: e instanceof Error ? e.message : "Error" }, 500); }
});
app.get("/api/war-targets", async (c) => c.json([]));
app.get("/api/me", async (c) => {
  const key = c.req.query("key");
  if (!key) return c.json({ error: "Missing key" }, 400);
  try {
    const data = await tornGet<any>(`/v2/user?selections=battlestats`);
    return c.json({ id: data.id, name: data.name, bstats: data.battlestats?.total ?? 0 });
  } catch (e) { return c.json({ error: e instanceof Error ? e.message : "Error" }, 500); }
});
app.put("/api/targets/shared", async (c) => {
  const { ids } = await c.req.json<{ ids: number[] }>();
  return c.json({ ok: true });
});

// ─── Mode-specific routing ──────────────────────────────────────────────────
async function configureDev(): Promise<ViteDevServer> {
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: "custom" });
  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    const url = c.req.path;
    if (url === "/" || url === "/index.html") {
      let t = await Bun.file("./index.html").text();
      t = await vite.transformIndexHtml(url, t);
      return c.html(t, { headers: { "Cache-Control": "no-store" } });
    }
    const pf = Bun.file(`./public${url}`);
    if (await pf.exists() && !(await pf.stat()).isDirectory())
      return new Response(pf, { headers: { "Cache-Control": "no-store" } });
    let r; try { r = await vite.transformRequest(url); } catch { r = null; }
    if (r) return new Response(r.code, { headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" } });
    let t = await Bun.file("./index.html").text();
    return c.html(await vite.transformIndexHtml("/", t), { headers: { "Cache-Control": "no-store" } });
  });
  return vite;
}

function configureProd() {
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.use(async (c, next) => {
    if (c.req.method !== "GET") return next();
    const path = c.req.path;
    if (path.startsWith("/api/") || path.startsWith("/assets/")) return next();
    const file = Bun.file(`./dist${path}`);
    if (await file.exists() && !(await file.stat()).isDirectory()) return new Response(file);
    return serveStatic({ path: "./dist/index.html" })(c, next);
  });
}

if (mode === "production") { configureProd(); } else { await configureDev(); }

const PORT = process.env.PORT ? parseInt(process.env.PORT) : (mode === "production" ? 54737 : 56212);
export default { fetch: app.fetch, port: PORT, idleTimeout: 255 };
