import type { Metadata } from "next";
import { AuthLayout } from "@/components/auth/auth-layout";
import { NewPasswordForm } from "@/components/auth/password-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <NewPasswordForm />
    </AuthLayout>
  );
}
