import Link from "next/link";
import { prisma } from "@livo/db";
import { resolveViewerReadOnly } from "@/modules/auth/index.js";
import { getPlan } from "@/modules/plans/index.js";
import { computeBudgetForPlan } from "@/modules/budget/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";
import { CostBreakdown } from "@/components/patterns/CostBreakdown.js";
import { ScenarioDelta } from "@/components/patterns/ScenarioDelta.js";
import { removeItemAction, runScenarioAction, toggleShareAction } from "@/app/actions/plans.js";
import { getScenarioResult } from "@/modules/scenarios/index.js";

const LEVERS = [
  { value: "CHEAPER", label: "Cheaper" },
  { value: "CLOSER", label: "Closer" },
  { value: "FOOD_INCLUDED", label: "Food included" },
  { value: "PRIVATE_ROOM", label: "Private room" },
] as const;

export const dynamic = "force-dynamic";

async function describeItem(item: {
  id: string;
  kind: string;
  roomOptionId: string | null;
  foodPlanId: string | null;
  custom: unknown;
}): Promise<string> {
  if (item.kind === "ACCOMMODATION" && item.roomOptionId) {
    const room = await prisma.roomOption.findUnique({ where: { id: item.roomOptionId }, include: { place: true } });
    return room ? `${room.place.name} — ${room.occupancy.toLowerCase()} room` : "Accommodation (removed listing)";
  }
  if (item.kind === "FOOD" && item.foodPlanId) {
    const foodPlan = await prisma.foodPlan.findUnique({ where: { id: item.foodPlanId }, include: { place: true } });
    return foodPlan ? `${foodPlan.place.name} — meal plan` : "Food plan (removed)";
  }
  if (item.custom && typeof item.custom === "object") {
    const c = item.custom as { label?: string };
    return c.label ?? "Custom cost";
  }
  return item.kind;
}

/**
 * Plan builder (UX_UI_SPEC.md §5.13). Guest-owned by default (ADR-008) —
 * there is no sign-in gate anywhere on this page.
 */
export default async function PlanPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { share?: string; scenario?: string; scenarioError?: string };
}) {
  const viewer = await resolveViewerReadOnly();

  let plan;
  try {
    plan = await getPlan(params.id, viewer, searchParams.share);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return (
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-slate-900">This plan is private</h1>
          <p className="mt-2 text-slate-600">
            You don&apos;t have access to this plan. If someone shared it with you, ask them for the share link.
          </p>
        </main>
      );
    }
    throw err;
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Plan not found</h1>
      </main>
    );
  }

  const isReadOnlyShareView = Boolean(
    searchParams.share &&
      !((viewer.kind === "user" && plan.ownerUserId === viewer.userId) ||
        (viewer.kind === "guest" && plan.guestSessionId === viewer.guestSessionId)),
  );

  const itemDescriptions = await Promise.all(plan.items.map((item) => describeItem(item)));

  // getPlan() has already authorized this request (owner match or a valid
  // share token) — a shared read-only viewer should still see the cost
  // breakdown (MASTER_PLAN.md §7, journey J3: a parent reviewing a shared
  // plan needs to see the cost, not just the room). computeBudgetForPlan
  // does its own ownership check, so it's called as the plan's actual
  // owner rather than the (possibly different) requesting viewer.
  const ownerViewer =
    plan.ownerUserId != null
      ? ({ kind: "user", userId: plan.ownerUserId } as const)
      : ({ kind: "guest", guestSessionId: plan.guestSessionId! } as const);

  let budget = null;
  let budgetError: string | null = null;
  try {
    budget = await computeBudgetForPlan(plan.id, ownerViewer);
  } catch {
    budgetError = "Could not compute a budget yet — add an accommodation item first.";
  }

  const shareUrl = plan.shareToken ? `/plan/${plan.id}?share=${plan.shareToken}` : null;
  const scenarioResult = searchParams.scenario ? await getScenarioResult(searchParams.scenario) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">{plan.title}</h1>
        <p className="text-sm text-slate-600">
          {plan.destination.name} · {plan.purpose.replaceAll("_", " ").toLowerCase()} ·{" "}
          {new Date(plan.startDate).toLocaleDateString("en-IN")} –{" "}
          {new Date(plan.endDate).toLocaleDateString("en-IN")}
        </p>
        {isReadOnlyShareView && (
          <p className="mt-2 rounded bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
            You&apos;re viewing a shared, read-only copy of this plan.
          </p>
        )}
      </header>

      <div className="grid gap-6 sm:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Items</h2>
          {plan.items.length === 0 ? (
            <p className="text-sm text-slate-500">
              Nothing added yet.{" "}
              <Link href="/" className="text-teal-700 underline">
                Search for a place to stay
              </Link>{" "}
              and add it here.
            </p>
          ) : (
            <ul className="space-y-2">
              {plan.items.map((item, i) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm"
                >
                  <span>{itemDescriptions[i]}</span>
                  {!isReadOnlyShareView && (
                    <form action={removeItemAction}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <button type="submit" className="text-xs text-red-700 hover:underline">
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!isReadOnlyShareView && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Share</h2>
              {shareUrl ? (
                <div className="text-sm">
                  <p className="text-slate-600">Anyone with this link can view (not edit) this plan:</p>
                  <code className="mt-1 block break-all rounded bg-slate-100 px-2 py-1 text-xs">{shareUrl}</code>
                  <form action={toggleShareAction} className="mt-2">
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="enabled" value="false" />
                    <button type="submit" className="text-xs text-slate-600 hover:underline">
                      Stop sharing
                    </button>
                  </form>
                </div>
              ) : (
                <form action={toggleShareAction}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <input type="hidden" name="enabled" value="true" />
                  <button
                    type="submit"
                    className="rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-teal-600"
                  >
                    Get a share link
                  </button>
                </form>
              )}
            </div>
          )}
          {!isReadOnlyShareView && plan.items.some((i) => i.kind === "ACCOMMODATION") && (
            <div className="mt-6">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">What if...</h2>
              <div className="flex flex-wrap gap-2">
                {LEVERS.map((lever) => (
                  <form key={lever.value} action={runScenarioAction}>
                    <input type="hidden" name="planId" value={plan.id} />
                    <input type="hidden" name="lever" value={lever.value} />
                    <button
                      type="submit"
                      className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-teal-600 hover:text-teal-800"
                    >
                      {lever.label}
                    </button>
                  </form>
                ))}
              </div>

              {searchParams.scenarioError && (
                <p className="mt-3 text-sm text-slate-500">{searchParams.scenarioError}</p>
              )}
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
            </div>
          )}
        </section>

        <aside>
          {budget ? (
            <CostBreakdown result={budget} />
          ) : (
            budgetError && <p className="text-sm text-slate-500">{budgetError}</p>
          )}
        </aside>
      </div>
    </main>
  );
}
