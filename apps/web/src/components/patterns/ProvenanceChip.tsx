import { deriveProvenanceDisplay, type FactProvenance, type FreshnessFactKey } from "@livo/schemas";

/**
 * UX_UI_SPEC.md §2: "Verified · 12 days ago" / "Estimated" / "From
 * property" / "May be outdated" — always icon + text, never colour alone
 * (SECURITY.md / accessibility: colour-blind users must not lose this
 * signal).
 */
const LABELS: Record<string, { text: string; tone: "good" | "neutral" | "warn" }> = {
  VERIFIED: { text: "Verified", tone: "good" },
  FROM_BUSINESS: { text: "From property", tone: "neutral" },
  FROM_API: { text: "From data source", tone: "neutral" },
  ESTIMATED: { text: "Estimated", tone: "neutral" },
  REPORTED_BY_USERS: { text: "Reported by users", tone: "neutral" },
  MAY_BE_OUTDATED: { text: "May be outdated", tone: "warn" },
};

const TONE_CLASSES: Record<"good" | "neutral" | "warn", string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
};

export function ProvenanceChip({
  provenance,
  factKey,
}: {
  provenance: Pick<FactProvenance, "sourceType" | "observedAt">;
  factKey: FreshnessFactKey;
}) {
  const display = deriveProvenanceDisplay(provenance, factKey);
  const label = LABELS[display.label];
  const ageText =
    display.ageDays === 0 ? "today" : display.ageDays === 1 ? "1 day ago" : `${display.ageDays} days ago`;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[label.tone]}`}
      title={`Source: ${label.text}, observed ${ageText}`}
    >
      <span aria-hidden>{label.tone === "good" ? "✓" : label.tone === "warn" ? "⚠" : "ℹ"}</span>
      {label.text}
      <span className="text-slate-400">&middot; {ageText}</span>
    </span>
  );
}
