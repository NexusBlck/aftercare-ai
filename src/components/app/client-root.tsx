"use client";

import { use, type ReactNode } from "react";
import { browser } from "react-dom";
import { PlanProvider } from "@/hooks/use-plan";

/**
 * The patient's plan lives in browser storage (demo) or is fetched client-side (account), so the
 * app area renders in the browser only. The Suspense fallback is the server HTML.
 */
export function ClientRoot({ children }: { children: ReactNode }) {
  use(browser("Recovery plan data is loaded in the browser."));
  return <PlanProvider>{children}</PlanProvider>;
}
