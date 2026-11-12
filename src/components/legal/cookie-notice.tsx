"use client";

import { Cookie } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "aftercare.cookie-notice";

/**
 * Informational notice. AFTERCARE AI sets only strictly necessary cookies and storage (sign-in,
 * demo mode) and has no analytics or trackers, so there is nothing to opt in to. If optional
 * cookies are ever added they must be gated behind consent here before they load.
 */
export function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(KEY) === "1";
    } catch {
      dismissed = false;
    }
    if (!dismissed) {
      const t = setTimeout(() => setVisible(true), 0);
      return () => clearTimeout(t);
    }
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      // Storage blocked: the notice will show again next visit.
    }
    setVisible(false);
  };

  return (
    <div role="region" aria-label="Cookie notice" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-2xl border bg-card p-4 shadow-lg sm:inset-x-6 lg:bottom-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Cookie className="hidden size-5 shrink-0 text-teal sm:block" aria-hidden />
        <p className="flex-1 text-sm text-foreground">
          We use only essential cookies and browser storage to keep you signed in and run demo mode. No analytics, ads or tracking.{" "}
          <Link href="/privacy#cookies" className="font-medium underline underline-offset-2">
            Details
          </Link>
        </p>
        <Button size="sm" onClick={dismiss}>
          OK
        </Button>
      </div>
    </div>
  );
}
