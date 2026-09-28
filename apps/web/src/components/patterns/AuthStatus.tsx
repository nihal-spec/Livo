import { auth, signIn, signOut } from "@/auth.js";
import { env } from "@/config/env.js";

/**
 * Sign-in status (ADR-007/008). Guest mode is the default and always
 * works regardless of this — this is purely the optional "save your plans
 * to an account" path. Renders nothing but a plain link when Google OAuth
 * isn't configured (no client id/secret), rather than a broken button.
 */
export async function AuthStatus() {
  const session = await auth();

  if (session?.user) {
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        className="flex items-center gap-2 text-sm text-slate-600"
      >
        <span>Signed in as {session.user.email ?? session.user.name ?? "you"}</span>
        <button type="submit" className="text-teal-700 underline">
          Sign out
        </button>
      </form>
    );
  }

  const googleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  if (!googleConfigured) {
    return <span className="text-sm text-slate-600">Guest mode (sign-in not configured)</span>;
  }

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
    >
      <button type="submit" className="text-sm text-teal-700 underline">
        Sign in with Google
      </button>
    </form>
  );
}
