import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { SecuritySettings } from "@/components/auth/mfa-forms";

export const metadata: Metadata = { title: "Account security" };

export default function SecurityPage() {
  return (
    <AuthLayout>
      <Suspense>
        <SecuritySettings />
      </Suspense>
    </AuthLayout>
  );
}
