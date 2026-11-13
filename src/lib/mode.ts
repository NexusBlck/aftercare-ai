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
  "/care-team",
  "/clinic",
];

/** Public entry points inside protected areas: they handle signed-out visitors themselves. */
const PUBLIC_EXCEPTIONS = ["/clinic/register", "/clinic/join"];

export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_EXCEPTIONS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return false;
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
