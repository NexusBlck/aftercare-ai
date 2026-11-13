import type { Metadata } from "next";

export const metadata: Metadata = { title: "Your care team invited you · AFTERCARE AI", referrer: "no-referrer" };

export default function Layout({ children }: LayoutProps<"/invitation">) {
  return children;
}
