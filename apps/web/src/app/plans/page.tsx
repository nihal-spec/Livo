import Link from "next/link";
import { CalendarDays, ChevronRight, FolderOpen, MapPin, Plus, Share2 } from "lucide-react";
import { resolveViewerReadOnly } from "@/modules/auth/index.js";
import { listPlans } from "@/modules/plans/index.js";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui/index.js";
import { Money } from "@/components/patterns/Money.js";

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
 * without sign-in, "saved" means "owned by this browser's guest session".
 */
export default async function PlansPage() {
  const viewer = await resolveViewerReadOnly();
  const plans = viewer.kind === "anonymous" ? [] : await listPlans(viewer);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <PageHeader
        title="My plans"
        description={viewer.kind === "user" ? "Saved to your account." : "Saved in this browser. Sign in to keep them across devices."}
        actions={
          <ButtonLink href="/">
            <Plus className="h-4 w-4" aria-hidden />
            New plan
          </ButtonLink>
        }
      />

      {plans.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-5 w-5" />}
          title="No plans yet."
          description="Tell us where you need to be and we'll help you plan the stay, food and budget."
          action={<ButtonLink href="/">Start a plan</ButtonLink>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {plans.map((plan) => {
            const stays = plan.items.filter((i) => i.kind === "ACCOMMODATION").length;
            return (
              <li key={plan.id}>
                <Link
                  href={`/plan/${plan.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition-shadow hover:shadow-lift"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold text-ink group-hover:underline">{plan.title}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-slate-600">
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-4 w-4" aria-hidden />
                      {PURPOSE_LABEL[plan.purpose] ?? plan.purpose} · {plan.destination.name}
                    </p>
                    <p className="flex items-center gap-1.5">
                      <CalendarDays className="h-4 w-4" aria-hidden />
                      {dateRange(plan.startDate, plan.endDate)}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge tone={stays > 0 ? "brand" : "neutral"}>
                      {plan.items.length} {plan.items.length === 1 ? "item" : "items"}
                    </Badge>
                    {plan.budgetCapPaise != null && (
                      <Badge>
                        Budget <Money paise={plan.budgetCapPaise} suffix="/mo" />
                      </Badge>
                    )}
                    {plan.shareToken && (
                      <Badge tone="violet">
                        <Share2 className="h-3 w-3" aria-hidden /> Shared
                      </Badge>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
