import { NextResponse } from "next/server";

export type ApiErrorCode = "UNAUTHORIZED" | "NOT_FOUND" | "NO_MOVIE" | "GENERATION_FAILED";

/** Consistent JSON error shape: { error: { code, message } }. Never includes internals. */
export function apiError(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiOk<T extends object>(body: T) {
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
