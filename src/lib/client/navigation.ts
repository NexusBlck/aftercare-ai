"use client";

/**
 * Full page load, for every change of signed-in identity (sign-in, sign-up, sign-out, account deletion,
 * joining a clinic). With Cache Components, client navigations keep recent routes alive in hidden
 * <Activity> trees, so a soft navigation would carry the previous person's form drafts and loaded data
 * into the next session. A document load discards all of it.
 */
export function navigateFresh(path: string): void {
  window.location.assign(path);
}
