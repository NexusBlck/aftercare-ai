import { AppError } from "@/lib/api/errors";
import { ExtractionSchema, type Extraction } from "@/schemas/extraction";

/**
 * Parses and validates raw model output. Anything malformed, truncated or off-schema is rejected
 * as a whole — partial extractions are never saved.
 */
export function parseModelJson(raw: string): Extraction {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new AppError(
      "invalid_model_response",
      "The AI response was incomplete or not valid data, so nothing was saved. Please try processing the document again.",
      502,
      true,
    );
  }
  const result = ExtractionSchema.safeParse(json);
  if (!result.success) {
    throw new AppError(
      "invalid_model_response",
      "The AI response did not match the expected structure, so nothing was saved. Please try again.",
      502,
      true,
    );
  }
  return result.data;
}
