"use client";

import { useState } from "react";

/**
 * API_SPEC.md §3: POST /places/:id/contact-reveal. A phone number is
 * sensitive-ish contact data an owner shared for exactly this purpose
 * (DATA_STRATEGY.md §6: owner consent to publish contact info) — kept out
 * of the initial page load and the URL, revealed only on an explicit
 * click, via a plain client-side fetch rather than a Server Action +
 * redirect (which would either need to pass it through a query string, or
 * add an extra round trip for no benefit here).
 */
export function ContactReveal({ placeId }: { placeId: string }) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "revealed"; phoneE164: string | null; whatsappE164: string | null }
    | { status: "error"; message: string }
  >({ status: "idle" });

  async function reveal() {
    setState({ status: "loading" });
    try {
      const res = await fetch(`/api/v1/places/${placeId}/contact-reveal`, { method: "POST" });
      if (res.status === 429) {
        setState({ status: "error", message: "Too many requests — try again in a bit." });
        return;
      }
      if (!res.ok) {
        setState({ status: "error", message: "Couldn't load contact details." });
        return;
      }
      const data = await res.json();
      setState({ status: "revealed", phoneE164: data.phoneE164, whatsappE164: data.whatsappE164 });
    } catch {
      setState({ status: "error", message: "Couldn't load contact details." });
    }
  }

  if (state.status === "revealed") {
    if (!state.phoneE164 && !state.whatsappE164) {
      return <p className="text-sm text-slate-600">No contact number on file for this listing yet.</p>;
    }
    return (
      <div className="text-sm">
        {state.phoneE164 && (
          <p>
            Phone: <a href={`tel:${state.phoneE164}`} className="text-teal-800 underline">{state.phoneE164}</a>
          </p>
        )}
        {state.whatsappE164 && (
          <p>
            WhatsApp:{" "}
            <a href={`https://wa.me/${state.whatsappE164.replace("+", "")}`} className="text-teal-800 underline">
              {state.whatsappE164}
            </a>
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={reveal}
        disabled={state.status === "loading"}
        className="rounded-md border border-teal-700 px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50 disabled:opacity-60"
      >
        {state.status === "loading" ? "Loading…" : "Show contact"}
      </button>
      {state.status === "error" && <p className="mt-1 text-sm text-red-700">{state.message}</p>}
    </div>
  );
}
