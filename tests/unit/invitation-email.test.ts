import { describe, expect, it } from "vitest";
import { deliverySentence } from "@/lib/clinic/invitation-copy";
import { invitationEmail } from "@/lib/email/templates";

const APP = "https://aftercare-ai-pi.vercel.app";
const LINK = `${APP}/invitation#t=abc123token`;

describe("invitation emails", () => {
  it("staff: names the clinic and role, carries the one-time link, works as plain text", () => {
    const { subject, html, text } = invitationEmail({ kind: "staff", link: LINK, organization: "Riverside Clinic", role: "nurse", appUrl: APP });
    expect(subject).toBe("You're invited to join Riverside Clinic on AFTERCARE AI");
    expect(html).toContain(`href="${LINK}"`);
    expect(html).toContain("as nurse");
    expect(text).toContain(LINK);
    expect(text).not.toMatch(/<[a-z]/i);
    expect(html).not.toContain("not medical advice");
  });

  it("patient: no health information, mentions the date-of-birth check and the safety notice", () => {
    const { subject, html, text } = invitationEmail({ kind: "patient", link: LINK, organization: "Riverside Clinic", appUrl: APP });
    expect(subject).toBe("Riverside Clinic invited you to AFTERCARE AI");
    expect(html).toContain("date of birth");
    expect(html).toContain("not medical advice");
    expect(text).toContain(LINK);
    for (const word of [/diagnos/i, /medicin/i, /medication/i, /surgery/i]) expect(text).not.toMatch(word);
  });

  it("escapes a hostile clinic name and link", () => {
    const { html, subject } = invitationEmail({
      kind: "staff",
      link: `${APP}/clinic/join#t="><script>x</script>`,
      organization: `<img src=x onerror=alert(1)> Clinic`,
      role: "admin",
      appUrl: APP,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; Clinic");
    expect(subject).toContain("<img"); // subjects are plain text, not HTML
  });
});

describe("delivery sentence", () => {
  const base = { link: LINK, expires_at: "2030-01-01T00:00:00Z" };
  it("says where the email went, or why it was not sent", () => {
    expect(deliverySentence({ ...base, delivery: "email" }, "nurse@example.com")).toMatch(/emailed the invitation to nurse@example\.com/);
    expect(deliverySentence({ ...base, delivery: "manual", email_status: "not_configured" }, null)).toMatch(/not set up/);
    expect(deliverySentence({ ...base, delivery: "manual", email_status: "failed" }, "a@b.c")).toMatch(/could not send/);
    expect(deliverySentence({ ...base, delivery: "manual", email_status: "no_address" }, null)).toMatch(/no email address/);
    expect(deliverySentence({ ...base, delivery: "manual", email_status: "not_requested" }, null)).toMatch(/No message/);
  });
});
