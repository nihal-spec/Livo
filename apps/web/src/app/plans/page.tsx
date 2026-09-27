import Link from "next/link";
import { resolveViewerReadOnly } from "@/modules/auth/index.js";
import { listPlans } from "@/modules/plans/index.js";

export const dynamic = "force-dynamic";

const PURPOSE_LABEL: Record<string, string> = {
  JOB_RELOCATION: "Job relocation",
  INTERVIEW: "Interview",
  STUDY: "Study",
  HOSPITAL_ATTENDANT: "Hospital attendant",
  INTERNSHIP: "Internship",
  TRAINING: "Training",
  BUSINESS: "Business",
  FAMILY_VISIT: "Family visit",
  WORKATION: "Workation",
  TRIP: "Trip",
  OTHER: "Other",
};

function dateRange(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Saved plans list (MASTER_PLAN.md §39, V1 item). Guest-first (ADR-008):
 * "saved" here means "owned by this browser's guest session" — there is
 * no sign-in yet, so a plan made in a different browser or after clearing
 * cookies won't show up here. That's an accepted MVP limitation, not a bug.
 */
export default async function PlansPage() {
  const viewer = await resolveViewerReadOnly();
  const plans = viewer.kind === "anonymous" ? [] : await listPlans(viewer);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">My plans</h1>
        <Link href="/" className="text-sm text-teal-700 underline">
          Start a new search
        </Link>
      </header>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center">
          <p className="font-medium text-slate-900">No plans yet.</p>
          <p className="mt-1 text-sm text-slate-600">
            Search for a place to stay and use &quot;Add to plan&quot; to start one.
          </p>
          <Link href="/" className="mt-3 inline-block text-teal-700 underline">
            Start a search
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {plans.map((plan) => (
            <li key={plan.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Link href={`/plan/${plan.id}`} className="font-semibold text-slate-900 hover:underline">
                    {plan.title}
                  </Link>
                  <div className="text-sm text-slate-600">
                    {PURPOSE_LABEL[plan.purpose] ?? plan.purpose} · {plan.destination.name}
                  </div>
                  <div className="text-sm text-slate-600">{dateRange(plan.startDate, plan.endDate)}</div>
                </div>
                <div className="shrink-0 text-right text-sm text-slate-600">
                  {plan.items.length} {plan.items.length === 1 ? "item" : "items"}
                  {plan.shareToken && <div className="mt-1 text-xs text-teal-700">Shared</div>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
