import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  // Database sessions: the session cookie is an opaque token looked up in Postgres,
  // so logging out (or deleting the row) revokes access immediately.
  session: { strategy: "database" },
  pages: { signIn: "/" },
  callbacks: {
    session({ session, user }) {
      // Expose the DB user id so every query can be scoped to it.
      session.user.id = user.id;
      return session;
    },
  },
});
