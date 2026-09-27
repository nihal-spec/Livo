import { notFound } from "next/navigation";
import { prisma } from "@livo/db";
import type { Metadata } from "next";
import { Money } from "@/components/patterns/Money.js";
import { ProvenanceChip } from "@/components/patterns/ProvenanceChip.js";

export const dynamic = "force-dynamic";

async function getPlace(slug: string) {
  const place = await prisma.place.findUnique({
    where: { slug },
    include: {
      accommodationDetail: true,
      roomOptions: { orderBy: { pricePaise: "asc" } },
      provenances: { orderBy: { observedAt: "desc" } },
    },
  });
  if (!place || place.deletedAt || place.status !== "PUBLISHED") return null;
  return place;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const place = await getPlace(params.slug);
  if (!place) return { title: "Not found" };
  return { title: `${place.name} — Livo`, description: `${place.name}, ${place.addressLine}` };
}

const BASIS_SUFFIX: Record<string, string> = {
  PER_MONTH: "/mo",
  PER_NIGHT: "/night",
  PER_WEEK: "/week",
  PER_DAY: "/day",
};

/**
 * Place detail (UX_UI_SPEC.md §5.8). Photo strip and map are not
 * implemented yet (no photo pipeline / MapLibre wiring); everything shown
 * is a real DB fact with its provenance, never invented copy.
 */
export default async function PlaceDetailPage({ params }: { params: { slug: string } }) {
  const place = await getPlace(params.slug);
  if (!place) notFound();

  const provenanceByFactKey = new Map(place.provenances.map((p) => [p.factKey, p]));

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div
        className="flex h-40 w-full items-center justify-center rounded-lg bg-slate-100 text-4xl"
        aria-hidden
      >
        🏠
      </div>

      <h1 className="mt-4 text-2xl font-semibold text-slate-900">{place.name}</h1>
      <p className="text-slate-600">
        {place.accommodationDetail?.kind} · {place.accommodationDetail?.genderPolicy}
        {place.accommodationDetail?.foodIncluded ? " · Food included" : ""}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {place.addressLine}
        {place.landmark ? `, near ${place.landmark}` : ""}
      </p>

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Room options</h2>
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Available room types and prices at {place.name}</caption>
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-600">
              <th className="py-2 font-medium">Occupancy</th>
              <th className="py-2 font-medium">AC</th>
              <th className="py-2 font-medium">Bath</th>
              <th className="py-2 font-medium">Price</th>
              <th className="py-2 font-medium">Deposit</th>
              <th className="py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {place.roomOptions.map((room) => {
              const provenance = provenanceByFactKey.get(`room:${room.id}:price`);
              return (
                <tr key={room.id} className="border-b border-slate-100">
                  <td className="py-2">{room.occupancy}</td>
                  <td className="py-2">{room.ac ? "Yes" : "No"}</td>
                  <td className="py-2">{room.privateBath ? "Private" : "Shared"}</td>
                  <td className="py-2 font-medium">
                    <Money paise={room.pricePaise} suffix={BASIS_SUFFIX[room.priceBasis] ?? ""} />
                  </td>
                  <td className="py-2">{room.depositPaise != null ? <Money paise={room.depositPaise} /> : "—"}</td>
                  <td className="py-2">
                    {provenance ? (
                      <ProvenanceChip
                        provenance={{ sourceType: provenance.sourceType, observedAt: provenance.observedAt.toISOString() }}
                        factKey="price"
                      />
                    ) : (
                      <span className="text-xs text-slate-600">Unverified</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {place.accommodationDetail?.rules && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-600">Rules</h2>
          <p className="text-sm text-slate-700">{place.accommodationDetail.rules}</p>
        </section>
      )}

      <p className="mt-8 text-xs text-slate-600">
        Report a problem with this listing — coming soon. Every price shown here is either verified by our team or
        clearly labelled as an estimate.
      </p>
    </main>
  );
}
