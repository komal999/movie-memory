import { auth } from "@/auth";
import { apiError, apiOk, internalError } from "@/lib/api-response";
import { getFactById } from "@/lib/fact-service";

/**
 * GET /api/facts/:id — a single stored fact, only if it belongs to the caller.
 * Another user's fact returns 404 (not 403) so ids can't be probed for existence.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/facts/[id]">) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return apiError(401, "UNAUTHORIZED", "Please sign in.");

    const { id } = await ctx.params;
    const fact = await getFactById(id, userId);
    if (!fact) return apiError(404, "NOT_FOUND", "Fact not found.");

    return apiOk({ fact });
  } catch (err) {
    return internalError(err);
  }
}
