"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ClinicRole, Permission } from "@/lib/clinic/permissions";
import { useApi } from "./use-api";

export interface Entitlements {
  plan: "starter" | "professional" | "enterprise";
  status: string;
  trial_ends_at: string | null;
  active: boolean;
  limits: Record<string, number | boolean | null>;
  usage: Record<string, number>;
}

export interface ClinicMe {
  user: { id: string; email: string | null };
  memberships: Array<{ organization_id: string; name: string; role: ClinicRole }>;
  active: null | {
    organization: {
      id: string;
      name: string;
      slug: string;
      org_type: string;
      city: string | null;
      address: string | null;
      contact_email: string | null;
      contact_phone: string | null;
      communication_hours: string | null;
      emergency_instructions: string | null;
    };
    member: { id: string; role: ClinicRole; clinical_reviewer: boolean; display_name: string | null };
    permissions: Permission[];
    entitlements: Entitlements;
  };
}

interface ClinicContextValue {
  me: ClinicMe;
  can: (permission: Permission) => boolean;
  refresh: () => Promise<void>;
}

const Ctx = createContext<ClinicContextValue | null>(null);

export function ClinicProvider({ me, refresh, children }: { me: ClinicMe; refresh: () => Promise<void>; children: ReactNode }) {
  const permissions = new Set(me.active?.permissions ?? []);
  return <Ctx.Provider value={{ me, refresh, can: (p) => permissions.has(p) }}>{children}</Ctx.Provider>;
}

export function useClinic(): ClinicContextValue & { active: NonNullable<ClinicMe["active"]> } {
  const value = useContext(Ctx);
  if (!value?.me.active) throw new Error("useClinic must be used inside an active clinic");
  return { ...value, active: value.me.active };
}

export function useClinicMe() {
  return useApi<ClinicMe>("/api/clinic/me");
}
