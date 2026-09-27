import { formatPaise, formatPaiseRange } from "@livo/schemas";

/**
 * Renders paise as en-IN rupees with tabular figures (UX_UI_SPEC.md §2:
 * "always tabular nums"). Money is never shown as a raw number without a
 * unit or a basis suffix when one applies.
 */
export function Money({
  paise,
  suffix,
  className,
}: {
  paise: bigint;
  suffix?: string;
  className?: string;
}) {
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatPaise(paise)}
      {suffix ? <span className="text-slate-600">{suffix}</span> : null}
    </span>
  );
}

export function MoneyRange({ min, max, className }: { min: bigint; max: bigint; className?: string }) {
  return (
    <span className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatPaiseRange(min, max)}
    </span>
  );
}
