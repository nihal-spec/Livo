import Link from "next/link";
import { prisma } from "@livo/db";
import { getDistanceToDestination } from "@livo/db/geo";
import { estimateByDistance } from "@/modules/search/estimate.js";
import { Money } from "@/components/patterns/Money.js";

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
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Nothing to compare yet</h1>
        <p className="mt-2 text-slate-600">
          Go back to <Link href="/" className="text-teal-700 underline">search</Link> and tick &quot;Compare&quot; on
          2–3 listings.
        </p>
      </main>
    );
  }

  const rows = (await Promise.all(ids.map((id) => loadCompareRow(id, destinationId)))).filter(
    (r): r is CompareRow => r !== null,
  );

  if (rows.length < 2) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Couldn&apos;t load enough listings to compare</h1>
      </main>
    );
  }

  const cheapest = rows.reduce((a, b) => (a.pricePaise < b.pricePaise ? a : b));
  const closest = rows.reduce((a, b) => ((a.distanceM ?? Infinity) < (b.distanceM ?? Infinity) ? a : b));

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-4 text-xl font-semibold text-slate-900">Compare {rows.length} places</h1>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <caption className="sr-only">Side-by-side comparison of selected accommodation listings</caption>
          <thead>
            <tr>
              <th className="w-32 py-2 text-left text-slate-500">&nbsp;</th>
              {rows.map((r) => (
                <th key={r.placeId} className="py-2 text-left">
                  <Link href={`/p/${r.slug}`} className="font-semibold text-slate-900 hover:underline">
                    {r.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <CompareRowTr
              label="Price"
              cells={rows.map((r) => (
                <span key={r.placeId} className={r === cheapest ? "font-semibold text-emerald-800" : undefined}>
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
                <span key={r.placeId} className={r === closest ? "font-semibold text-emerald-800" : undefined}>
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
      </div>

      {rows.length === 2 && (
        <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          {tradeOffSentence(rows[0], rows[1])}
        </p>
      )}
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
    <tr className="border-t border-slate-200">
      <th className="py-2 pr-2 text-left font-medium text-slate-500">{label}</th>
      {cells.map((c, i) => (
        <td key={i} className="py-2 pr-4">
          {c}
        </td>
      ))}
    </tr>
  );
}
