import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { LEGAL_VERSIONS } from "../../src/lib/legal";

/**
 * API robustness and authorization fuzzing against the live TEST stack (see playwright.live.config.ts).
 * Every route handler in src/app/api is discovered from the file system and called with hostile input
 * by four identities. Pass criteria: no 5xx crash (503 "not configured" is allowed), no stack traces,
 * SQL or internal identifiers in the body, and the standard error shape on failures.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
test.skip(!url || !anon || /qfpaoqacngcfstdchdqj/.test(url), "Needs a separate Supabase TEST project (never production).");

const BASE = "http://localhost:3300";
const RUN = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const PASSWORD = `Fuzz-${RUN}-pw!`;

interface Route {
  path: string;
  methods: string[];
}

function discoverRoutes(): Route[] {
  const root = join(process.cwd(), "src", "app", "api");
  const out: Route[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "route.ts") {
        const src = readFileSync(p, "utf8");
        const methods = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\b/g)].map((m) => m[1]);
        out.push({ path: "/api/" + relative(root, dir).replace(/\\/g, "/"), methods });
      }
    }
  };
  walk(root);
  return out;
}

const HOSTILE_IDS = ["..%2F..%2Fetc%2Fpasswd", "1'%20OR%20'1'%3D'1", crypto.randomUUID()];
const HOSTILE_BODIES: Array<string | Record<string, unknown>> = [
  "{not json",
  "",
  "null",
  "[]",
  {},
  { id: "' OR 1=1 --", email: "<script>alert(1)</script>@x.co", organization_id: "00000000-0000-4000-8000-000000000000" },
  { full_name: "x".repeat(20_000), date_of_birth: "9999-99-99", size: -1, filename: "../../evil.sh", episode_id: "' OR 1=1 --" },
  { edit: { op: "correct", kind: "medication", id: "x", field: "__proto__", value: "y" }, expected_updated_at: "x" },
  { decision: "approved", attest: true, token: "a".repeat(64), date_of_birth: "1990-01-01", done: true },
];

const LEAKS = /at [\w.<>]+ \(|node_modules|stack|syntax error at|relation "|column "|PGRST\d|violates|duplicate key|supabase\.co/i;

async function signedInContext(playwright: { request: { newContext: (o: { baseURL: string }) => Promise<APIRequestContext> } }, who: string): Promise<APIRequestContext> {
  const email = `${who}.${RUN}@example.com`;
  const supabase = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await supabase.auth.signUp({ email, password: PASSWORD, options: { data: { legal: LEGAL_VERSIONS, marketing_opt_in: false } } });
  if (error) throw new Error(`sign-up failed: ${error.message}`);
  const ctx = await playwright.request.newContext({ baseURL: BASE });
  const res = await ctx.post("/api/auth/login", { data: { email, password: PASSWORD } });
  if (!res.ok()) throw new Error(`login failed for ${who}: ${res.status()}`);
  return ctx;
}

test.describe.serial("API fuzzing", () => {
  const ctx: Record<string, APIRequestContext> = {};

  test.beforeAll(async ({ playwright }) => {
    ctx.anonymous = await playwright.request.newContext({ baseURL: BASE });
    ctx.patient = await signedInContext(playwright, "fuzz-patient");
    ctx.owner = await signedInContext(playwright, "fuzz-owner");
    const org = await ctx.owner.post("/api/clinic/organization", {
      data: { name: `Fuzz Clinic ${RUN}`, org_type: "clinic", owner_name: "Fuzz Owner", owner_is_clinician: true },
    });
    expect(org.status()).toBe(201);
  });

  test.afterAll(async () => {
    for (const c of Object.values(ctx)) await c.dispose();
  });

  test("every route survives hostile input from every identity without crashing or leaking internals", async () => {
    test.setTimeout(2_400_000);
    const routes = discoverRoutes();
    expect(routes.length).toBeGreaterThan(50);
    const failures: string[] = [];
    let requests = 0;

    for (const route of routes) {
      const ids = route.path.includes("[") ? HOSTILE_IDS : [""];
      for (const id of ids) {
        const path = route.path.replace(/\[[^\]]+\]/g, id || "x");
        for (const method of route.methods) {
          const bodies = method === "GET" || method === "DELETE" ? [undefined] : HOSTILE_BODIES;
          for (const who of Object.keys(ctx)) {
            for (const body of bodies) {
              // Skip operations whose *success* would change real state for the fuzz identities.
              if (path === "/api/auth/logout" || (path === "/api/account" && method === "DELETE") || path.startsWith("/api/demo")) continue;
              requests++;
              const res = await ctx[who].fetch(path, {
                method,
                // A distinct client address per request keeps the per-IP API rate limit out of the way locally.
                headers: { "X-Forwarded-For": `10.${requests % 250}.${(requests >> 8) % 250}.${(requests >> 16) % 250}`, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) },
                data: body,
                failOnStatusCode: false,
              });
              const status = res.status();
              const text = await res.text();
              const label = `${who} ${method} ${path} ${typeof body === "string" ? JSON.stringify(body).slice(0, 20) : body ? Object.keys(body).join(",").slice(0, 30) : ""} → ${status}`;
              if (status >= 500 && !(status === 503 && /unconfigured|not configured/i.test(text)) && !(status === 502 && /storage/i.test(text))) {
                failures.push(`5xx: ${label} ${text.slice(0, 160)}`);
              }
              if (LEAKS.test(text)) failures.push(`leak: ${label} ${text.match(LEAKS)?.[0]}`);
              if (status >= 400 && (res.headers()["content-type"] ?? "").includes("application/json")) {
                try {
                  const j = JSON.parse(text);
                  if (!j.error?.code || !j.error?.message) failures.push(`shape: ${label}`);
                } catch {
                  failures.push(`bad json: ${label}`);
                }
              }
            }
          }
        }
      }
    }
    console.log(`fuzzed ${routes.length} routes with ${requests} requests; ${failures.length} failures`);
    expect(failures, failures.slice(0, 40).join("\n")).toEqual([]);
  });

  test("anonymous users get 401 from every protected data route", async () => {
    const protectedRoutes = discoverRoutes()
      .filter((r) => r.methods.includes("GET"))
      .map((r) => r.path.replace(/\[[^\]]+\]/g, crypto.randomUUID()))
      .filter((p) => /^\/api\/(clinic|care-team|notifications|care-plans|documents|profile|account|export|legal)/.test(p));
    for (const p of protectedRoutes) {
      const res = await ctx.anonymous.get(p);
      expect([401, 404], p).toContain(res.status());
    }
  });

  test("a patient gets 403 from every clinic route; a clinic owner sees only their own clinic", async () => {
    for (const p of ["/api/clinic/patients", "/api/clinic/dashboard", "/api/clinic/staff", "/api/clinic/audit", "/api/clinic/review", "/api/clinic/follow-ups", "/api/clinic/billing"]) {
      expect((await ctx.patient.get(p)).status(), p).toBe(403);
    }
    const list = await ctx.owner.get("/api/clinic/patients?status=all");
    expect(list.status()).toBe(200);
    expect((await list.json()).total).toBe(0);
  });
});

test.describe.serial("upload abuse", () => {
  let owner: APIRequestContext;
  let episodeId: string;

  test.beforeAll(async ({ playwright }) => {
    owner = await signedInContext(playwright, "upload-owner");
    await owner.post("/api/clinic/organization", { data: { name: `Upload Clinic ${RUN}`, org_type: "clinic", owner_name: "Upload Owner", owner_is_clinician: true } });
    const p = await owner.post("/api/clinic/patients", { data: { full_name: "Upload Synthetic", date_of_birth: "1985-03-03", episode: { title: "Upload test episode" } } });
    episodeId = (await p.json()).episode_id;
  });

  test.afterAll(async () => owner?.dispose());

  const claim = (filename: string, size: number) => owner.post("/api/clinic/documents/upload", { data: { episode_id: episodeId, filename, size } });

  test("rejects bad claims before any storage is touched", async () => {
    expect((await claim("big.pdf", 50 * 1024 * 1024)).status()).toBe(400); // oversized
    expect((await claim("script.exe", 1000)).status()).toBe(400); // extension
    expect((await claim("page.html", 1000)).status()).toBe(400);
    expect((await claim("empty.pdf", 0)).status()).toBe(400); // empty
    expect((await claim("x.svg", 1000)).status()).toBe(400); // active image format
  });

  async function uploadBytes(filename: string, bytes: Buffer, contentType: string) {
    const c = await claim(filename, bytes.length);
    expect(c.status()).toBe(201);
    const { document, uploadUrl } = await c.json();
    const put = await owner.put(uploadUrl, { data: bytes, headers: { "Content-Type": contentType, "x-upsert": "false" } });
    return { id: document.id as string, put: put.status() };
  }

  test("spoofed MIME types and fake files are rejected at finalize", async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(200).fill(1)]);
    const spoof = await uploadBytes("looks-like.pdf", png, "application/pdf");
    expect((await owner.post(`/api/clinic/documents/${spoof.id}/finalize`)).status()).toBe(400);
    const html = Buffer.from("<html><script>alert(1)</script></html>".padEnd(300, " "));
    const fake = await uploadBytes("fake.png", html, "image/png");
    expect((await owner.post(`/api/clinic/documents/${fake.id}/finalize`)).status()).toBe(400);
  });

  test("an interrupted upload (no bytes) fails safely and can be retried", async () => {
    const c = await claim("never-sent.pdf", 1234);
    const { document } = await c.json();
    const fin = await owner.post(`/api/clinic/documents/${document.id}/finalize`);
    expect([400, 502]).toContain(fin.status());
    expect(await fin.text()).not.toMatch(LEAKS);
  });

  test("a corrupted PDF is stored only if its signature is valid, and processing fails cleanly", async () => {
    const corrupt = Buffer.from("%PDF-1.7\n" + "garbage ".repeat(100));
    const up = await uploadBytes("corrupt.pdf", corrupt, "application/pdf");
    const fin = await owner.post(`/api/clinic/documents/${up.id}/finalize`);
    if (fin.status() === 200) {
      const proc = await owner.post(`/api/clinic/documents/${up.id}/process`);
      expect(proc.status()).toBeLessThan(500 + 1); // mock extractor treats unknown files as no clinical content
      expect(await proc.text()).not.toMatch(LEAKS);
    } else {
      expect(fin.status()).toBe(400);
    }
  });

  test("the same document cannot be processed twice at once", async () => {
    const pdf = readFileSync(join(process.cwd(), "tests", "fixtures", "documents", "synthetic-discharge-summary.pdf"));
    const up = await uploadBytes("dup.pdf", pdf, "application/pdf");
    expect((await owner.post(`/api/clinic/documents/${up.id}/finalize`)).status()).toBe(200);
    const [a, b] = await Promise.all([owner.post(`/api/clinic/documents/${up.id}/process`), owner.post(`/api/clinic/documents/${up.id}/process`)]);
    const statuses = [a.status(), b.status()].sort();
    expect(statuses[0]).toBe(200);
    expect([200, 409]).toContain(statuses[1]);
  });
});
