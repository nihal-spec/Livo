import Link from "next/link";
import { aiConfigured } from "@/config/ai.js";
import { intakeAction } from "@/app/actions/intake.js";

export const dynamic = "force-dynamic";

/**
 * AI intake (AI_ARCHITECTURE.md §4, MASTER_PLAN.md's NL-intake screen).
 * The model only ever fills TripRequirements, which this action then maps
 * onto the ordinary /search query string — it never runs a search or
 * touches prices/place IDs itself. This page degrades to a plain message
 * (not a broken form) when no AI provider is configured.
 */
export default function IntakePage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-xl font-semibold text-slate-900">Tell us about your trip</h1>
      <p className="mt-2 text-sm text-slate-600">
        Describe your situation in your own words — where you need to be, when, your budget, what matters to you.
        We&apos;ll turn it into a search; you can always refine it with filters afterwards.
      </p>

      {searchParams.error && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {searchParams.error}
        </p>
      )}

      {aiConfigured ? (
        <form action={intakeAction} className="mt-6 space-y-3">
          <textarea
            name="text"
            required
            rows={5}
            placeholder="e.g. I'm joining Infopark for a 6-month contract starting in November, budget around ₹8,000/month, prefer a single AC room with food included."
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900"
          />
          <button
            type="submit"
            className="rounded-md bg-teal-700 px-5 py-2 font-medium text-white hover:bg-teal-800"
          >
            Find places for me
          </button>
        </form>
      ) : (
        <p className="mt-6 rounded-lg border border-dashed border-slate-300 p-6 text-center text-slate-600">
          AI intake isn&apos;t configured on this deployment.{" "}
          <Link href="/" className="text-teal-700 underline">
            Use the regular search
          </Link>{" "}
          instead.
        </p>
      )}

      <p className="mt-6 text-sm">
        <Link href="/" className="text-teal-700 underline">
          Or pick a destination directly →
        </Link>
      </p>
    </main>
  );
}
