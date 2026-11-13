"use client";

import { useEffect, useSyncExternalStore } from "react";

const TOKEN = /^[0-9a-f]{64}$/;

function read(storageKey: string): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("t");
  if (fromHash && TOKEN.test(fromHash)) return fromHash;
  try {
    const stored = sessionStorage.getItem(storageKey);
    return stored && TOKEN.test(stored) ? stored : null;
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

/**
 * Reads a one-time invitation token from the URL fragment (`#t=…`). Fragments are never sent to the
 * server or written to access logs. The token is kept in sessionStorage so it survives the sign-in
 * round trip, and removed from the address bar immediately. Returns `undefined` until mounted.
 */
export function useTokenFromHash(storageKey: string): string | null | undefined {
  const token = useSyncExternalStore(noopSubscribe, () => read(storageKey), () => undefined);

  useEffect(() => {
    const value = read(storageKey);
    try {
      if (value) sessionStorage.setItem(storageKey, value);
    } catch {
      // storage unavailable: the token still works for this page view
    }
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [storageKey]);

  return token;
}

export function clearStoredToken(storageKey: string) {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    // storage unavailable
  }
}
