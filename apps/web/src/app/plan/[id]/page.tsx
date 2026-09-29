import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  BedDouble,
  CalendarDays,
  Check,
  Lock,
  MapPin,
  Pencil,
  Search,
  Share2,
  Sparkles,
  Trash2,
  UtensilsCrossed,
  Wallet,
} from "lucide-react";
import { prisma } from "@livo/db";
import { resolveViewerReadOnly } from "@/modules/auth/index.js";
import { getPlan } from "@/modules/plans/index.js";
import { computeBudgetForPlan } from "@/modules/budget/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { getScenarioResult } from "@/modules/scenarios/index.js";
import { CostBreakdown } from "@/components/patterns/CostBreakdown.js";
import { ScenarioDelta } from "@/components/patterns/ScenarioDelta.js";
import { PlaceVisual } from "@/components/patterns/PlaceVisual.js";
import { Money } from "@/components/patterns/Money.js";
import { Badge, ButtonLink, Card, EmptyState, Field, Notice, buttonClass, cn, fieldClass } from "@/components/ui/index.js";
import {
  removeItemAction,
  runScenarioAction,
  toggleShareAction,
  updatePlanDetailsAction,
} from "@/app/actions/plans.js";

export const dynamic = "force-dynamic";

const LEVERS = [
  { value: "CHEAPER", label: "Cheaper" },
  { value: "CLOSER", label: "Closer" },
  { value: "FOOD_INCLUDED", label: "Food included" },
  { value: "PRIVATE_ROOM", label: "Private room" },
] as const;

const OCCUPANCY_LABEL: Record<string, string> = {
  SINGLE: "Single room",
  DOUBLE: "Double sharing",
  TRIPLE: "Triple sharing",
  DORM_4PLUS: "Dorm (4+)",
  WHOLE_UNIT: "Whole unit",
};

