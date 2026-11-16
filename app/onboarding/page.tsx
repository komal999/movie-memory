import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { MovieForm } from "./movie-form";

export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.favoriteMovie) redirect("/dashboard");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}!
        </h1>
        <MovieForm />
      </div>
    </main>
  );
}
