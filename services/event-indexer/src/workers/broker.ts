import { ActivityEvent } from "@stellarflow/types";

/**
 * Minimal in-memory pub/sub used to fan normalized events out to SSE
 * subscribers. For multi-instance deployments, swap this for Redis pub/sub
 * or a Postgres LISTEN/NOTIFY channel (see docs/deployment.md).
 */
export class Broker {
  private listeners = new Set<(event: ActivityEvent) => void>();

  subscribe(listener: (event: ActivityEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: ActivityEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[broker] subscriber threw", error);
      }
    }
  }

  get subscriberCount(): number {
    return this.listeners.size;
  }
}
