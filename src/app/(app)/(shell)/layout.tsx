import { AppShell } from "@/components/app/app-shell";

export default function ShellLayout({ children }: LayoutProps<"/">) {
  return <AppShell>{children}</AppShell>;
}
