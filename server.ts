import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";
import type { TornMember, SharedTarget } from "./src/types";
import enemyList from "./src/data/enemies.json";

type Mode = "development" | "production";
const app = new Hono();

const mode: Mode =
  process.env.NODE_ENV === "production" ? "production" : "development";

// ─── In-memory shared targets store ───────────────────────────────────────
let sharedTargets: SharedTarget[] = [];

// ─── External API keys ─────────────────────────────────────────────────────
const TORN_API_KEY = process.env.torn_api_key ?? "";
const FFSCOUT_KEY  = "TmljODt3hutU7dWT";

const TORN_API    = "https://api.torn.com";
const FFSCOUT_API = "https://ffscouter.com/api/v1";

// ─── FFScout: get battle stats for one player ──────────────────────────────
async function fetchFFScoutPlayer(
  playerId: number,
  signal?: AbortSignal
): Promise<{ bstats: number; bstatsDisplay: string; fairFight: number; age: string | null } | null> {
  try {
    const res = await fetch(
      `${FFSCOUT_API}/get-stats?key=${FFSCOUT_KEY}&targets=${playerId}`,
      { signal, headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const d = await res.json() as any;
    if (!Array.isArray(d) || d.length === 0 || d[0].error) return null;

    const bsData = d[0];
    const bs = bsData.bs_estimate ?? 0;

    let display = bsData.bs_estimate_human ?? "";
    if (!display) {
      if (bs >= 1e12) display = (bs / 1e12).toFixed(2).replace(/\.00$/,"").replace(/\.0$/,"") + "t";
      else if (bs >= 1e9)  display = (bs / 1e9).toFixed(2).replace(/\.00$/,"").replace(/\.0$/,"") + "b";
      else if (bs >= 1e6)  display = (bs / 1e6).toFixed(2).replace(/\.00$/,"").replace(/\.0$/,"") + "m";
      else if (bs >= 1e3)  display = (bs / 1e3).toFixed(1).replace(/\.0$/,"") + "k";
      else display = String(bs | 0);
    }

    return {
      bstats: bs,
      bstatsDisplay: display,
      fairFight: bsData.fair_fight ?? 0,
      age: bsData.last_updated ? new Date(bsData.last_updated * 1000).toLocaleDateString() : null,
    };
  } catch {
    return null;
  }
}

// ─── Torn: get online/activity status ─────────────────────────────────────
async function fetchTornStatus(playerId: number): Promise<Partial<TornMember>> {
  if (!TORN_API_KEY) return {};
  try {
    const res = await fetch(
      `${TORN_API}/v2/user/${playerId}?selections=profile`,
      { headers: { Authorization: `ApiKey ${TORN_API_KEY}`, Accept: "application/json" } }
    );
    if (!res.ok) return {};
    const d = await res.json() as any;
    if (d.error) return {};
    const p = d;
    const now = Math.floor(Date.now() / 1000);
    return {
      name: p.name,
      level: p.level ?? 0,
      rank: p.rank ?? "",
      status: (p.status?.current ?? "Offline") as TornMember["status"],
      statusDescription: p.status?.description ?? "",
      lastAction: p.last_action?.timestamp ?? 0,
      lastActionRelative: p.last_action?.relative ?? "",
      activity: p.status?.current ?? "Offline",
    };
  } catch {
    return {};
  }
}

// ─── GET /api/faction ───────────────────────────────────────────────────────
// Serves the hardcoded enemy list enriched via FFScout (battle stats) + Torn (status)
app.get("/api/faction", async (c) => {
  const force = c.req.query("refresh") === "1";

  // Cache in-module for 5 minutes (race-condition safe for hot reload)
  if (!force && (app as any)._factionCache && Date.now() < (app as any)._factionCacheExpiry) {
    return c.json((app as any)._factionCache);
  }

  try {
    const members: TornMember[] = [];

    for (const base of enemyList as any[]) {
      const playerId = base.id;

      // Fetch status + bstats in parallel
      const [tornData, ffsData] = await Promise.all([
        fetchTornStatus(playerId),
        fetchFFScoutPlayer(playerId),
      ]);

      members.push({
        id: playerId,
        name: tornData.name ?? base.name ?? "Unknown",
        level: tornData.level ?? base.level ?? 0,
        rank: tornData.rank ?? "",
        bstats: ffsData?.bstats ?? base.bstats ?? 0,
        bstatsDisplay: ffsData?.bstatsDisplay ?? base.bstats_display ?? "0",
        fairFight: ffsData?.fairFight ?? base.fair_fight ?? 0,
        bstatsAge: ffsData?.age ?? base.bstats_age ?? null,
        position: tornData.position ?? "",
        status: tornData.status ?? (base.status as TornMember["status"]) ?? "Offline",
        statusDescription: tornData.statusDescription ?? base.statusDescription ?? "Unknown",
        lastAction: tornData.lastAction ?? 0,
        lastActionRelative: tornData.lastActionRelative ?? base.lastActionRelative ?? "",
        activity: (tornData.activity ?? "Offline") as TornMember["activity"],
        attacks: tornData.attacks ?? 0,
        useref: tornData.lastAction ?? 0,
      });
    }

    const result = members;
    (app as any)._factionCache = result;
    (app as any)._factionCacheExpiry = Date.now() + 5 * 60 * 1000;
    return c.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: msg }, 500);
  }
});

