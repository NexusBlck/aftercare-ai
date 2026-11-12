import "./zod-config";
import { z } from "zod";

export const LegalDocumentSchema = z.enum(["terms", "privacy", "health_data"]);

export const AcceptLegalSchema = z.object({
  documents: z.array(LegalDocumentSchema).min(1).max(3),
});

export const MarketingSchema = z.object({ marketing_opt_in: z.boolean() });

export interface LegalStatus {
  required: Record<z.infer<typeof LegalDocumentSchema>, string>;
  accepted: Array<{ document: z.infer<typeof LegalDocumentSchema>; version: string; accepted_at: string; source: string }>;
  needs: Array<z.infer<typeof LegalDocumentSchema>>;
  marketing_opt_in: boolean;
  marketing_opt_in_at: string | null;
}
