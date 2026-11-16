"use client";

// Page-level error boundary: an unexpected server error (e.g. database unreachable)
// shows a friendly message instead of Next's default screen. Details stay in server logs.
// Next 16: `retry()` re-fetches the segment (unlike `reset()`, which only re-renders).
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="text-stone-500">We couldn&apos;t load this page. Please try again in a moment.</p>
        <button
          onClick={() => retry()}
          className="w-full rounded-lg bg-stone-900 px-4 py-2.5 font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
