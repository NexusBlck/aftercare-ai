import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createTestDb, type TestDb } from "./harness";

/** Runs the pgTAP suite (tests/db/rls.pgtap.sql) against the real migrations in PGlite. */

let t: TestDb;

beforeAll(async () => {
  t = await createTestDb();
  await t.db.exec(readFileSync(join(process.cwd(), "tests", "db", "vendor", "pgtap.sql"), "utf8"));
}, 120_000);

afterAll(async () => {
  await t?.close();
});

it("pgTAP: schema-level security guarantees", async () => {
  const uid = await t.createUser(`pgtap-${Date.now()}@example.test`);
  const sql = readFileSync(join(process.cwd(), "tests", "db", "rls.pgtap.sql"), "utf8").replaceAll(":uid", uid);
  const results = await t.db.exec(sql);
  const tap = results.flatMap((r) => r.rows.map((row) => String(Object.values(row)[0] ?? ""))).filter((l) => /^(not )?ok |^1\.\.|^#/.test(l));
  const failed = tap.filter((l) => l.startsWith("not ok"));
  const passed = tap.filter((l) => l.startsWith("ok"));
  expect(tap.find((l) => l.startsWith("1.."))).toBe("1..31");
  expect(failed, tap.join("\n")).toEqual([]);
  expect(passed).toHaveLength(31);
});
