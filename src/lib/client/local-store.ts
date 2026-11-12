"use client";

import { PlanBundleSchema, ProfileSchema, type PlanBundle, type Profile } from "@/schemas/domain";

/**
 * Demo-mode persistence. Everything stays in this browser: the plan in localStorage and uploaded
 * files in IndexedDB. Reads are validated, and every access is guarded because storage can be
 * unavailable (private windows, blocked site data).
 */

const PLAN_KEY = "aftercare.demo.plan.v1";
const PROFILE_KEY = "aftercare.demo.profile.v1";
const DB_NAME = "aftercare-demo";
const STORE = "files";

export function readLocalPlan(): PlanBundle | null {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return null;
    const parsed = PlanBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeLocalPlan(bundle: PlanBundle | null): void {
  try {
    if (bundle) localStorage.setItem(PLAN_KEY, JSON.stringify(bundle));
    else localStorage.removeItem(PLAN_KEY);
  } catch {
    throw new Error("Your browser blocked local storage, so demo changes cannot be saved.");
  }
}

export type LocalProfile = Profile & { onboarded: boolean };

export function readLocalProfile(): LocalProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const value = JSON.parse(raw) as Record<string, unknown>;
      const parsed = ProfileSchema.safeParse(value);
      if (parsed.success) return { ...parsed.data, onboarded: value.onboarded === true };
    }
  } catch {
    // ignore
  }
  return { display_name: null, preferred_language: "en", onboarded: false };
}

export function writeLocalProfile(profile: LocalProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // Non-critical: the preference simply won't persist.
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

export async function putLocalFile(id: string, blob: Blob): Promise<void> {
  await tx("readwrite", (s) => s.put(blob, id));
}

export async function getLocalFile(id: string): Promise<Blob | null> {
  try {
    return ((await tx("readonly", (s) => s.get(id))) as Blob | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function deleteLocalFile(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    // ignore
  }
}

export async function clearLocalFiles(): Promise<void> {
  try {
    await tx("readwrite", (s) => s.clear());
  } catch {
    // ignore
  }
}
