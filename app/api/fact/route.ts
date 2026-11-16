import { auth } from "@/auth";
import { apiError, apiOk, internalError } from "@/lib/api-response";
import { getFact } from "@/lib/fact-service";

/**
 * GET /api/fact — fact for the CURRENT user's favorite movie.
 * Takes no user id parameter: identity comes only from the session.
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return apiError(401, "UNAUTHORIZED", "Please sign in.");

    const result = await getFact(userId);
    if (result.ok) return apiOk({ fact: result.fact, source: result.source });

    if (result.code === "NO_MOVIE") return apiError(409, "NO_MOVIE", result.message);
    return apiError(503, "GENERATION_FAILED", result.message);
  } catch (err) {
    return internalError(err);
  }
}
