import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { pseudonymize } from "@/lib/security/audit-log";

/**
 * Transactional email over SMTP (for example Gmail with an App Password). Credentials come only
 * from server environment variables and are never sent to the browser.
 *
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465  SMTP_USER=you@gmail.com  SMTP_PASS=<app password>
 *   MAIL_FROM="AFTERCARE AI <you@gmail.com>"
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export function smtpConfig(env: Record<string, string | undefined> = process.env): SmtpConfig | null {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.replace(/\s+/g, ""); // Google shows App Passwords with spaces
  if (!host || !user || !pass) return null;
  const port = Number(env.SMTP_PORT ?? 465);
  return { host, port: Number.isFinite(port) ? port : 465, user, pass, from: env.MAIL_FROM?.trim() || `AFTERCARE AI <${user}>` };
}

let transporter: { key: string; t: Transporter } | null = null;

function getTransport(cfg: SmtpConfig): Transporter {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (!transporter || transporter.key !== key) {
    transporter = {
      key,
      t: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465, // implicit TLS on 465; STARTTLS is required on 587
        requireTLS: cfg.port !== 465,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 8_000,
        greetingTimeout: 8_000,
        socketTimeout: 10_000,
      }),
    };
  }
  return transporter.t;
}

export type SendResult = { sent: true } | { sent: false; reason: "not_configured" | "failed" };

/** Sends an email. Never throws: email problems must not break sign-up or other flows. */
export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const cfg = smtpConfig();
  if (!cfg) return { sent: false, reason: "not_configured" };
  try {
    await getTransport(cfg).sendMail({ from: cfg.from, to: message.to, subject: message.subject, html: message.html, text: message.text });
    return { sent: true };
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "email",
        type: "send_failed",
        to: pseudonymize(message.to),
        code: (err as { code?: string }).code ?? null,
        responseCode: (err as { responseCode?: number }).responseCode ?? null,
      }),
    );
    return { sent: false, reason: "failed" };
  }
}
