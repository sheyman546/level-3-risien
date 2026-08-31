import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { EventStore } from "../db";
import { Broker } from "../workers/broker";

function json(res: ServerResponse, body: unknown, status = 200): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

/**
 * HTTP server exposing:
 *   GET /health        — liveness + stats
 *   GET /events        — Server-Sent Events stream of activity
 *   GET /events/recent — last N events as JSON (REST fallback)
 */
export class HttpServer {
  constructor(
    private readonly store: EventStore,
    private readonly broker: Broker,
    private readonly port: number,
  ) {}

  start(): void {
    const server = createServer((req, res) => void this.handle(req, res));
    server.listen(this.port, () => {
      console.log(`[indexer] http server listening on :${this.port}`);
    });
    server.on("error", (error) => {
      console.error("[indexer] http server error:", error);
    });
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    try {
      if (url.pathname === "/health") {
        json(res, {
          ok: true,
          service: "stellarflow-indexer",
          subscribers: this.broker.subscriberCount,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      if (url.pathname === "/events") {
        this.streamEvents(req, res);
        return;
      }
      if (url.pathname === "/events/recent") {
        const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
        const events = await this.store.recent(Number.isFinite(limit) ? limit : 50);
        json(res, events);
        return;
      }
      json(res, { error: "not found" }, 404);
    } catch (error) {
      console.error("[indexer] request failed:", error);
      json(res, { error: "internal error" }, 500);
    }
  }

  private streamEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write("retry: 3000\n\n");

    // Replay a bit of history on connect so the feed isn't empty
    void this.store
      .recent(20)
      .then((events) => {
        for (const event of events) {
          res.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
        }
      })
      .catch(() => undefined);

    const unsubscribe = this.broker.subscribe((event) => {
      res.write(`event: activity\ndata: ${JSON.stringify(event)}\n\n`);
    });

    req.on("close", unsubscribe);
  }
}
