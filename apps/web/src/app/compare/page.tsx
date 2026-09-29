import Link from "next/link";
import { prisma } from "@livo/db";
import { getDistanceToDestination } from "@livo/db/geo";
import { estimateByDistance } from "@/modules/search/estimate.js";
import { Scale } from "lucide-react";
import { Money } from "@/components/patterns/Money.js";
import { PlaceVisual } from "@/components/patterns/PlaceVisual.js";
import { Badge, ButtonLink, Card, EmptyState, Notice, PageHeader } from "@/components/ui/index.js";

export const dynamic = "force-dynamic";

interface CompareRow {
  placeId: string;
  slug: string;
  name: string;
  kind: string | null;
  occupancy: string;
  ac: boolean;
  privateBath: boolean;
  pricePaise: bigint;
  priceBasis: string;
  depositPaise: bigint | null;
  foodIncluded: boolean | null;
  distanceM: number | null;
  commuteMinRange: string;
}

const BASIS_SUFFIX: Record<string, string> = {
  PER_MONTH: "/mo",
  PER_NIGHT: "/night",
  PER_WEEK: "/week",
  PER_DAY: "/day",
};

async function loadCompareRow(compareId: string, destinationId: string): Promise<CompareRow | null> {
  const [placeId, roomOptionId] = compareId.split(".");
  if (!placeId || !roomOptionId) return null;

  const room = await prisma.roomOption.findUnique({
    where: { id: roomOptionId },
    include: { place: { include: { accommodationDetail: true } } },
  });
  if (!room || room.placeId !== placeId) return null;

  const distanceM = await getDistanceToDestination(placeId, destinationId);
  const commuteMinRange =
    distanceM != null
      ? (() => {
          const e = estimateByDistance(distanceM);
          return `${Math.round(e.durationSMin / 60)}–${Math.round(e.durationSMax / 60)} min (${e.mode.toLowerCase()})`;
        })()
      : "Unknown";

  return {
    placeId,
    slug: room.place.slug,
    name: room.place.name,
    kind: room.place.accommodationDetail?.kind ?? null,
    occupancy: room.occupancy,
    ac: room.ac,
    privateBath: room.privateBath,
    pricePaise: room.pricePaise,
    priceBasis: room.priceBasis,
    depositPaise: room.depositPaise,
    foodIncluded: room.place.accommodationDetail?.foodIncluded ?? null,
    distanceM,
    commuteMinRange,
  };
}

/**
 * Compare (UX_UI_SPEC.md §5.12). Rows are grouped attributes, columns are
 * the up-to-3 selected listings; trade-offs are stated as plain sentences
 * (ADR-014: no "winner" badge, no opaque score).
 */
