import { afterEach, describe, expect, it, vi } from "vitest";
import { escapeHtml, welcomeEmail } from "@/lib/email/templates";
import { sendEmail, smtpConfig } from "@/lib/email/mailer";

describe("welcome email", () => {
  it("links to set-up, includes the safety notice, and works as plain text", () => {
    const { subject, html, text } = welcomeEmail({ appUrl: "https://aftercare-ai-pi.vercel.app/", marketingOptIn: false });
    expect(subject).toBe("Welcome to AFTERCARE AI");
    expect(html).toContain('href="https://aftercare-ai-pi.vercel.app/onboarding"');
    expect(html).toContain("not medical advice");
    expect(text).toContain("https://aftercare-ai-pi.vercel.app/onboarding");
    expect(text).not.toMatch(/<[a-z]/i);
    expect(html).not.toContain("unsubscribe");
  });

  it("mentions how to unsubscribe only when the person opted in to marketing", () => {
    const { html, text } = welcomeEmail({ appUrl: "https://example.test", marketingOptIn: true });
    expect(html).toContain("unsubscribe any time");
    expect(html).toContain('href="https://example.test/settings"');
    expect(text).toContain("Unsubscribe any time in Settings");
  });

  it("escapes HTML in interpolated values", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
    const { html } = welcomeEmail({ appUrl: `https://evil.test/"><script>x</script>`, marketingOptIn: false });
    expect(html).not.toContain("<script>x</script>");
  });
});

describe("SMTP configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is disabled unless host, user and password are all set", () => {
    expect(smtpConfig({})).toBeNull();
    expect(smtpConfig({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@gmail.com" })).toBeNull();
  });

  it("strips the spaces Google shows in App Passwords and defaults to implicit TLS on 465", () => {
    const cfg = smtpConfig({ SMTP_HOST: "smtp.gmail.com", SMTP_USER: "a@gmail.com", SMTP_PASS: "abcd efgh ijkl mnop" });
    expect(cfg).toMatchObject({ host: "smtp.gmail.com", port: 465, pass: "abcdefghijklmnop", from: "AFTERCARE AI <a@gmail.com>" });
  });

  it("never throws and reports not_configured when SMTP is not set up", async () => {
    vi.stubEnv("SMTP_HOST", "");
    await expect(sendEmail({ to: "a@b.co", subject: "s", html: "h", text: "t" })).resolves.toEqual({ sent: false, reason: "not_configured" });
  });
});
