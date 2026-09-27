import Link from "next/link";
import { prisma } from "@livo/db";

export const dynamic = "force-dynamic";

/**
 * Landing (UX_UI_SPEC.md §5.1): get to a useful result in one step. No
 * hero image, no gradients/sparkles — a destination picker and real trust
 * numbers computed from the database, not placeholder copy.
 */
export default async function Home() {
  const [anchors, totalPlaces, verifiedProvenance] = await Promise.all([
    prisma.destination.findMany({ where: { isAnchor: true }, orderBy: { name: "asc" } }),
    prisma.place.count({ where: { status: "PUBLISHED", category: "ACCOMMODATION", deletedAt: null } }),
    prisma.factProvenance.count({ where: { sourceType: "VERIFIED" } }),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="mb-4 text-right">
        <Link href="/plans" className="text-sm text-teal-700 underline">
          My plans →
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">
        Plan your stay near work, college or hospital — with real costs
      </h1>
      <p className="mt-2 text-slate-600">
        {totalPlaces} places listed{verifiedProvenance > 0 ? `, ${verifiedProvenance} facts verified by phone` : ""}.
        No invented prices — every number shows where it came from.
      </p>

      <form method="GET" action="/search" className="mt-8 flex gap-2">
        <label htmlFor="destinationId" className="sr-only">
          Where do you need to be?
        </label>
        <select
          id="destinationId"
          name="destinationId"
          required
          defaultValue=""
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-slate-900"
        >
          <option value="" disabled>
            Where do you need to be?
          </option>
          {anchors.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-teal-700 px-5 py-2 font-medium text-white hover:bg-teal-800">
          See places &amp; costs
        </button>
      </form>

      <div className="mt-10">
        <h2 className="text-sm font-medium text-slate-600">Popular destinations</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {anchors.slice(0, 8).map((a) => (
            <li key={a.id}>
              <a
                href={`/search?destinationId=${a.id}`}
                className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:border-teal-600 hover:text-teal-800"
              >
                {a.name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
