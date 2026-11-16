import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { getCurrentUser } from "@/lib/session";

export default async function LandingPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.favoriteMovie ? "/dashboard" : "/onboarding");

  async function signInWithGoogle() {
    "use server";
    // /dashboard sends first-time users on to /onboarding.
    await signIn("google", { redirectTo: "/dashboard" });
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Movie Memory</h1>
          <p className="text-stone-500">Tell us your favorite movie. We&apos;ll tell you something you didn&apos;t know.</p>
        </div>
        <form action={signInWithGoogle}>
          <button
            type="submit"
            className="w-full rounded-lg bg-stone-900 px-4 py-2.5 font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
          >
            Sign in with Google
          </button>
        </form>
        <Link href="/privacy" className="text-sm text-stone-500 underline">
          Privacy
        </Link>
      </div>
    </main>
  );
}
