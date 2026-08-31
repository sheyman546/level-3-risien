/**
 * Shape of an event returned by the Stellar RPC getEvents method
 * (`@stellar/stellar-sdk` `rpc.Server.getEvents` -> `EventResponse`).
 * Values are intentionally loose: the SDK decodes `topic`/`value` into XDR
 * `ScVal` objects, while raw JSON-RPC responses carry base64 strings — the
 * decoder handles both.
 */
export interface RawRpcEvent {
  id: string;
  ledger: number;
  /** Decoded as an Address/Contract object by the SDK, or a C... string. */
  contractId?: { toString(): string } | string;
  topic: unknown[];
  value: unknown;
  type?: string;
  inSuccessfulContractCall?: boolean;
  /** ISO timestamp of the ledger close (when available). */
  ledgerClosedAt?: string;
  pagingToken?: string;
}

/** A StellarFlow contract event decoded into plain JS values. */
export interface DecodedEvent {
  id: string;
  ledger: number;
  contractId: string;
  /** topic[0] is the event name; the rest are topic values (as strings). */
  topicName: string;
  topicValues: string[];
  /** The event data (tuple) decoded via scValToNative. */
  data: unknown;
  /** Ledger close time (ms epoch). */
  emittedAt: number;
}
