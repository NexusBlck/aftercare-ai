import "./zod-config";
import { z } from "zod";

export const EmailSchema = z
  .string()
  .trim()
  .max(254)
  .transform((s) => s.toLowerCase())
  .pipe(z.email("Enter a valid email address."));

/** 8-72 characters: Supabase hashes passwords with bcrypt, which ignores bytes beyond 72. */
export const PasswordSchema = z.string().min(8, "Use at least 8 characters.").max(72, "Use 72 characters or fewer.");

export const LoginSchema = z.object({ email: EmailSchema, password: z.string().min(1).max(72) });

export const SignupSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  consents: z.object({
    /** Terms (incl. 18+ eligibility), Privacy Policy and health-data processing: one required box. */
    accepted: z.literal(true),
    /** Promotional email opt-in: optional and separate. */
    marketing: z.boolean(),
  }),
  /** Which welcome email to send: patients set up a recovery plan, clinic staff set up a clinic. */
  audience: z.enum(["patient", "clinic"]).default("patient"),
});

export const ResetRequestSchema = z.object({ email: EmailSchema });
export const NewPasswordSchema = z.object({ password: PasswordSchema });
