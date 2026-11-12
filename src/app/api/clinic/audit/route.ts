import { z } from "zod";
import { AppError } from "@/lib/api/errors";
import { handle, ok } from "@/lib/api/route-utils";
import { mapDbError } from "@/lib/clinic/db-errors";
import { requireClinic } from "@/lib/clinic/server";
import { memberNames } from "@/services/clinic-service";

const Query = z.object({ page: z.coerce.number().int().min(1).max(10_000).default(1) });
const SIZE = 50;

export const GET = handle(async (request: Request) => {
  const ctx = await requireClinic("audit.read");
  const parsed = Query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) throw new AppError("invalid_request", "The request was not valid.", 400);
  const { page } = parsed.data;
  const { data, count, error } = await ctx.supabase
    .from("audit_logs")
    .select("id, action, resource_type, resource_id, metadata, created_at, actor_user_id", { count: "exact" })
    .eq("organization_id", ctx.orgId)
    .order("created_at", { ascending: false })
    .range((page - 1) * SIZE, page * SIZE - 1);
  if (error) throw mapDbError(error, "load the audit log");
  const names = await memberNames(ctx);
  return ok({
    items: (data ?? []).map((e) => ({ ...e, actor: e.actor_user_id ? (names.get(e.actor_user_id as string) ?? "Patient or former staff") : "System" })),
    total: count ?? 0,
    page,
    pageSize: SIZE,
  });
});
