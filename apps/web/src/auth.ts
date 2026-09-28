import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@livo/db";
import { env } from "@/config/env.js";
import { GUEST_COOKIE_NAME, findGuestSessionByToken, mergeGuestIntoUser } from "@/modules/auth/session.js";

/**
 * Auth.js v5 (ADR-007/008): Google OAuth only for now — email magic link
 * is also in the ADR's decision, but needs an email-sending provider
 * (Resend/SMTP) this session has no credentials for, so it's left out
 * rather than half-built. Database sessions (not JWT), so a session can be
 * revoked by deleting its row, per the ADR's own reasoning.
 *
 * `providers` is built conditionally: without real Google credentials the
 * app must still boot and guest mode must still work (ARCHITECTURE.md §9 —
 * missing optional config is not a boot failure), so an empty provider
 * list is a valid, intentional state, not a bug.
 */
const providers = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
  ? [Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })]
  : [];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  secret: env.AUTH_SECRET,
  // Auth.js validates the incoming Host header against a trusted list by
  // default (protects against host-header injection) and only
  // auto-trusts a handful of known platforms (Vercel, etc). Self-hosting
  // anywhere else — including this dev server — needs this explicitly.
  trustHost: true,
  providers,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    /**
     * Guest-plan merge (ARCHITECTURE.md §7 sequence diagram): on sign-in,
     * whatever plans the browser's guest session cookie owns get
     * reassigned to the newly authenticated user, in one transaction, so
     * nothing a guest built before signing up is lost.
     */
    async signIn({ user }) {
      if (!user.id) return;
      const { cookies } = await import("next/headers");
      const cookieValue = cookies().get(GUEST_COOKIE_NAME)?.value;
      if (!cookieValue) return;
      const guestSession = await findGuestSessionByToken(cookieValue);
      if (!guestSession || guestSession.mergedIntoUserId) return;
      await mergeGuestIntoUser(guestSession.id, user.id);
    },
  },
});
