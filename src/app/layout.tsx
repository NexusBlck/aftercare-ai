import type { Metadata, Viewport } from "next";
import { Inter, Noto_Nastaliq_Urdu, Plus_Jakarta_Sans } from "next/font/google";
import { CookieNotice } from "@/components/legal/cookie-notice";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const body = Inter({ variable: "--font-body", subsets: ["latin"], display: "swap" });
const display = Plus_Jakarta_Sans({ variable: "--font-display", subsets: ["latin"], display: "swap" });
const nastaliq = Noto_Nastaliq_Urdu({ variable: "--font-nastaliq", subsets: ["arabic"], weight: ["400", "600"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: { default: "AFTERCARE AI — Understand your discharge instructions", template: "%s · AFTERCARE AI" },
  description:
    "AFTERCARE AI organizes the discharge documents you bring home into a clear, reviewable recovery plan. An educational tool — not a substitute for your care team.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#14213a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${body.variable} ${display.variable} ${nastaliq.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="top-center" richColors closeButton />
        <CookieNotice />
      </body>
    </html>
  );
}
