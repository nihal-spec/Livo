import { NextResponse } from "next/server";
import { prisma } from "@livo/db";
import { env } from "@/config/env";

/**
 * Public minimal health check (API_SPEC.md §12). Detailed dependency status
 * is intentionally not exposed publicly — only that the app booted with
 * valid config and can reach the database.
 */
export async function GET() {
  const checks: Record<string, "ok" | "error"> = { config: "ok" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }

  const ok = Object.values(checks).every((v) => v === "ok");
  void env; // referenced to prove config loaded without throwing
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
