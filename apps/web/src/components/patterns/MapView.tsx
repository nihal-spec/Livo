"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPinOff } from "lucide-react";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string;
  priceLabel: string;
  href: string;
}

/**
 * Base map (ADR-010): MapLibre GL + raw OSM raster tiles. No API key, no
 * vector-tile hosting account — the honest MVP substitute for the
 * MapTiler/Stadia-hosted or self-hosted-Protomaps setup ADR-010 names as
 * the real target, the same kind of documented substitution as the
 * in-memory rate limiter (SECURITY.md §2) or the distance-based commute
 * estimate (MASTER_PLAN.md §43). Required attribution per OSM's tile
 * usage policy is rendered by MapLibre's built-in AttributionControl.
 *
 * UX_UI_SPEC.md §5.6's edge case is load-bearing here, not decorative:
 * "Map unavailable / OSM failure: list view remains fully usable; map
 * area shows 'Map unavailable' placeholder." A tile fetch failure (or no
 * WebGL support at all) must never take the results list down with it —
 * so map initialization is wrapped in error handling and this component
 * renders its own self-contained fallback, independent of the list next
 * to it.
 */
export function MapView({ markers, center }: { markers: MapMarker[]; center: { lat: number; lng: number } }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let map: MapLibreMap | undefined;
    // Tear the map down on failure, not just on unmount: otherwise its
    // absolutely-positioned canvas outlives the container and floats over
    // the page, swallowing clicks meant for the list.
    const fail = () => {
      map?.remove();
      map = undefined;
      setFailed(true);
    };
    try {
      map = new MapLibreMap({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            },
          },
          layers: [{ id: "osm", type: "raster", source: "osm" }],
        },
        center: [center.lng, center.lat],
        zoom: 13,
      });

      map.on("error", fail);

      for (const marker of markers) {
        const popup = new Popup({ offset: 12 }).setHTML(
          `<a href="${marker.href}" style="font-weight:600;color:#0f766e;text-decoration:underline">${escapeHtml(marker.label)}</a><br/><span>${escapeHtml(marker.priceLabel)}</span>`,
        );
        new Marker({ color: "#0f766e" }).setLngLat([marker.lng, marker.lat]).setPopup(popup).addTo(map);
      }
    } catch {
      fail();
    }

    return () => map?.remove();
  }, [markers, center]);

  if (failed) {
    return (
      <div key="map-fallback" className="flex h-full min-h-[240px] flex-col items-center justify-center gap-2 bg-slate-100 p-6 text-center text-sm text-slate-600">
        <MapPinOff className="h-6 w-6 text-slate-400" aria-hidden />
        Map unavailable right now — the list still has everything.
      </div>
    );
  }

  return <div key="map" ref={containerRef} className="h-full min-h-[240px] w-full" data-testid="map-view" />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