export default async function ComparePage({
  searchParams,
}: {
  searchParams: { items?: string; destinationId?: string };
}) {
  const ids = (searchParams.items ?? "").split(",").filter(Boolean).slice(0, 3);
  const destinationId = searchParams.destinationId;

  if (ids.length < 2 || !destinationId) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <EmptyState
          icon={<Scale className="h-5 w-5" />}
          title="Nothing to compare yet"
          description='Tick "Compare" on 2–3 listings in search results.'
          action={<ButtonLink href="/">Start searching</ButtonLink>}
        />
      </main>
    );
  }

  const rows = (await Promise.all(ids.map((id) => loadCompareRow(id, destinationId)))).filter(
    (r): r is CompareRow => r !== null,
  );

  if (rows.length < 2) {
    return (
      <main className="mx-auto max-w-xl px-4 py-20">
        <EmptyState title="Couldn't load enough listings to compare" action={<ButtonLink href="/">Back to search</ButtonLink>} />
      </main>
    );
  }

  const cheapest = rows.reduce((a, b) => (a.pricePaise < b.pricePaise ? a : b));
  const closest = rows.reduce((a, b) => ((a.distanceM ?? Infinity) < (b.distanceM ?? Infinity) ? a : b));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <PageHeader
        title={`Compare ${rows.length} places`}
        eyebrow={
          <Link href={`/search?destinationId=${destinationId}`} className="font-medium hover:text-ink">
            ← Back to results
          </Link>
        }
      />

      {rows.length === 2 && (
        <div className="mb-5">
          <Notice icon={<Scale className="h-4 w-4" />}>{tradeOffSentence(rows[0], rows[1])}</Notice>
        </div>
      )}

      <Card className="overflow-x-auto p-2 sm:p-4">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">Side-by-side comparison of selected accommodation listings</caption>
          <thead>
            <tr>
              <th className="w-32 py-2 text-left text-slate-600">&nbsp;</th>
              {rows.map((r) => (
                <th key={r.placeId} className="p-2 text-left align-top">
                  <PlaceVisual id={r.placeId} kind={r.kind ?? "PG"} className="mb-2 h-20 w-full rounded-xl" />
                  <Link href={`/p/${r.slug}`} className="font-semibold text-ink hover:underline">
                    {r.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {r === cheapest && <Badge tone="brand">Cheapest</Badge>}
                    {r === closest && <Badge tone="brand">Closest</Badge>}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <CompareRowTr
              label="Price"
              cells={rows.map((r) => (
                <span key={r.placeId} className={r === cheapest ? "font-semibold text-brand-700" : undefined}>
                  <Money paise={r.pricePaise} suffix={BASIS_SUFFIX[r.priceBasis] ?? ""} />
                </span>
              ))}
            />
            <CompareRowTr
              label="Deposit"
              cells={rows.map((r) => (r.depositPaise != null ? <Money key={r.placeId} paise={r.depositPaise} /> : "—"))}
            />
            <CompareRowTr
              label="Commute"
              cells={rows.map((r) => (
                <span key={r.placeId} className={r === closest ? "font-semibold text-brand-700" : undefined}>
                  {r.commuteMinRange}
                </span>
              ))}
            />
            <CompareRowTr label="Occupancy" cells={rows.map((r) => r.occupancy)} />
            <CompareRowTr label="AC" cells={rows.map((r) => (r.ac ? "Yes" : "No"))} />
            <CompareRowTr label="Bathroom" cells={rows.map((r) => (r.privateBath ? "Private" : "Shared"))} />
            <CompareRowTr label="Food included" cells={rows.map((r) => (r.foodIncluded ? "Yes" : "No"))} />
            <CompareRowTr label="Kind" cells={rows.map((r) => r.kind ?? "—")} />
          </tbody>
        </table>
      </Card>
    </main>
  );
}

function tradeOffSentence(a: CompareRow, b: CompareRow): string {
  const priceDiff = a.pricePaise - b.pricePaise;
  const cheaper = priceDiff <= 0n ? a : b;
  const pricier = priceDiff <= 0n ? b : a;
  const diffPaise = priceDiff < 0n ? -priceDiff : priceDiff;

  if (diffPaise === 0n) return `${a.name} and ${b.name} cost the same per ${BASIS_SUFFIX[a.priceBasis]?.slice(1) ?? "period"}.`;

  const distA = a.distanceM ?? 0;
  const distB = b.distanceM ?? 0;
  const timeNote =
    cheaper.name === (distA < distB ? a.name : b.name)
      ? " and is also closer."
      : ` but is further from your destination.`;

  return `${cheaper.name} is cheaper than ${pricier.name}${timeNote}`;
}

function CompareRowTr({ label, cells }: { label: string; cells: React.ReactNode[] }) {
  return (
    <tr className="border-t border-slate-100">
      <th className="p-2 pr-3 text-left font-medium text-slate-600">{label}</th>
      {cells.map((c, i) => (
        <td key={i} className="p-2 pr-4 text-ink">
          {c}
        </td>
      ))}
    </tr>
  );
}
