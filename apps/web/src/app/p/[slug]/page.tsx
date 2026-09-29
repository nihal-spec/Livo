import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Clock, Flag, MapPin, Phone, ScrollText, ShieldCheck, Users } from "lucide-react";
import { prisma } from "@livo/db";
import { Money } from "@/components/patterns/Money.js";
import { ProvenanceChip } from "@/components/patterns/ProvenanceChip.js";
import { ContactReveal } from "@/components/patterns/ContactReveal.js";
import { PlaceVisual } from "@/components/patterns/PlaceVisual.js";
import { Badge, Card, Notice, buttonClass, fieldClass } from "@/components/ui/index.js";
import { REPORT_REASONS } from "@/modules/places/index.js";
import { submitReportAction } from "@/app/actions/places.js";
import { addAccommodationToNewPlan } from "@/app/actions/plans.js";
import { resolveViewerReadOnly } from "@/modules/auth/index.js";
import { findOwnedPlan } from "@/modules/plans/index.js";

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

const KIND_LABEL: Record<string, string> = {
  PG: "PG",
  HOSTEL: "Hostel",
  COLIVING: "Co-living",
  ROOM_RENTAL: "Room",
  LODGE: "Lodge",
  HOTEL: "Hotel",
  SERVICE_APARTMENT: "Service apartment",
  DORMITORY: "Dormitory",
};

const GENDER_LABEL: Record<string, string> = {
  MEN: "Men only",
  WOMEN: "Women only",
  ANY: "Anyone",
  FAMILY: "Families",
};

const OCCUPANCY_LABEL: Record<string, string> = {
  SINGLE: "Single",
  DOUBLE: "Double sharing",
  TRIPLE: "Triple sharing",
  DORM_4PLUS: "Dorm (4+)",
  WHOLE_UNIT: "Whole unit",
};

const REASON_LABEL: Record<string, string> = {
  WRONG_PRICE: "Price is wrong",
  CLOSED: "This place has closed",
  WRONG_LOCATION: "Location/pin is wrong",
  FAKE: "This listing looks fake",
  OTHER: "Something else",
};

/**
 * Place detail (UX_UI_SPEC.md §5.8). Everything shown is a real DB fact
 * with its provenance, never invented copy. Opened from inside the plan
 * wizard (?planId=), each room can be added straight to that plan.
 */
