import type { Metadata } from "next";

export const metadata: Metadata = { title: "Register your clinic · AFTERCARE AI" };

export default function Layout({ children }: LayoutProps<"/clinic/register">) {
  return children;
}
