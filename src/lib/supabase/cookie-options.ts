/**
 * Session cookie attributes for Supabase auth cookies. Sign-in happens on the server, so the
 * browser never needs to read the session: cookies are HttpOnly (unreadable by page scripts),
 * Secure in production (HTTPS only) and SameSite=Lax (not sent on cross-site POSTs).
 */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 7,
};
