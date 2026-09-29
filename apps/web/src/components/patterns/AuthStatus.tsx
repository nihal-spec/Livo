import { LogOut } from "lucide-react";
import { auth, signIn, signOut } from "@/auth.js";
import { env } from "@/config/env.js";
import { buttonClass } from "@/components/ui/index.js";

/**
 * Sign-in status (ADR-007/008). Guest mode is the default and always
 * works regardless of this — this is purely the optional "save your plans
 * to an account" path. Renders nothing when Google OAuth isn't configured,
 * rather than a broken button.
 */
export async function AuthStatus() {
  const session = await auth();

  if (session?.user) {
    const label = session.user.name ?? session.user.email ?? "You";
    return (
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
        className="flex items-center gap-2"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800"
          title={`Signed in as ${session.user.email ?? label}`}
        >
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="sr-only">Signed in as {session.user.email ?? label}</span>
        <button type="submit" className={buttonClass("ghost", "sm")} aria-label="Sign out">
          <LogOut className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </form>
    );
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;

  return (
    <form
      action={async () => {
        "use server";
        await signIn("google");
      }}
    >
      <button type="submit" className={buttonClass("secondary", "sm")}>
        Sign in with Google
      </button>
    </form>
  );
}
