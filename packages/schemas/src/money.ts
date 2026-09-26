import { z } from "zod";

/** All money is stored/passed as integer paise (1 rupee = 100 paise). Never use floats for money. */
export type Paise = bigint;

export const paiseSchema = z
  .union([z.bigint(), z.number().int(), z.string().regex(/^-?\d+$/)])
  .transform((v): Paise => BigInt(v));

export function rupeesToPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new Error("rupeesToPaise: not finite");
  return BigInt(Math.round(rupees * 100));
}

export function paiseToRupees(paise: Paise): number {
  return Number(paise) / 100;
}

/** en-IN formatted rupee string, e.g. "₹6,500" (rounded to nearest rupee). */
export function formatPaise(paise: Paise, opts: { withSymbol?: boolean } = {}): string {
  const rupees = Math.round(Number(paise) / 100);
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(rupees);
  return opts.withSymbol === false ? formatted : `₹${formatted}`;
}

export function formatPaiseRange(minP: Paise, maxP: Paise): string {
  if (minP === maxP) return formatPaise(minP);
  return `${formatPaise(minP)}–${formatPaise(maxP, { withSymbol: false })}`;
}

export function addPaise(...values: Paise[]): Paise {
  return values.reduce((acc, v) => acc + v, 0n);
}

export function clampPaise(value: Paise, min: Paise, max: Paise): Paise {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
