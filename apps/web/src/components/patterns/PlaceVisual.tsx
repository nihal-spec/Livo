import { BedDouble, Building2, Hotel, Soup, Store, UtensilsCrossed } from "lucide-react";
import { cn } from "@/components/ui/index.js";

const GRADIENTS = [
  "from-brand-400 to-brand-700",
  "from-sky-400 to-indigo-600",
  "from-amber-300 to-orange-500",
  "from-rose-300 to-fuchsia-600",
  "from-emerald-300 to-teal-600",
  "from-violet-400 to-purple-700",
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

const ICONS = {
  PG: BedDouble,
  HOSTEL: BedDouble,
  COLIVING: Building2,
  HOTEL: Hotel,
  LODGE: Hotel,
  MESS: Soup,
  TIFFIN: UtensilsCrossed,
  RESTAURANT: UtensilsCrossed,
  CLOUD_KITCHEN: Store,
} as const;

/**
 * There is no photo pipeline yet, and Livo never shows stock photography
 * as if it were the real place (UX_UI_SPEC.md §2). So instead of a fake
 * photo, each place gets a stable, colourful tile keyed off its id, with
 * an icon for what kind of place it is.
 */
export function PlaceVisual({ id, kind, className }: { id: string; kind: string; className?: string }) {
  const Icon = ICONS[kind as keyof typeof ICONS] ?? Building2;
  const gradient = GRADIENTS[hash(id) % GRADIENTS.length];
  return (
    <div
      className={cn("relative flex items-center justify-center overflow-hidden bg-gradient-to-br", gradient, className)}
      aria-hidden
    >
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/15" />
      <div className="absolute -bottom-8 -left-4 h-20 w-20 rounded-full bg-white/10" />
      <Icon className="relative h-10 w-10 text-white/90" strokeWidth={1.6} />
    </div>
  );
}
