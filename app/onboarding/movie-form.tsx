"use client";

import { useActionState } from "react";
import { saveFavoriteMovie, type OnboardingState } from "./actions";
import { MOVIE_MAX_LENGTH } from "@/lib/validation";

export function MovieForm() {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(saveFavoriteMovie, {});

  return (
    <form action={action} className="space-y-3" noValidate>
      <label htmlFor="movie" className="block text-sm font-medium">
        What&apos;s your favorite movie?
      </label>
      <input
        id="movie"
        name="movie"
        defaultValue={state.value}
        maxLength={MOVIE_MAX_LENGTH}
        autoFocus
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? "movie-error" : undefined}
        placeholder="e.g. Spirited Away"
        className="w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 outline-none focus:border-stone-900 dark:border-stone-700 dark:focus:border-stone-100"
      />
      {state.error && (
        <p id="movie-error" role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-stone-900 px-4 py-2.5 font-medium text-white hover:bg-stone-700 disabled:opacity-60 dark:bg-stone-100 dark:text-stone-900"
      >
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
