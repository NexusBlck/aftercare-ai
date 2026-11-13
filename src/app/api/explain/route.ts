import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { handle, ok, parseJson } from "@/lib/api/route-utils";
import { explainItems, requireAi } from "@/lib/gemini/pipeline";
import { clientKey, rateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 120;

const BodySchema = z.object({
  items: z.array(z.object({ id: z.string().max(64), text: z.string().min(1).max(2000) })).min(1).max(60),
});

/**
 * Plain-language explanations for DEMO mode. The browser checks every explanation with the same
 * number-preservation rule as the server before showing it.
 */
export const POST = handle(async (request: Request) => {
  requireAi();
  const limit = await rateLimit(`explain:${clientKey(request)}`, 10, 10 * 60_000);
  if (!limit.ok) throw new AppError("rate_limited", `Too many requests. Try again in ${limit.retryAfterSec} seconds.`, 429, true);
  const body = await parseJson(request, BodySchema);
  return ok({ explanations: await explainItems(body.items) });
});
