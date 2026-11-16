import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · Movie Memory" };

// Linked from the Google OAuth consent screen, which requires a public privacy policy.
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 p-6 text-stone-700 dark:text-stone-300">
      <h1 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Privacy</h1>
      <p>Movie Memory is a small demo app built as a take-home exercise. This page explains what it stores.</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>
          <strong>From Google sign-in:</strong> your name, email address and profile photo URL. Nothing else from your
          Google account is requested.
        </li>
        <li>
          <strong>What you enter:</strong> your favorite movie, and the fun facts generated about it.
        </li>
        <li>
          <strong>Session:</strong> one cookie that keeps you signed in. Logging out deletes the session.
        </li>
        <li>
          <strong>OpenAI:</strong> only the movie title is sent to generate a fact. No name, email or other personal
          data is sent.
        </li>
        <li>Data is stored in a Postgres database and is never sold, shared or used for advertising.</li>
      </ul>
      <p>
        To have your account and all its data deleted, email{" "}
        <a className="underline" href="mailto:tkomal999@gmail.com">
          tkomal999@gmail.com
        </a>
        .
      </p>
      <p>
        <Link className="underline" href="/">
          Back to Movie Memory
        </Link>
      </p>
    </main>
  );
}
