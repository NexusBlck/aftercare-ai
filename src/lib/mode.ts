/** Cookie that marks a browser as using the synthetic demo. It carries no personal data. */
export const DEMO_COOKIE = "aftercare_demo";

export const PROTECTED_PREFIXES = [
  "/dashboard",
  "/documents",
  "/review",
  "/recovery-plan",
  "/medications",
  "/appointments",
  "/settings",
  "/onboarding",
];

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
