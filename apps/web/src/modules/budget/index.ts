import { prisma } from "@livo/db";
import { calculateBudget } from "@livo/budget-engine";
import type { BudgetInput, BudgetResult, LineItemInput, PriceBasis, Frequency } from "@livo/schemas";
import { ForbiddenError } from "@/modules/rbac/index.js";
import type { Viewer } from "@/modules/auth/index.js";

/**
 * Bridges a Plan's items to the pure budget engine (ARCHITECTURE.md §5).
 * This module builds the LineItemInput list from real DB facts
 * (RoomOption/FoodPlan, each carrying its own provenance) plus any
 * user-entered custom lines, then hands off to @livo/budget-engine —
 * which never talks to the database itself, so it stays reusable
 * client-side for instant what-if recompute.
 */

const PRICE_BASIS_TO_FREQUENCY: Record<PriceBasis, Frequency> = {
  PER_MONTH: "MONTHLY",
  PER_WEEK: "WEEKLY",
  PER_DAY: "DAILY",
  PER_NIGHT: "PER_NIGHT",
  PER_MEAL: "PER_MEAL",
};

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function buildBudgetInputForPlan(planId: string): Promise<BudgetInput> {
  const plan = await prisma.plan.findUniqueOrThrow({
    where: { id: planId },
    include: { items: true },
  });

  type AccommodationBasis = NonNullable<BudgetInput["accommodation"]>;
  const lineItems: LineItemInput[] = [];
  let accommodationBasis: AccommodationBasis | null = null;

  for (const item of plan.items) {
    if (item.kind === "ACCOMMODATION" && item.roomOptionId) {
      const room = await prisma.roomOption.findUnique({
        where: { id: item.roomOptionId },
        include: { place: { include: { accommodationDetail: true } } },
      });
      if (!room) continue;

      accommodationBasis = {
        priceBasis: room.priceBasis as AccommodationBasis["priceBasis"],
        hasPerDayRate: false,
      };

      lineItems.push({
        id: `item_${item.id}_rent`,
        category: "ACCOMMODATION",
        label: `${room.place.name} — rent`,
        amountPaise: room.pricePaise,
        frequency: PRICE_BASIS_TO_FREQUENCY[room.priceBasis as PriceBasis],
        quantityPerFrequency: 1,
        kind: "FIXED",
        refundable: false,
        provenance: { sourceType: "VERIFIED", ref: room.id, stale: false },
      });

      if (room.depositPaise != null && room.depositPaise > 0n) {
        lineItems.push({
          id: `item_${item.id}_deposit`,
          category: "DEPOSIT",
          label: `${room.place.name} — deposit`,
          amountPaise: room.depositPaise,
          frequency: "ONE_TIME",
          quantityPerFrequency: 1,
          kind: "FIXED",
          refundable: true,
          provenance: { sourceType: "VERIFIED", ref: room.id, stale: false },
        });
      }
      continue;
    }

    if (item.kind === "FOOD" && item.foodPlanId) {
      const foodPlan = await prisma.foodPlan.findUnique({ where: { id: item.foodPlanId }, include: { place: true } });
      if (!foodPlan) continue;
      lineItems.push({
        id: `item_${item.id}_food`,
        category: "FOOD",
        label: `${foodPlan.place.name} — meal plan`,
        amountPaise: foodPlan.pricePaise,
        frequency: PRICE_BASIS_TO_FREQUENCY[foodPlan.priceBasis as PriceBasis],
        quantityPerFrequency: 1,
        kind: "VARIABLE",
        refundable: false,
        provenance: { sourceType: "VERIFIED", ref: foodPlan.id, stale: false },
      });
      continue;
    }

    if (item.custom) {
      const custom = item.custom as { label: string; amountPaise: string; frequency: Frequency; category: string };
      lineItems.push({
        id: `item_${item.id}_custom`,
        category: custom.category as LineItemInput["category"],
        label: custom.label,
        amountPaise: BigInt(custom.amountPaise),
        frequency: custom.frequency,
        quantityPerFrequency: 1,
        kind: "VARIABLE",
        refundable: false,
        provenance: { sourceType: "USER", ref: item.id, stale: false },
      });
    }
  }

  return {
    startDate: toDateOnly(plan.startDate),
    endDate: toDateOnly(plan.endDate),
    people: plan.people,
    monthlyIncomePaise: plan.monthlyIncomePaise,
    cashOnHandPaise: plan.cashOnHandPaise,
    bufferPercent: 10,
    lineItems,
    accommodation: accommodationBasis,
  };
}

export async function computeBudgetForPlan(planId: string, viewer: Viewer): Promise<BudgetResult> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  const owns =
    (viewer.kind === "user" && plan.ownerUserId === viewer.userId) ||
    (viewer.kind === "guest" && plan.guestSessionId === viewer.guestSessionId);
  if (!owns) throw new ForbiddenError("plans:read (not the owner of this plan)");

  const input = await buildBudgetInputForPlan(planId);
  return calculateBudget(input, { assumptionsVersion: "dev-unversioned" });
}
