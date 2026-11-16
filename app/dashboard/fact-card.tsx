"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FactSource, PublicFact } from "@/lib/facts";

type State =
  | { status: "loading" }
  | { status: "ready"; fact: PublicFact; source: FactSource }
  | { status: "error"; message: string };

const SOURCE_LABEL: Record<FactSource, string> = {
  generated: "Fresh fact",
  cache: "Cached (new facts every 60s)",
  fallback: "Couldn't reach the fact generator, so here's your last fact",
};

export function FactCard() {
  const router = useRouter();
  const [state, setState] = useState<State>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/fact", { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (res.status === 401) {
        router.replace("/");
        return;
      }
      if (!res.ok || !body?.fact) {
        setState({ status: "error", message: body?.error?.message ?? "Something went wrong." });
        return;
      }
      setState({ status: "ready", fact: body.fact, source: body.source });
    } catch {
      setState({ status: "error", message: "Network error. Check your connection and try again." });
    }
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch on mount
    void load();
  }, [load]);

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 p-5 dark:border-stone-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-stone-500">Fun fact</h2>
        <button
          onClick={() => void load()}
          disabled={state.status === "loading"}
          className="text-sm underline-offset-4 hover:underline disabled:opacity-50"
        >
          Get another
        </button>
      </div>

      {state.status === "loading" && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading fact">
          <div className="h-4 w-full animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
          <div className="h-4 w-2/3 animate-pulse rounded bg-stone-200 dark:bg-stone-800" />
        </div>
      )}

      {state.status === "error" && (
        <p role="alert" className="text-red-600">
          {state.message}
        </p>
      )}

      {state.status === "ready" && (
        <>
          <p className="text-lg leading-relaxed">{state.fact.content}</p>
          <p className="text-xs text-stone-500">{SOURCE_LABEL[state.source]}</p>
        </>
      )}
    </section>
  );
}
