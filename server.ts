import { serveStatic } from "hono/bun";
import type { ViteDevServer } from "vite";
import { createServer as createViteServer } from "vite";
import config from "./zosite.json";
import { Hono } from "hono";
import type { TornMember, SharedTarget } from "./src/types";

type Mode = "development" | "production";
const app = new Hono();

const mode: Mode =
  process.env.NODE_ENV === "production" ? "production" : "development";

// ─── In-memory shared targets store ───────────────────────────────────────
let sharedTargets: SharedTarget[] = [];

const TORN_API = "https://api.torn.com";
// Server-side Torn API key (provided by app owner)
const SERVER_API_KEY = process.env.TORN_API_KEY ?? "";

// ─── Torn API proxy ─────────────────────────────────────────────────────────
async function fetchTorn<T>(path: string, apiKey?: string): Promise<T> {
  const key = apiKey ?? SERVER_API_KEY;
  if (!key) throw new Error("No API key configured");
  const res = await fetch(`${TORN_API}${path}`, {
    headers: {
      accept: "application/json",
      "Authorization": `ApiKey ${key}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Torn API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Map Torn v2 player to our internal shape ─────────────────────────────────
function mapPlayer(p: any, acts: any): TornMember {
  const now = Math.floor(Date.now() / 1000);
  const status = p.status?.current ?? "Offline";
  const until = p.status?.until ?? 0;
  const lastAction = p.last_action?.timestamp ?? 0;
  const lastActionRelative = p.last_action?.relative ?? "";
  const actsMap: Record<string, string> = {
    Online: "Online",
    Offline: "Offline",
    Idle: "Idle",
    Hospital: "Hospital",
    Traveling: "Traveling",
    "In jail": "In jail",
    "In federal": "In federal",
  };
  const activity = actsMap[status] ?? "Offline";

  let statusDescription = "";
  if (status === "Hospital" && until > now)
    statusDescription = `${Math.max(0, until - now)}s`;
  else if (status === "Traveling" || status === "Abroad")
    statusDescription = p.status?.description ?? "";
  else if (status === "Okay")
    statusDescription = "Okay";
  else
    statusDescription = status;

  return {
    id: p.id,
    name: p.name ?? "Unknown",
    level: p.level ?? 0,
    rank: p.rank ?? "",
    bstats: p.battlestats?.total ?? 0,
    position: p.role ?? "",
    status: status as TornMember["status"],
    statusDescription,
    lastAction,
    lastActionRelative,
    activity: activity as TornMember["activity"],
    attacks: p.attacks?.filter?.length ?? 0,
    useref: p.last_action?.timestamp ?? 0,
  };
}

// ─── GET /api/faction?id=X ───────────────────────────────────────────────────
app.get("/api/faction", async (c) => {
  const apiKey = c.req.query("key") || undefined;
  if (!SERVER_API_KEY && !apiKey) {
    return c.json({ error: "No API key configured on server" }, 503);
  }
  try {
    const factionId = c.req.query("id") || "2948845"; // default Hellfire Club
    const data = await fetchTorn<any>(
      `/v2/faction/${factionId}?selections=basic,profile`,
      apiKey
    );
    const members: TornMember[] = (data.employees?.slice ?? []).map((p: any) =>
      mapPlayer(p, null)
    );
    return c.json(members);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: msg }, 500);
  }
});

// ─── GET /api/targets ────────────────────────────────────────────────────────
app.get("/api/targets", async (c) => {
  const targets = sharedTargets.map((t) => t.id);
  if (targets.length === 0) return c.json([]);
  try {
    const results = await Promise.all(
      targets.map((id) =>
        fetchTorn<any>(`/v2/user/${id}?selections=profile`, undefined).catch(
          () => null
        )
      )
    );
    const members = results
      .filter(Boolean)
      .map((p) => mapPlayer(p, null));
    return c.json(members);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return c.json({ error: msg }, 500);
  }
});

// ─── PUT /api/targets/shared ────────────────────────────────────────────────
app.put("/api/targets/shared", async (c) => {
  const body = await c.req.json<{ ids: number[] }>();
  const ids = (body.ids ?? [])
    .filter((n) => Number.isInteger(n) && n > 0)
    .filter((id) => !sharedTargets.some((t) => t.id === id));
  sharedTargets.push(...ids.map((id) => ({ id })));
  return c.json({ ok: true, count: sharedTargets.length });
});

// ─── DELETE /api/targets/shared?id=X ─────────────────────────────────────────
app.delete("/api/targets/shared", async (c) => {
  const id = parseInt(c.req.query("id") ?? "0", 10);
  sharedTargets = sharedTargets.filter((t) => t.id !== id);
  return c.json({ ok: true });
});

// ─── GET /api/me ─────────────────────────────────────────────────────────────
app.get("/api/me", async (c) => {
  const apiKey = c.req.query("key");
  if (!apiKey) return c.json({ error: "Missing API key" }, 400);
  try {
    const data = await fetchTorn<any>("/v2/user?selections=battlestats", apiKey);
    return c.json({
      id: data.id,
      name: data.name,
      bstats: data.battlestats?.total ?? 0,
    });
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
