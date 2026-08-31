import { Pool } from "pg";
import { ActivityEvent } from "@stellarflow/types";

/**
 * Postgres-backed store for normalized contract events plus the indexer's
 * ledger cursor. Schema is created idempotently on startup (migrations live
 * in docs/deployment.md for production-grade promotion).
 */
export class EventStore {
  private pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
  }

  async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS contract_events (
        id          TEXT PRIMARY KEY,
        ledger      BIGINT NOT NULL,
        contract_id TEXT NOT NULL,
        topic       TEXT NOT NULL,
        payload     JSONB NOT NULL,
        emitted_at  BIGINT NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_contract_events_ledger
        ON contract_events (ledger DESC, id DESC);

      CREATE TABLE IF NOT EXISTS indexer_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  async insertEvent(event: ActivityEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO contract_events (id, ledger, contract_id, topic, payload, emitted_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [event.id, event.ledger, event.contractId, event.topic, JSON.stringify(event.payload), event.emittedAt],
    );
  }

  async recent(limit = 50): Promise<ActivityEvent[]> {
    const { rows } = await this.pool.query(
      `SELECT id, ledger, contract_id AS "contractId", topic, payload, emitted_at AS "emittedAt"
         FROM contract_events
        ORDER BY ledger DESC, id DESC
        LIMIT $1`,
      [limit],
    );
    return rows.map((row) => ({
      id: row.id,
      ledger: Number(row.ledger),
      contractId: row.contractId,
      topic: row.topic,
      payload: row.payload,
      emittedAt: Number(row.emittedAt),
    }));
  }

  async getCursor(): Promise<number> {
    const { rows } = await this.pool.query(
      `SELECT value FROM indexer_state WHERE key = 'last_ledger'`,
    );
    return rows.length > 0 ? Number(rows[0].value) : 0;
  }

  async setCursor(ledger: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO indexer_state (key, value) VALUES ('last_ledger', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(ledger)],
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
