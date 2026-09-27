import { randomBytes } from "node:crypto";
import { prisma } from "@livo/db";
import type { PlanPurpose, TripRequirements } from "@livo/schemas";
import type { Viewer } from "@/modules/auth/index.js";
import { ForbiddenError } from "@/modules/rbac/index.js";

/**
 * Plan builder service (MASTER_PLAN.md §17, API_SPEC.md §5). A plan is
 * owned by exactly one of {user, guest session} — enforced both here and
 * by the `plan_single_owner` DB CHECK constraint, so a bug here can't
 * silently corrupt ownership.
 */

export interface CreatePlanInput {
  title: string;
  purpose: PlanPurpose;
  destinationId: string;
  startDate: string; // date-only, e.g. "2026-11-01"
  endDate: string;
  people?: number;
  requirements: TripRequirements;
  monthlyIncomePaise?: bigint | null;
  budgetCapPaise?: bigint | null;
  cashOnHandPaise?: bigint | null;
}

export async function createPlan(viewer: Viewer, input: CreatePlanInput) {
  const owner =
    viewer.kind === "user"
      ? { ownerUserId: viewer.userId }
      : viewer.kind === "guest"
        ? { guestSessionId: viewer.guestSessionId }
        : (() => {
            throw new ForbiddenError("plans:create (sign in or start a guest session)");
          })();

  return prisma.plan.create({
    data: {
      ...owner,
      title: input.title,
      purpose: input.purpose,
      destinationId: input.destinationId,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      people: input.people ?? 1,
      requirements: input.requirements as never,
      monthlyIncomePaise: input.monthlyIncomePaise ?? null,
      budgetCapPaise: input.budgetCapPaise ?? null,
      cashOnHandPaise: input.cashOnHandPaise ?? null,
    },
  });
}

function assertOwns(
  plan: { ownerUserId: string | null; guestSessionId: string | null; shareToken: string | null },
  viewer: Viewer,
  shareToken?: string,
): void {
  if (shareToken && plan.shareToken && plan.shareToken === shareToken) return; // read-only share access
  if (viewer.kind === "user" && plan.ownerUserId === viewer.userId) return;
  if (viewer.kind === "guest" && plan.guestSessionId === viewer.guestSessionId) return;
  throw new ForbiddenError("plans:read (not the owner of this plan)");
}

/**
 * All plans owned by the current viewer (MASTER_PLAN.md §39, V1: a plans
 * list page). An anonymous viewer owns nothing yet — no guest session has
 * been minted for them — so this returns an empty list rather than
 * throwing; the page renders its own "no plans yet" state for that case.
 */
export async function listPlans(viewer: Viewer) {
  const owner =
    viewer.kind === "user"
      ? { ownerUserId: viewer.userId }
      : viewer.kind === "guest"
        ? { guestSessionId: viewer.guestSessionId }
        : null;
  if (!owner) return [];

  return prisma.plan.findMany({
    where: { ...owner, deletedAt: null },
    include: { destination: true, items: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getPlan(planId: string, viewer: Viewer, shareToken?: string) {
  const plan = await prisma.plan.findUnique({
    where: { id: planId },
    include: { items: { orderBy: { position: "asc" } }, destination: true },
  });
  if (!plan || plan.deletedAt) return null;
  assertOwns(plan, viewer, shareToken);
  return plan;
}

export interface AddItemInput {
  kind: "ACCOMMODATION" | "FOOD" | "TRANSPORT" | "CUSTOM_COST";
  placeId?: string;
  roomOptionId?: string;
  foodPlanId?: string;
  custom?: { label: string; amountPaise: string; frequency: string; category: string };
}

export async function addPlanItem(planId: string, viewer: Viewer, input: AddItemInput) {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  assertOwns(plan, viewer);

  const position = await prisma.planItem.count({ where: { planId } });
  return prisma.planItem.create({
    data: {
      planId,
      kind: input.kind,
      placeId: input.placeId,
      roomOptionId: input.roomOptionId,
      foodPlanId: input.foodPlanId,
      custom: input.custom as never,
      position,
    },
  });
}

export async function removePlanItem(planId: string, itemId: string, viewer: Viewer): Promise<void> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  assertOwns(plan, viewer);
  await prisma.planItem.deleteMany({ where: { id: itemId, planId } });
}

export async function setPlanSharing(planId: string, viewer: Viewer, enabled: boolean): Promise<string | null> {
  const plan = await prisma.plan.findUniqueOrThrow({ where: { id: planId } });
  assertOwns(plan, viewer);

  const shareToken = enabled ? randomBytes(16).toString("base64url") : null;
  await prisma.plan.update({ where: { id: planId }, data: { shareToken } });
  return shareToken;
}
