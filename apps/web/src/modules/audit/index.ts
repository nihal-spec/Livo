import { prisma, type Prisma } from "@livo/db";

/**
 * Append-only audit log (DATABASE_DESIGN.md §6, SECURITY.md §2). Every admin
 * mutation writes one of these rows in the same transaction as the change
 * it describes — call `withAudit` from inside the service function that
 * performs the mutation, passing the same `tx` if one is open.
 */

export type ActorType = "USER" | "ADMIN" | "SYSTEM" | "AI_TOOL";

export interface AuditEntry {
  actorUserId: string | null;
  actorType: ActorType;
  action: string; // e.g. "place.update", "user.suspend", "role.grant"
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  requestId: string;
  ipHash?: string;
}

type TxClient = Prisma.TransactionClient | typeof prisma;

export async function withAudit(tx: TxClient, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorUserId: entry.actorUserId,
      actorType: entry.actorType,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? undefined : (entry.before as Prisma.InputJsonValue),
      after: entry.after === undefined ? undefined : (entry.after as Prisma.InputJsonValue),
      reason: entry.reason,
      requestId: entry.requestId,
      ipHash: entry.ipHash,
    },
  });
}

/**
 * Convenience wrapper: runs `mutate` inside a transaction and writes the
 * audit entry alongside it, so a failed mutation never produces an audit
 * row and a written audit row always reflects a committed change.
 */
export async function mutateWithAudit<T>(
  entry: Omit<AuditEntry, "before" | "after"> & { before?: unknown },
  mutate: (tx: Prisma.TransactionClient) => Promise<{ result: T; after?: unknown }>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const { result, after } = await mutate(tx);
    await withAudit(tx, { ...entry, after });
    return result;
  });
}
