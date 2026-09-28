import { prisma } from "@livo/db";

/**
 * Matches the AI's free-text "destinationText" against real destination
 * rows already in the database — the AI never invents or returns a
 * destination ID itself (AI_ARCHITECTURE.md's core guardrail: only tool/DB
 * output can produce an ID the rest of the pipeline trusts).
 */
export async function resolveDestinationByText(
  text: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!text || text.trim().length === 0) return null;

  const needle = text.trim().toLowerCase();

  const exact = await prisma.destination.findFirst({
    where: { name: { equals: text.trim(), mode: "insensitive" } },
  });
  if (exact) return { id: exact.id, name: exact.name };

  const candidates = await prisma.destination.findMany({
    where: { name: { contains: needle, mode: "insensitive" } },
    take: 5,
  });
  if (candidates.length > 0) return { id: candidates[0].id, name: candidates[0].name };

  // Try the other direction: the destination name appears inside the text
  // (e.g. "near Infopark" vs a destination named "Infopark Phase 1").
  const anchors = await prisma.destination.findMany({ where: { isAnchor: true } });
  const containing = anchors.find((a) => needle.includes(a.name.toLowerCase()));
  return containing ? { id: containing.id, name: containing.name } : null;
}
