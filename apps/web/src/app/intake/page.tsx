import Link from "next/link";
import { AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { aiConfigured } from "@/config/ai.js";
import { intakeAction } from "@/app/actions/intake.js";
import { Card, EmptyState, Notice, buttonClass } from "@/components/ui/index.js";

export const dynamic = "force-dynamic";

const EXAMPLES = [
  "Joining Infopark in November for 6 months, budget ₹10,000/month, want a single AC room with food.",
  "My father has surgery at Aster Medcity next week. I need a cheap room nearby for 3 weeks.",
  "Starting my MTech at CUSAT in August, looking for a veg-friendly hostel under ₹6,000.",
];

/**
 * AI intake (AI_ARCHITECTURE.md §4). The model only fills
 * TripRequirements; the action turns that into a plan and hands off to the
 * ordinary search — it never touches prices or place IDs itself.
 */
export default function IntakePage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-700">
          <Sparkles className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink">Tell us about your trip</h1>
        <p className="mt-2 text-slate-600">
          Describe your situation in your own words — where you need to be, when, your budget, what matters to you. We&apos;ll
          start a plan and show you matching places.
        </p>
      </div>

      {searchParams.error && (
        <div className="mt-6">
          <Notice tone="amber" icon={<AlertCircle className="h-4 w-4" />}>
            {searchParams.error}
          </Notice>
        </div>
      )}

      {aiConfigured ? (
        <Card className="mt-6 p-5">
          <form action={intakeAction} className="space-y-4">
            <label htmlFor="intake-text" className="sr-only">
              Describe your trip
            </label>
            <textarea
              id="intake-text"
              name="text"
              required
              rows={5}
              placeholder={EXAMPLES[0]}
              className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-ink shadow-sm placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            />
            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-slate-600">AI reads your text only to fill in search filters — prices always come from our data.</p>
              <button type="submit" className={buttonClass("primary", "md", "shrink-0")}>
                Find places for me
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="AI intake isn't configured on this deployment."
            action={
              <Link href="/" className={buttonClass()}>
                Use the regular form
              </Link>
            }
          />
        </div>
      )}

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">For example</p>
        <ul className="mt-3 space-y-2">
          {EXAMPLES.map((e) => (
            <li key={e} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
              “{e}”
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-8 text-center text-sm">
        <Link href="/" className="font-medium text-brand-700 hover:underline">
          Or pick a destination directly →
        </Link>
      </p>
    </main>
  );
}
