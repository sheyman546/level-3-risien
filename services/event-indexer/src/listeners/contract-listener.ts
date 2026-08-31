import { rpc } from "@stellar/stellar-sdk";
import { IndexerConfig } from "../config";
import { EventStore } from "../db";
import { decodeEvent, normalize } from "../normalize";
import { Broker } from "../workers/broker";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pulls contract events from Stellar RPC (`getEvents`), normalizes them,
 * persists them to Postgres and publishes them to SSE subscribers.
 *
 * Cursor: the highest ledger seen so far is persisted in `indexer_state`, so
 * restarts resume where they left off.
 */
export class ContractListener {
  private server: rpc.Server;
  private running = false;
  private cursor: number;

  constructor(
    private readonly config: IndexerConfig,
    private readonly store: EventStore,
    private readonly broker: Broker,
  ) {
    this.server = new rpc.Server(config.rpcUrl);
    this.cursor = config.startLedger;
  }

  async start(): Promise<void> {
    this.running = true;
    this.cursor = Math.max(this.cursor, await this.store.getCursor());
    console.log(
      `[indexer] watching ${this.config.contractIds.length} contract(s) on ${this.config.rpcUrl} ` +
        `(from ledger ${this.cursor}, poll ${this.config.pollIntervalMs}ms)`,
    );
    try {
      await this.poll();
    } catch (error) {
      console.error("[indexer] initial poll failed:", error instanceof Error ? error.message : error);
    }
    while (this.running) {
      await sleep(this.config.pollIntervalMs);
      try {
        await this.poll();
      } catch (error) {
        console.error("[indexer] poll failed:", error instanceof Error ? error.message : error);
      }
    }
  }

  stop(): void {
    this.running = false;
  }

  private async poll(): Promise<void> {
    const latest = await this.server.getLatestLedger();
    if (this.cursor >= latest.sequence) return;
    const startLedger = this.cursor + 1;

    const response = await this.server.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds: this.config.contractIds }],
      limit: this.config.batchSize,
    });

    let newEvents = 0;
    for (const raw of response.events) {
      if (raw.type !== "contract") continue;
      if (raw.inSuccessfulContractCall === false) continue; // skip reverted calls
      const decoded = decodeEvent(raw);
      if (!decoded) continue;
      const event = normalize(decoded);
      await this.store.insertEvent(event);
      this.broker.publish(event);
      this.cursor = Math.max(this.cursor, raw.ledger);
      newEvents += 1;
    }
    await this.store.setCursor(this.cursor);
    if (newEvents > 0) {
      console.log(`[indexer] indexed ${newEvents} event(s) through ledger ${this.cursor}`);
    }

    // RPC caps results at `limit`; if we filled the batch, keep going.
    if (response.events.length === this.config.batchSize) {
      await this.poll();
    }
  }
}
