import type { AccommodationSearchItem, FoodSearchItem } from "@livo/schemas";
import { formatPaise } from "@livo/schemas";
import type { MapMarker } from "@/components/patterns/MapView.js";

/** Pure transforms from search results to map markers — kept separate from MapView so they're testable without a browser/WebGL. */

export function accommodationMarkers(items: AccommodationSearchItem[]): MapMarker[] {
  return items.map((item) => ({
    id: `${item.placeId}-${item.room.id}`,
    lat: item.location.lat,
    lng: item.location.lng,
    label: item.name,
    priceLabel: formatPaise(item.room.pricePaise),
    href: `/p/${item.slug}`,
  }));
}

export function foodMarkers(items: FoodSearchItem[]): MapMarker[] {
  return items.map((item) => ({
    id: item.foodPlan.id,
    lat: item.location.lat,
    lng: item.location.lng,
    label: item.name,
    priceLabel: formatPaise(item.foodPlan.pricePaise),
    href: `/food#${item.foodPlan.id}`,
  }));
}

/** Centroid of a set of markers, falling back to a given default when there are none. */
export function centerOf(
  markers: Array<{ lat: number; lng: number }>,
  fallback: { lat: number; lng: number },
): { lat: number; lng: number } {
  if (markers.length === 0) return fallback;
  const lat = markers.reduce((sum, m) => sum + m.lat, 0) / markers.length;
  const lng = markers.reduce((sum, m) => sum + m.lng, 0) / markers.length;
  return { lat, lng };
}
