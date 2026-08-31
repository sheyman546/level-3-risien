"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityEvent } from "@stellarflow/types";
import { fetchRecentActivity } from "@/lib/api/client";
import { getIndexerUrl } from "@/lib/stellar/client";

export type ActivityStatus = "idle" | "connecting" | "live" | "reconnecting" | "error";

const MAX_EVENTS = 100;

/**
 * Subscribe to the event indexer over SSE (`GET /events`) and prepend events
 * to the feed. On startup, history is loaded from `GET /events/recent`.
 * Falls back to the local API route when the indexer is unreachable.
 */
export function useActivity() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [status, setStatus] = useState<ActivityStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const indexerUrl = getIndexerUrl();

  const loadRecent = useCallback(async () => {
    try {
      const { events: recent } = await fetchRecentActivity(indexerUrl);
      if (recent.length > 0) {
        setEvents((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          return [...recent.filter((e) => !ids.has(e.id)), ...prev].slice(0, MAX_EVENTS);
        });
      }
    } catch {
      // ignore — history is best-effort
    }
  }, [indexerUrl]);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (disposed) return;
      setStatus("connecting");
      let es: EventSource;
      try {
        es = new EventSource(`${indexerUrl}/events`);
        esRef.current = es;
      } catch {
        setStatus("error");
        setError("Could not connect to the event indexer.");
        return;
      }

      es.onopen = () => {
        if (disposed) return;
        setStatus("live");
        setError(null);
      };

      es.onmessage = (message: MessageEvent<string>) => {
        if (disposed) return;
        try {
          const event = JSON.parse(message.data) as ActivityEvent;
          setEvents((prev) => [event, ...prev.filter((e) => e.id !== event.id)].slice(0, MAX_EVENTS));
        } catch {
          // ignore malformed frames
        }
      };

      es.onerror = () => {
        if (disposed) return;
        setStatus("reconnecting");
        setError("Lost connection to the event indexer — reconnecting…");
        es.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    };

    void loadRecent();
    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      esRef.current?.close();
    };
  }, [indexerUrl, loadRecent]);

  return { events, status, error };
}
