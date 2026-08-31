import { NextResponse } from "next/server";
import { ActivityEvent } from "@stellarflow/types";
import { fetchRecentActivity } from "@/lib/api/client";

export const dynamic = "force-dynamic";

const INDEXER_URL = process.env.STELLARFLOW_INDEXER_URL || "http://localhost:4000";

/**
 * REST fallback for the activity feed: proxies the event indexer's recent
 * events endpoint. Returns an empty list (source: "none") when the indexer
 * is unavailable so the UI never hard-fails.
 */
export async function GET() {
  try {
    const { events, source } = await fetchRecentActivity(INDEXER_URL);
    return NextResponse.json({ events, source, fetchedAt: new Date().toISOString() });
  } catch {
    return NextResponse.json({
      events: [] as ActivityEvent[],
      source: "none",
      error: "indexer unavailable",
    });
  }
}
