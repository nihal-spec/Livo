import Link from "next/link";
import { prisma } from "@livo/db";
import { ArrowRight, BadgeCheck, Building2, GraduationCap, HeartPulse, Sparkles, Train, Wallet } from "lucide-react";
import { startPlanAction } from "@/app/actions/plans.js";
import { Card, Field, buttonClass, fieldClass } from "@/components/ui/index.js";

export const dynamic = "force-dynamic";

const KIND_ICON = {
  OFFICE_PARK: Building2,
  HOSPITAL: HeartPulse,
  COLLEGE: GraduationCap,
  STATION: Train,
} as const;

const KIND_LABEL: Record<string, string> = {
  OFFICE_PARK: "Office park",
  HOSPITAL: "Hospital",
  COLLEGE: "College",
  STATION: "Transit hub",
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Landing (UX_UI_SPEC.md §5.1). One primary path: tell us where, when and
 * roughly what you can spend, and that becomes a plan the rest of the app
 * fills in (stay → food → budget). Trust numbers are computed from the
 * database, never placeholder copy.
 */
export default async function Home({ searchParams }: { searchParams: { error?: string } }) {
  const [anchors, totalPlaces, foodPlaces] = await Promise.all([
    prisma.destination.findMany({ where: { isAnchor: true }, orderBy: { name: "asc" } }),
    prisma.place.count({ where: { status: "PUBLISHED", category: "ACCOMMODATION", deletedAt: null } }),
    prisma.place.count({ where: { status: "PUBLISHED", category: "FOOD", deletedAt: null } }),
  ]);

  const defaultStart = new Date();
  defaultStart.setDate(defaultStart.getDate() + 14);

  return (
    <main>
      <section className="relative overflow-hidden border-b border-slate-200/70 bg-gradient-to-b from-brand-50 via-white to-slate-50">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-sky-200/40 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:py-20">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-800 shadow-sm ring-1 ring-brand-200">
              <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
              Now in Kochi
            </span>
            <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight text-ink sm:text-5xl">
              Plan your stay near work, college or hospital — with real costs
            </h1>
            <p className="mt-4 max-w-xl text-lg text-slate-600">
              Find a place to stay, sort out food, and see your full monthly budget before you move. No invented
              prices — every number shows where it came from.
            </p>

            <dl className="mt-8 grid max-w-md grid-cols-3 gap-4">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-600">Stays</dt>
                <dd className="mt-1 text-2xl font-bold text-ink">{totalPlaces}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-600">Food spots</dt>
                <dd className="mt-1 text-2xl font-bold text-ink">{foodPlaces}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-600">Destinations</dt>
                <dd className="mt-1 text-2xl font-bold text-ink">{anchors.length}</dd>
              </div>
            </dl>
          </div>

          <Card className="p-6 sm:p-7">
            <h2 className="text-lg font-semibold text-ink">Start your plan</h2>
            <p className="mt-1 text-sm text-slate-600">Takes 20 seconds. You can change anything later.</p>

            <form action={startPlanAction} className="mt-5 grid gap-4">
              <Field label="Where do you need to be?">
                <select id="destinationId" name="destinationId" required defaultValue="" className={fieldClass}>
                  <option value="" disabled>
                    Choose an office, hospital or college
                  </option>
                  {anchors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </Field>
              {searchParams.error === "destination" && (
                <p className="-mt-2 text-sm text-red-700">Please choose a destination.</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Moving in">
                  <input type="date" name="startDate" defaultValue={isoDate(defaultStart)} className={fieldClass} />
                </Field>
                <Field label="For how long">
                  <select name="months" defaultValue="3" className={fieldClass}>
                    <option value="1">1 month</option>
                    <option value="2">2 months</option>
                    <option value="3">3 months</option>
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly budget (₹)">
                  <input type="number" name="budget" min={0} step={500} placeholder="e.g. 12000" className={fieldClass} />
                </Field>
                <Field label="Purpose">
                  <select name="purpose" defaultValue="JOB_RELOCATION" className={fieldClass}>
                    <option value="JOB_RELOCATION">New job</option>
                    <option value="INTERNSHIP">Internship</option>
                    <option value="STUDY">Studies</option>
                    <option value="HOSPITAL_ATTENDANT">Hospital visit</option>
                    <option value="TRAINING">Training</option>
                    <option value="OTHER">Other</option>
                  </select>
                </Field>
              </div>

              <button type="submit" className={buttonClass("primary", "lg", "mt-1 w-full")}>
                See places &amp; costs
                <ArrowRight className="h-5 w-5" aria-hidden />
              </button>
            </form>

            <Link
              href="/intake"
              className="mt-4 flex items-center justify-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Or just describe your situation in your own words
            </Link>
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-xl font-bold text-ink">How it works</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {[
            { icon: Building2, title: "Pick a stay", body: "PGs, hostels and rooms near your destination, with real commute times." },
            { icon: Wallet, title: "Add food & commute", body: "Messes and tiffin services nearby; commute costs are added for you." },
            { icon: BadgeCheck, title: "See the real total", body: "Setup cost, monthly cost and what's left of your budget — shareable." },
          ].map((step, i) => (
            <li key={step.title}>
              <Card className="h-full p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                    <step.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Step {i + 1}</span>
                </div>
                <h3 className="mt-3 font-semibold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{step.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink">Popular destinations</h2>
            <p className="mt-1 text-sm text-slate-600">Just browsing? See what&apos;s nearby.</p>
          </div>
        </div>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {anchors.map((a) => {
            const Icon = KIND_ICON[a.kind as keyof typeof KIND_ICON] ?? Building2;
            return (
              <li key={a.id}>
                <Link
                  href={`/search?destinationId=${a.id}`}
                  className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition-shadow hover:shadow-lift"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 group-hover:bg-brand-50 group-hover:text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink">{a.name}</span>
                    <span className="block text-xs text-slate-600">{KIND_LABEL[a.kind] ?? a.kind}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
