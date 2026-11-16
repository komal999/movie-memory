import Image from "next/image";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { FactCard } from "./fact-card";

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user.favoriteMovie) redirect("/onboarding");

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const displayName = user.name?.trim() || "Movie fan";

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-8 p-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {user.image ? (
            <Image
              src={user.image}
              alt=""
              width={48}
              height={48}
              className="rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-200 font-medium text-stone-700 dark:bg-stone-800 dark:text-stone-200"
            >
              {initials(user.name, user.email)}
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium">{displayName}</p>
            {user.email && <p className="truncate text-sm text-stone-500">{user.email}</p>}
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900"
          >
            Log out
          </button>
        </form>
      </header>

      <section className="space-y-1">
        <h2 className="text-sm font-medium uppercase tracking-wide text-stone-500">Favorite movie</h2>
        <p className="text-2xl font-semibold">{user.favoriteMovie}</p>
      </section>

      <FactCard />
    </main>
  );
}
