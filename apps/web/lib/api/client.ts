import { ActivityEvent } from "@stellarflow/types";

export interface ApiError {
  message: string;
}

async function fetchJSON<T>(url: string, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface RecentEventsResponse {
  events: ActivityEvent[];
  source: "indexer" | "none";
}

/** Fetch recent activity events, falling back gracefully when the indexer is down. */
export async function fetchRecentActivity(indexerUrl: string): Promise<RecentEventsResponse> {
  try {
    const events = await fetchJSON<ActivityEvent[]>(`${indexerUrl}/events/recent`);
    return { events, source: "indexer" };
  } catch {
    return { events: [], source: "none" };
  }
}