export default async function PlaceDetailPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { reported?: string; reportError?: string; planId?: string };
}) {
  const place = await getPlace(params.slug);
  if (!place) notFound();

  const plan = searchParams.planId ? await findOwnedPlan(searchParams.planId, await resolveViewerReadOnly()) : null;
  const provenanceByFactKey = new Map(place.provenances.map((p) => [p.factKey, p]));
  const detail = place.accommodationDetail;
  const attributes = (place.attributes ?? {}) as { sample?: boolean; synthetic?: boolean };
  const isSample = Boolean(attributes.sample || attributes.synthetic);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      {plan && (
        <Link
          href={`/search?destinationId=${plan.destinationId}&planId=${plan.id}`}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to results
        </Link>
      )}

      <div className="overflow-hidden rounded-3xl shadow-card">
        <PlaceVisual id={place.id} kind={detail?.kind ?? "PG"} className="h-48 w-full sm:h-64" />
      </div>

      {isSample && (
        <div className="mt-4">
          <Notice tone="amber">
            This is a <strong>sample listing</strong> for demonstration — not a real, verified place. Prices and details are
            illustrative.
          </Notice>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="flex flex-wrap gap-2">
            {detail && <Badge>{KIND_LABEL[detail.kind] ?? detail.kind}</Badge>}
            {detail && <Badge>{GENDER_LABEL[detail.genderPolicy] ?? detail.genderPolicy}</Badge>}
            {detail?.foodIncluded && <Badge tone="brand">Food included</Badge>}
            {isSample && <Badge tone="violet">Sample listing</Badge>}
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink">{place.name}</h1>
          <p className="mt-2 flex items-start gap-1.5 text-slate-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {place.addressLine}
            {place.landmark ? `, near ${place.landmark}` : ""}
          </p>

          <section className="mt-8">
            <h2 className="text-lg font-semibold text-ink">Room options</h2>
            <ul className="mt-3 space-y-3">
              {place.roomOptions.map((room) => {
                const provenance = provenanceByFactKey.get(`room:${room.id}:price`);
                return (
                  <li key={room.id}>
                    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-ink">
                          {OCCUPANCY_LABEL[room.occupancy] ?? room.occupancy} · {room.ac ? "AC" : "Non-AC"} ·{" "}
                          {room.privateBath ? "Private bath" : "Shared bath"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                          {room.depositPaise != null && (
                            <span>
                              Deposit <Money paise={room.depositPaise} />
                            </span>
                          )}
                          {provenance ? (
                            <ProvenanceChip
                              provenance={{ sourceType: provenance.sourceType, observedAt: provenance.observedAt.toISOString() }}
                              factKey="price"
                            />
                          ) : (
                            <span className="text-xs text-slate-600">Unverified</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Money
                          paise={room.pricePaise}
                          suffix={BASIS_SUFFIX[room.priceBasis] ?? ""}
                          className="text-lg font-bold text-ink"
                        />
                        {plan && (
                          <form action={addAccommodationToNewPlan}>
                            <input type="hidden" name="planId" value={plan.id} />
                            <input type="hidden" name="roomOptionId" value={room.id} />
                            <button type="submit" className={buttonClass("primary", "sm")}>
                              Add to plan
                            </button>
                          </form>
                        )}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>

          {(detail?.rules || detail?.curfew || detail?.noticeDays) && (
            <section className="mt-8">
              <h2 className="text-lg font-semibold text-ink">House rules</h2>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {detail?.rules && (
                  <li className="flex gap-2">
                    <ScrollText className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    {detail.rules}
                  </li>
                )}
                {detail?.curfew && (
                  <li className="flex gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    Curfew {detail.curfew}
                  </li>
                )}
                {detail?.noticeDays != null && (
                  <li className="flex gap-2">
                    <Users className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                    {detail.noticeDays} days notice to leave
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <Phone className="h-4 w-4 text-slate-500" aria-hidden />
              Contact
            </h2>
            <p className="mt-1 text-sm text-slate-600">Talk to the owner directly — Livo takes no commission.</p>
            <div className="mt-3">
              <ContactReveal placeId={place.id} />
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <Flag className="h-4 w-4 text-slate-500" aria-hidden />
              Report a problem
            </h2>
            {searchParams.reported ? (
              <p className="mt-2 text-sm text-brand-800">Thanks — we&apos;ll take a look.</p>
            ) : (
              <form action={submitReportAction} className="mt-3 space-y-2">
                <input type="hidden" name="placeId" value={place.id} />
                <input type="hidden" name="placeSlug" value={place.slug} />
                <label htmlFor="report-reason" className="sr-only">
                  What&apos;s wrong?
                </label>
                <select id="report-reason" name="reason" required className={fieldClass}>
                  {REPORT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {REASON_LABEL[r]}
                    </option>
                  ))}
                </select>
                <label htmlFor="report-detail" className="sr-only">
                  Details
                </label>
                <textarea
                  id="report-detail"
                  name="detail"
                  maxLength={1000}
                  placeholder="Anything else we should know? (optional)"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                  rows={2}
                />
                <button type="submit" className={buttonClass("secondary", "sm")}>
                  Submit report
                </button>
                {searchParams.reportError && <p className="text-sm text-red-700">{searchParams.reportError}</p>}
              </form>
            )}
          </Card>

          <p className="flex gap-2 text-xs text-slate-600">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
            Every price shown here is either verified by our team or clearly labelled as an estimate.
          </p>
        </aside>
      </div>
    </main>
  );
}
