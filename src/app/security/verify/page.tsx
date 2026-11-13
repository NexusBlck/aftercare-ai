import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthLayout } from "@/components/auth/auth-layout";
import { MfaVerifyForm } from "@/components/auth/mfa-forms";

export const metadata: Metadata = { title: "Two-factor authentication" };

export default function MfaVerifyPage() {
  return (
    <AuthLayout>
      <Suspense>
        <MfaVerifyForm />
      </Suspense>
    </AuthLayout>
  );
}
