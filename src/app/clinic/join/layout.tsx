import type { Metadata } from "next";

export const metadata: Metadata = { title: "Join your clinic team · AFTERCARE AI", referrer: "no-referrer" };

export default function Layout({ children }: LayoutProps<"/clinic/join">) {
  return children;
}
