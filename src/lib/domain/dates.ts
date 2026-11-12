import { format, parseISO } from "date-fns";

/**
 * Date-only clinical instructions are handled as plain "YYYY-MM-DD" strings so they never pick up
 * an invented time or shift across time zones.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth && y >= 1900 && y <= 2200;
}

export function isValidTime(value: string | null | undefined): value is string {
  if (!value) return false;
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  return !!m && Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** Today's calendar date in the user's local time zone. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Adds whole days to an ISO date (used only to build synthetic demo documents). */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/** "12 Nov 2026" — date-only, rendered without any time component. */
export function formatDateOnly(iso: string | null | undefined): string {
  if (!isValidIsoDate(iso)) return "Date not stated";
  return format(parseISO(iso), "d MMM yyyy");
}

export function formatLongDate(iso: string): string {
  return format(parseISO(iso), "EEEE, d MMMM yyyy");
}

export function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return "";
  return format(new Date(ts), "d MMM yyyy, HH:mm");
}

export function daysBetween(fromIso: string, toIso: string): number {
  const [a, b] = [fromIso, toIso].map((iso) => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  });
  return Math.round((b - a) / 86_400_000);
}