const BASIS_SUFFIX: Record<string, string> = {
  PER_MONTH: "/mo",
  PER_NIGHT: "/night",
  PER_WEEK: "/week",
  PER_DAY: "/day",
  PER_MEAL: "/meal",
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function isoDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

function rupees(paise: bigint | null): string {
  return paise != null ? String(Number(paise) / 100) : "";
}

/**
 * Plan wizard (UX_UI_SPEC.md §5.13): one plan, filled in step by step —
 * Stay → Food → Budget — with the budget always visible alongside.
 * Guest-owned by default (ADR-008); there is no sign-in gate here.
 */
export default async function PlanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { share?: string; scenario?: string; scenarioError?: string; detailsError?: string };
}) {
  const viewer = await resolveViewerReadOnly();

  let plan;
  try {
    plan = await getPlan(params.id, viewer, searchParams.share);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-xl px-4 py-20">
          <EmptyState
            icon={<Lock className="h-5 w-5" />}
            title="This plan is private"
            description="You don't have access to this plan. If someone shared it with you, ask them for the share link."
            action={<ButtonLink href="/">Start your own plan</ButtonLink>}
          />
        </main>
      );
    }
    throw err;
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <EmptyState title="Plan not found" action={<ButtonLink href="/">Start a new plan</ButtonLink>} />
      </main>
    );
  }

  const isReadOnlyShareView = Boolean(
    searchParams.share &&
      !((viewer.kind === "user" && plan.ownerUserId === viewer.userId) ||
        (viewer.kind === "guest" && plan.guestSessionId === viewer.guestSessionId)),
  );
  const canEdit = !isReadOnlyShareView;

  const stayItem = plan.items.find((i) => i.kind === "ACCOMMODATION" && i.roomOptionId);
  const foodItem = plan.items.find((i) => i.kind === "FOOD" && i.foodPlanId);
  const [room, foodPlan] = await Promise.all([
    stayItem
      ? prisma.roomOption.findUnique({
          where: { id: stayItem.roomOptionId! },
          include: { place: { include: { accommodationDetail: true } } },
        })
      : null,
    foodItem ? prisma.foodPlan.findUnique({ where: { id: foodItem.foodPlanId! }, include: { place: true } }) : null,
  ]);
  const stayIncludesFood = Boolean(room?.place.accommodationDetail?.foodIncluded);

  // getPlan() has already authorized this request (owner match or a valid
  // share token). computeBudgetForPlan does its own ownership check, so
  // it's called as the plan's actual owner — a shared read-only viewer
  // should still see the cost breakdown (MASTER_PLAN.md §7, journey J3).
  const ownerViewer =
    plan.ownerUserId != null
      ? ({ kind: "user", userId: plan.ownerUserId } as const)
      : ({ kind: "guest", guestSessionId: plan.guestSessionId! } as const);

  let budget = null;
  try {
    budget = plan.items.length > 0 ? await computeBudgetForPlan(plan.id, ownerViewer) : null;
  } catch {
    budget = null;
  }

  const shareUrl = plan.shareToken ? `/plan/${plan.id}?share=${plan.shareToken}` : null;
  const scenarioResult = searchParams.scenario ? await getScenarioResult(searchParams.scenario) : null;

  const days = Math.round((new Date(plan.endDate).getTime() - new Date(plan.startDate).getTime()) / 86_400_000);
  const stayHref = `/search?destinationId=${plan.destinationId}&planId=${plan.id}${
    plan.budgetCapPaise ? `&priceMax=${Number(plan.budgetCapPaise) / 100}` : ""
  }`;
  const foodHref = `/food?destinationId=${plan.destinationId}&planId=${plan.id}`;

  const steps = [
    { label: "Stay", done: Boolean(room) },
    { label: "Food", done: Boolean(foodPlan) || stayIncludesFood },
    { label: "Budget", done: Boolean(budget) },
  ];

  const monthly = budget?.recurring.monthlyPaise ?? null;
  const cap = plan.budgetCapPaise;
  const overCap = monthly != null && cap != null ? monthly - cap : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {canEdit && (
        <Link href="/plans" className="inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          My plans
        </Link>
      )}

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{plan.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden />
              {plan.destination.name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" aria-hidden />
              {formatDate(new Date(plan.startDate))} – {formatDate(new Date(plan.endDate))} · {days} days
            </span>
            {cap != null && (
              <span className="inline-flex items-center gap-1.5">
                <Wallet className="h-4 w-4" aria-hidden />
                Budget <Money paise={cap} suffix="/mo" />
              </span>
            )}
          </div>
        </div>
      </div>

      {isReadOnlyShareView && (
        <div className="mt-4">
          <Notice icon={<Share2 className="h-4 w-4" />}>You&apos;re viewing a shared, read-only copy of this plan.</Notice>
        </div>
      )}

      <ol className="mt-6 flex items-center gap-2 overflow-x-auto" aria-label="Plan progress">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium",
                step.done ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200",
              )}
            >
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                  step.done ? "bg-white/20" : "bg-slate-100",
                )}
              >
                {step.done ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              {step.label}
            </span>
            {i < steps.length - 1 && <span className="h-px w-6 bg-slate-300" aria-hidden />}
          </li>
        ))}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <div className="space-y-5">
          <StepCard number={1} icon={<BedDouble className="h-5 w-5" />} title="Where you'll stay" done={Boolean(room)}>
            {room ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <PlaceVisual
                  id={room.placeId}
                  kind={room.place.accommodationDetail?.kind ?? "PG"}
                  className="h-24 w-full shrink-0 rounded-xl sm:w-32"
                />
                <div className="min-w-0 flex-1">
                  <Link href={`/p/${room.place.slug}`} className="font-semibold text-ink hover:underline">
                    {room.place.name}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {OCCUPANCY_LABEL[room.occupancy] ?? room.occupancy} · {room.ac ? "AC" : "Non-AC"}
                    {room.privateBath ? " · Private bath" : ""}
                    {stayIncludesFood ? " · Meals included" : ""}
                  </p>
                  <p className="mt-1 text-sm">
                    <Money paise={room.pricePaise} suffix={BASIS_SUFFIX[room.priceBasis]} className="font-semibold text-ink" />
                    {room.depositPaise != null && (
                      <span className="text-slate-600">
                        {" "}
                        · <Money paise={room.depositPaise} /> deposit
                      </span>
                    )}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <ButtonLink href={stayHref} variant="secondary" size="sm">
                      Change
                    </ButtonLink>
                    <RemoveButton planId={plan.id} itemId={stayItem!.id} />
                  </div>
                )}
              </div>
            ) : canEdit ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  Browse PGs, hostels and rooms near {plan.destination.name} — with commute times and all-in monthly costs.
                </p>
                <ButtonLink href={stayHref} className="shrink-0">
                  <Search className="h-4 w-4" aria-hidden />
                  Find a place to stay
                </ButtonLink>
              </div>
            ) : (
              <p className="text-sm text-slate-600">No stay picked yet.</p>
            )}
          </StepCard>

          <StepCard
            number={2}
            icon={<UtensilsCrossed className="h-5 w-5" />}
            title="Food"
            done={Boolean(foodPlan) || stayIncludesFood}
          >
            {foodPlan ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <PlaceVisual id={foodPlan.placeId} kind={foodPlan.kind} className="h-20 w-full shrink-0 rounded-xl sm:w-28" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{foodPlan.place.name}</p>
                  <p className="text-sm text-slate-600">
                    {foodPlan.vegOnly ? "Veg only · " : ""}
                    {foodPlan.meals.join(", ").toLowerCase()} ·{" "}
                    <Money paise={foodPlan.pricePaise} suffix={BASIS_SUFFIX[foodPlan.priceBasis]} />
                  </p>
                  <p className="text-xs text-slate-600">meal plan</p>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <ButtonLink href={foodHref} variant="secondary" size="sm">
                      Change
                    </ButtonLink>
                    <RemoveButton planId={plan.id} itemId={foodItem!.id} />
                  </div>
                )}
              </div>
            ) : stayIncludesFood ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">Your stay includes meals, so you&apos;re covered.</p>
                {canEdit && (
                  <ButtonLink href={foodHref} variant="secondary" size="sm">
                    Add a mess anyway
                  </ButtonLink>
                )}
              </div>
            ) : canEdit ? (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-slate-600">
                  {room
                    ? "Add a mess or tiffin service nearby, or skip it and we'll use a typical food cost."
                    : "Messes, tiffin services and cloud kitchens near your destination."}
                </p>
                <ButtonLink href={foodHref} variant={room ? "primary" : "secondary"} className="shrink-0">
                  <UtensilsCrossed className="h-4 w-4" aria-hidden />
                  Find food nearby
                </ButtonLink>
              </div>
            ) : (
              <p className="text-sm text-slate-600">No food plan picked.</p>
            )}
          </StepCard>

          {canEdit && room && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-brand-600" aria-hidden />
                <h2 className="font-semibold text-ink">What if…</h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">See how your costs change with a different kind of stay.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {LEVERS.map((lever) => (
                  <form key={lever.value} action={runScenarioAction}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="lever" value={lever.value} />
                    <button type="submit" className={buttonClass("secondary", "sm", "rounded-full")}>
                      {lever.label}
                    </button>
                  </form>
                ))}
              </div>
              {searchParams.scenarioError && <p className="mt-3 text-sm text-slate-600">{searchParams.scenarioError}</p>}
              {scenarioResult && (
                <div className="mt-3">
                  <ScenarioDelta
                    lever={scenarioResult.lever}
                    found={scenarioResult.found}
                    note={scenarioResult.note}
                    alternative={scenarioResult.alternative}
                    deltaMonthlyPaise={scenarioResult.deltaMonthlyPaise}
                    deltaUpfrontPaise={scenarioResult.deltaUpfrontPaise}
                  />
                </div>
              )}
            </Card>
          )}

          {canEdit && (
            <Card className="p-5">
              <details open={Boolean(searchParams.detailsError)}>
                <summary className="flex cursor-pointer list-none items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold text-ink">
                    <Pencil className="h-4 w-4 text-slate-500" aria-hidden />
                    Trip details
                  </span>
                  <span className="text-sm text-brand-700">Edit</span>
                </summary>
                <form action={updatePlanDetailsAction} className="mt-4 grid gap-4 sm:grid-cols-2">
                  <input type="hidden" name="planId" value={plan.id} />
                  <Field label="Moving in">
                    <input type="date" name="startDate" defaultValue={isoDate(plan.startDate)} className={fieldClass} />
                  </Field>
                  <Field label="Moving out">
                    <input type="date" name="endDate" defaultValue={isoDate(plan.endDate)} className={fieldClass} />
                  </Field>
                  <Field label="Monthly budget (₹)">
                    <input type="number" name="budget" min={0} defaultValue={rupees(plan.budgetCapPaise)} className={fieldClass} />
                  </Field>
                  <Field label="Monthly income (₹)" hint="Optional — shows what's left each month">
                    <input type="number" name="income" min={0} defaultValue={rupees(plan.monthlyIncomePaise)} className={fieldClass} />
                  </Field>
                  <Field label="Cash on hand (₹)" hint="Optional — checks you can cover the deposit">
                    <input type="number" name="cash" min={0} defaultValue={rupees(plan.cashOnHandPaise)} className={fieldClass} />
                  </Field>
                  <div className="flex items-end">
                    <button type="submit" className={buttonClass("primary", "md", "w-full")}>
                      Save details
                    </button>
                  </div>
                  {searchParams.detailsError && <p className="text-sm text-red-700 sm:col-span-2">{searchParams.detailsError}</p>}
                </form>
              </details>
            </Card>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          {budget ? (
            <>
              {overCap != null && (
                <Notice tone={overCap > 0n ? "amber" : "brand"} icon={<Wallet className="h-4 w-4" />}>
                  {overCap > 0n ? (
                    <>
                      <Money paise={overCap} className="font-semibold" /> over your monthly budget
                    </>
                  ) : (
                    <>
                      <Money paise={-overCap} className="font-semibold" /> under your monthly budget
                    </>
                  )}
                </Notice>
              )}
              <CostBreakdown result={budget} />
            </>
          ) : (
            <Card className="p-5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Budget</h2>
              <p className="mt-3 text-sm text-slate-600">
                Your full budget — rent, deposit, food and commute — appears here once you pick a place to stay.
              </p>
            </Card>
          )}

          {canEdit && (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-slate-500" aria-hidden />
                <h2 className="font-semibold text-ink">Share</h2>
              </div>
              {shareUrl ? (
                <div className="mt-2 text-sm">
                  <p className="text-slate-600">Anyone with this link can view (not edit) this plan:</p>
                  <code className="mt-2 block break-all rounded-lg bg-slate-100 px-3 py-2 text-xs">{shareUrl}</code>
                  <form action={toggleShareAction} className="mt-2">
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="enabled" value="false" />
                    <button type="submit" className="text-xs font-medium text-slate-600 hover:underline">
                      Stop sharing
                    </button>
                  </form>
                </div>
              ) : (
                <form action={toggleShareAction} className="mt-2">
                  <p className="mb-3 text-sm text-slate-600">Send it to family or a flatmate — they&apos;ll see the full cost.</p>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="enabled" value="true" />
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    Get a share link
                  </button>
                </form>
              )}
            </Card>
          )}
        </aside>
      </div>
    </main>
  );
}

function StepCard({
  number,
  icon,
  title,
  done,
  children,
}: {
  number: number;
  icon: ReactNode;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl",
              done ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600",
            )}
          >
            {icon}
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Step {number}</p>
            <h2 className="font-semibold text-ink">{title}</h2>
          </div>
        </div>
        {done && (
          <Badge tone="brand">
            <Check className="h-3 w-3" aria-hidden /> Done
          </Badge>
        )}
      </div>
      {children}
    </Card>
  );
}

function RemoveButton({ planId, itemId }: { planId: string; itemId: string }) {
  return (
    <form action={removeItemAction}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="itemId" value={itemId} />
      <button type="submit" className={buttonClass("danger", "sm")} aria-label="Remove">
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
}
