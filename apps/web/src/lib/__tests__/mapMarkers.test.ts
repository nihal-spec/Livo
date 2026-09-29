import { describe, expect, it } from "vitest";
import { accommodationMarkers, centerOf, foodMarkers } from "../mapMarkers.js";
import type { AccommodationSearchItem, FoodSearchItem } from "@livo/schemas";

function accItem(overrides: Partial<AccommodationSearchItem> = {}): AccommodationSearchItem {
  return {
    placeId: "place_1",
    slug: "test-place",
    name: "Test PG",
    kind: "PG",
    location: { lat: 10.01, lng: 76.35 },
    room: {
      id: "room_1",
      occupancy: "DOUBLE",
      ac: false,
      privateBath: true,
      pricePaise: 500_000n,
      priceBasis: "PER_MONTH",
      depositPaise: null,
    },
    foodIncluded: null,
    commute: null,
    monthlyTotalPaise: 500_000n,
    reasons: [],
    sponsored: false,
    isSample: false,
    ...overrides,
  };
}

function foodItem(overrides: Partial<FoodSearchItem> = {}): FoodSearchItem {
  return {
    placeId: "place_2",
    slug: "test-mess",
    name: "Test Mess",
    kind: "MESS",
    location: { lat: 10.02, lng: 76.36 },
    foodPlan: {
      id: "food_1",
      vegOnly: true,
      delivers: false,
      meals: ["LUNCH"],
      pricePaise: 280_000n,
      priceBasis: "PER_MONTH",
    },
    distanceM: 500,
    reasons: [],
    isSample: false,
    ...overrides,
  };
}

describe("accommodationMarkers", () => {
  it("maps each item to a marker with the right id, location, and link", () => {
    const markers = accommodationMarkers([accItem()]);
    expect(markers).toEqual([
      { id: "place_1-room_1", lat: 10.01, lng: 76.35, label: "Test PG", priceLabel: "₹5,000", href: "/p/test-place" },
    ]);
  });
});

describe("foodMarkers", () => {
  it("maps each item to a marker with the right id, location, and link", () => {
    const markers = foodMarkers([foodItem()]);
    expect(markers).toEqual([
      { id: "food_1", lat: 10.02, lng: 76.36, label: "Test Mess", priceLabel: "₹2,800", href: "/food#food_1" },
    ]);
  });
});

describe("centerOf", () => {
  it("returns the fallback for an empty list", () => {
    expect(centerOf([], { lat: 1, lng: 2 })).toEqual({ lat: 1, lng: 2 });
  });

  it("averages lat/lng across markers", () => {
    const center = centerOf(
      [
        { lat: 10, lng: 76 },
        { lat: 12, lng: 78 },
      ],
      { lat: 0, lng: 0 },
    );
    expect(center).toEqual({ lat: 11, lng: 77 });
  });
});
