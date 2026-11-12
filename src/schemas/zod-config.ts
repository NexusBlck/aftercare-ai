import { z } from "zod";

/**
 * Run Zod without its eval-based JIT. The app's Content Security Policy forbids eval, and Zod's
 * feature probe (`Function("")`) would otherwise be reported as a CSP violation in the browser.
 */
z.config({ jitless: true });
