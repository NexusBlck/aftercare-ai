import { LEGAL } from "@/lib/legal";

/** Escapes text for safe inclusion in HTML email. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const NAVY = "#14213a";
const TEAL = "#0f766e";
const MUTED = "#5b6475";

const DISCLAIMER =
  "AFTERCARE AI organizes the instructions your care team gave you. It is not medical advice. In an emergency, call your local emergency number.";
const DISCLAIMER_HTML = `<p style="margin:20px 0 0;padding:14px 16px;background:#fdf2f2;border-radius:10px;font-size:13px;line-height:1.55;color:#7a1f1f;">${DISCLAIMER}</p>`;

function button(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;"><tr><td style="border-radius:10px;background:${NAVY};">
            <a href="${escapeHtml(href)}" style="display:inline-block;padding:14px 24px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
          </td></tr></table>`;
}

function legalLine(privacy: string): string {
  const operator = LEGAL.operatorName ?? "AFTERCARE AI";
  return `<a href="${escapeHtml(privacy)}" style="color:${MUTED};">Privacy Policy</a> · ${escapeHtml(operator)}${LEGAL.country ? `, ${escapeHtml(LEGAL.country)}` : ""}`;
}

/** The branded frame shared by every email. `body` and `footer` are trusted HTML built from escaped parts. */
function layout({ title, preheader, body, footer }: { title: string; preheader: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f6f5f1;font-family:Arial,Helvetica,sans-serif;color:${NAVY};">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f5f1;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e3dc;">
        <tr><td style="background:${NAVY};padding:22px 28px;">
          <span style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">AFTERCARE <span style="color:#5eead4;">AI</span></span>
        </td></tr>
        <tr><td style="padding:32px 28px 8px;">
          ${body}
        </td></tr>
        <tr><td style="padding:24px 28px 28px;font-size:12px;line-height:1.6;color:${MUTED};border-top:1px solid #eeebe4;">
          ${footer}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Collapses repeated blank lines in a plain-text email. */
function textLines(lines: string[]): string {
  return lines.filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n");
}

/**
 * Welcome email sent right after sign-up. Transactional (it confirms an action the person took),
 * so it is sent regardless of the marketing preference, and it contains no health information.
 */
const COPY = {
  patient: {
    path: "/onboarding",
    cta: "Set up my recovery plan",
    intro: "Your account is ready. AFTERCARE AI turns the documents you bring home from hospital into a clear recovery plan that you check and follow.",
    preheader: "Your account is ready. Turn your discharge papers into a plan you can follow.",
    features: [
      ["Upload your discharge papers", "PDFs or photos of your discharge summary, prescriptions and care sheets."],
      ["Check what was found", "Every medicine and instruction links to the exact sentence it came from."],
      ["Follow your plan", "A daily checklist, your medicines, appointments and warning signs in one place."],
    ],
  },
  clinic: {
    path: "/clinic/register",
    cta: "Set up my clinic",
    intro: "Your account is ready. Create your clinic workspace to prepare clinician-approved recovery plans your patients can follow.",
    preheader: "Your account is ready. Set up your clinic workspace.",
    features: [
      ["Register patients and upload discharge documents", "Files are stored privately and visible only to your clinic."],
      ["Review AI-organized drafts", "Every item links to its source text; nothing reaches a patient until a clinician approves it."],
      ["Invite patients securely", "Patients see only the plan your clinician approved."],
    ],
  },
} as const;

export function welcomeEmail({ appUrl, marketingOptIn, audience = "patient" }: { appUrl: string; marketingOptIn: boolean; audience?: "patient" | "clinic" }) {
  const copy = COPY[audience];
  const base = appUrl.replace(/\/$/, "");
  const start = `${base}${copy.path}`;
  const settings = `${base}/settings`;
  const privacy = `${base}/privacy`;
  const contact = LEGAL.contactEmail;

  const subject = "Welcome to AFTERCARE AI";

  const features = copy.features;

  const html = layout({
    title: subject,
    preheader: copy.preheader,
    body: `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:${NAVY};">Welcome to AFTERCARE AI</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#2a3344;">${escapeHtml(copy.intro)}</p>
          ${button(start, copy.cta)}
          ${features
            .map(
              ([title, body]) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 14px;"><tr>
            <td width="10" valign="top" style="padding-top:7px;"><div style="width:8px;height:8px;border-radius:4px;background:${TEAL};"></div></td>
            <td style="padding-left:12px;font-size:15px;line-height:1.5;"><strong>${escapeHtml(title)}</strong><br><span style="color:${MUTED};">${escapeHtml(body)}</span></td>
          </tr></table>`,
            )
            .join("\n")}
          ${DISCLAIMER_HTML}`,
    footer: `${marketingOptIn ? `You chose to receive product updates and offers. You can unsubscribe any time in <a href="${escapeHtml(settings)}" style="color:${MUTED};">Settings</a>.<br><br>` : ""}
          You received this email because an AFTERCARE AI account was created with this address.${contact ? ` If this wasn't you, contact <a href="mailto:${escapeHtml(contact)}" style="color:${MUTED};">${escapeHtml(contact)}</a>.` : ""}<br>
          ${legalLine(privacy)}`,
  });

  const text = textLines([
    "Welcome to AFTERCARE AI",
    "",
    copy.intro,
    "",
    `${copy.cta}: ${start}`,
    "",
    ...features.map(([t, b]) => `- ${t}: ${b}`),
    "",
    DISCLAIMER,
    "",
    marketingOptIn ? `You chose to receive product updates and offers. Unsubscribe any time in Settings: ${settings}` : "",
    `You received this email because an AFTERCARE AI account was created with this address.${contact ? ` If this wasn't you, contact ${contact}.` : ""}`,
    `Privacy Policy: ${privacy}`,
  ]);

  return { subject, html, text };
}

const INVITE_COPY = {
  staff: {
    subject: (org: string) => `You're invited to join ${org} on AFTERCARE AI`,
    heading: "You're invited to join your clinic",
    intro: (org: string, role: string) =>
      `${org} invited you to join their AFTERCARE AI workspace as ${role}. Sign in or create an account with this email address, then accept the invitation.`,
    cta: "Accept the invitation",
    note: "The link works once and expires in 7 days.",
  },
  patient: {
    subject: (org: string) => `${org} invited you to AFTERCARE AI`,
    heading: "Your care instructions are ready",
    intro: (org: string) =>
      `${org} invited you to view the recovery instructions your care team approved for you in AFTERCARE AI. You will be asked to confirm your date of birth.`,
    cta: "View my instructions",
    note: "The link works once and expires in 72 hours. If it has expired, ask your clinic for a new one.",
  },
} as const;

/**
 * Invitation from a clinic to a staff member or a patient. Contains the one-time link and the clinic's
 * name, never health information (no diagnosis, medicines or dates).
 */
export function invitationEmail({
  kind,
  link,
  organization,
  role,
  appUrl,
}: {
  kind: "staff" | "patient";
  link: string;
  organization: string;
  role?: string;
  appUrl: string;
}) {
  const copy = INVITE_COPY[kind];
  const privacy = `${appUrl.replace(/\/$/, "")}/privacy`;
  const subject = copy.subject(organization);
  const intro = copy.intro(organization, role ?? "a team member");
  const ignore = "If you were not expecting this invitation, you can ignore this email.";

  const html = layout({
    title: subject,
    preheader: intro,
    body: `<h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:${NAVY};">${escapeHtml(copy.heading)}</h1>
          <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#2a3344;">${escapeHtml(intro)}</p>
          ${button(link, copy.cta)}
          <p style="margin:0 0 8px;font-size:13px;line-height:1.55;color:${MUTED};">${escapeHtml(copy.note)} Do not forward this email: the link is personal to you.</p>
          ${kind === "patient" ? DISCLAIMER_HTML : ""}`,
    footer: `${escapeHtml(ignore)}<br>${legalLine(privacy)}`,
  });

  const text = textLines([
    copy.heading,
    "",
    intro,
    "",
    `${copy.cta}: ${link}`,
    "",
    `${copy.note} Do not forward this email: the link is personal to you.`,
    "",
    kind === "patient" ? DISCLAIMER : "",
    "",
    ignore,
    `Privacy Policy: ${privacy}`,
  ]);

  return { subject, html, text };
}
