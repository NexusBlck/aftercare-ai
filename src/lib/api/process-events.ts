import type { SanitizerIssue } from "@/lib/domain/sanitize";
import type { PlanBundle } from "@/schemas/domain";
import type { Extraction } from "@/schemas/extraction";
import type { ApiErrorBody } from "./errors";

/** NDJSON events streamed while a document is processed. Each is emitted when the step really starts. */
export type ProcessStage = "reading" | "extracting" | "validating" | "explaining" | "saving";

export type ProcessEvent =
  | { type: "stage"; stage: ProcessStage }
  | { type: "done"; bundle: PlanBundle }
  | {
      type: "extracted";
      result: { extraction: Extraction; issues: SanitizerIssue[]; model: string; provider: "gemini" | "mock" | "freellmapi" | "free"; schemaVersion: string };
    }
  | { type: "error"; error: ApiErrorBody["error"] };

export const STAGE_LABELS: Record<ProcessStage, string> = {
  reading: "Reading document",
  extracting: "Classifying and extracting information",
  validating: "Validating results",
  explaining: "Writing plain-language explanations",
  saving: "Saving for your review",
};
