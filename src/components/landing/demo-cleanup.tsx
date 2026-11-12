"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { clearLocalFiles, writeLocalPlan, writeLocalProfile } from "@/lib/client/local-store";

/** After leaving demo mode (/?demo=ended), remove the demo data kept in this browser. */
export function DemoCleanup() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("demo") === "ended") {
      try {
        writeLocalPlan(null);
      } catch {
        // storage unavailable; nothing to clear
      }
      writeLocalProfile({ display_name: null, preferred_language: "en", onboarded: false });
      void clearLocalFiles();
      toast.success("You left demo mode. Demo data was removed from this browser.");
      window.history.replaceState(null, "", "/");
    } else if (params.get("deleted") === "1") {
      toast.success("Your data was deleted.");
      window.history.replaceState(null, "", "/");
    }
  }, []);
  return null;
}
