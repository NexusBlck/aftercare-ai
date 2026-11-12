import { connection } from "next/server";
import { publicStatus } from "@/lib/config";
import { ok } from "@/lib/api/route-utils";

/** Secret-free configuration status used by the UI to show labelled configuration states. */
export async function GET() {
  await connection();
  return ok(publicStatus());
}