// ─── GET /api/targets ───────────────────────────────────────────────────────
app.get("/api/targets", async (c) => {
  const targets = sharedTargets.map((t) => t.id);
  if (targets.length === 0) return c.json([]);

  const results = await Promise.all(
    targets.map(async (id) => {
      const [ffs, torn] = await Promise.all([
        fetchFFScoutPlayer(id),
        fetchTornStatus(id),
      ]);
      return {
        id,
        name: torn.name ?? "Unknown",
        level: torn.level ?? 0,
        rank: torn.rank ?? "",
        bstats: ffs?.bstats ?? 0,
        bstatsDisplay: ffs?.bstatsDisplay ?? "0",
        fairFight: ffs?.fairFight ?? 0,
        bstatsAge: ffs?.age ?? null,
        status: torn.status ?? "Offline",
        statusDescription: torn.statusDescription ?? "Unknown",
        lastAction: torn.lastAction ?? 0,
        lastActionRelative: torn.lastActionRelative ?? "",
        activity: torn.activity ?? "Offline",
        attacks: 0,
        useref: torn.lastAction ?? 0,
      };
    })
  );

  return c.json(results.filter((r) => r.name !== "Unknown"));
});

// ─── PUT /api/targets/shared ───────────────────────────────────────────────
app.put("/api/targets/shared", async (c) => {
  const body = await c.req.json<{ ids: number[] }>();
  const ids = (body.ids ?? [])
    .filter((n) => Number.isInteger(n) && n > 0)
    .filter((id) => !sharedTargets.some((t) => t.id === id));
  sharedTargets.push(...ids.map((id) => ({ id })));
  return c.json({ ok: true, count: sharedTargets.length });
});

// ─── DELETE /api/targets/shared?id=X ────────────────────────────────────────
app.delete("/api/targets/shared", async (c) => {
  const id = parseInt(c.req.query("id") ?? "0", 10);
  sharedTargets = sharedTargets.filter((t) => t.id !== id);
  return c.json({ ok: true });
});

// ─── GET /api/me ────────────────────────────────────────────────────────────
app.get("/api/me", async (c) => {
  const apiKey = c.req.query("key");
  if (!apiKey) return c.json({ error: "Missing API key" }, 400);
  try {
    const res = await fetch(`${TORN_API}/v2/user?selections=battlestats`, {
      headers: { Authorization: `ApiKey ${apiKey}`, Accept: "application/json" },
    });
    const d = await res.json() as any;
    if (d.error) return c.json({ error: d.error }, 400);
    return c.json({ id: d.id, name: d.name, bstats: d.battlestats?.total ?? 0 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: msg }, 500);
  }
});

if (mode === "production") {
  configureProduction(app);
} else {
  await configureDevelopment(app);
}

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
    if (await file.exists()) {
      const stat = await file.stat();
      if (stat && !stat.isDirectory()) return new Response(file);
    }
    return serveStatic({ path: "./dist/index.html" })(c, next);
  });
}

async function configureDevelopment(app: Hono): Promise<ViteDevServer> {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: "custom",
  });

  app.use("*", async (c, next) => {
    if (c.req.path.startsWith("/api/")) return next();
    if (c.req.path === "/favicon.ico") return c.redirect("/favicon.svg", 302);
    const url = c.req.path;
    try {
      if (url === "/" || url === "/index.html") {
        let template = await Bun.file("./index.html").text();
        template = await vite.transformIndexHtml(url, template);
        return c.html(template, { headers: { "Cache-Control": "no-store" } });
      }
      const publicFile = Bun.file(`./public${url}`);
      if (await publicFile.exists()) {
        const stat = await publicFile.stat();
        if (stat && !stat.isDirectory())
          return new Response(publicFile, { headers: { "Cache-Control": "no-store" } });
      }
      let result;
      try { result = await vite.transformRequest(url); } catch { result = null; }
      if (result) {
        return new Response(result.code, {
          headers: { "Content-Type": "application/javascript", "Cache-Control": "no-store" },
        });
      }
      let template = await Bun.file("./index.html").text();
      template = await vite.transformIndexHtml("/", template);
      return c.html(template, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      console.error(error);
      return c.text("Internal Server Error", 500);
    }
  });

  return vite;
}
