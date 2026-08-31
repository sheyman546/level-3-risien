import { z } from "zod";
import {
  ContractAddresses,
  DEFAULT_HORIZON_URLS,
  DEFAULT_RPC_URLS,
  NETWORK_PASSPHRASES,
  Network,
  NetworkConfig,
} from "@stellarflow/types";

/**
 * Centralized, zod-validated environment configuration.
 *
 * Every process (web app, event indexer, deploy scripts) parses its
 * environment through here so invalid configuration fails fast with a clear
 * message instead of surfacing as a confusing runtime error.
 */

const optionalUrl = z.string().url().optional().or(z.literal(""));

const envSchema = z.object({
  STELLARFLOW_NETWORK: z.enum(["testnet", "mainnet", "local"]).default("testnet"),
  STELLARFLOW_RPC_URL: optionalUrl,
  STELLARFLOW_HORIZON_URL: optionalUrl,
  STELLARFLOW_NETWORK_PASSPHRASE: z.string().optional().or(z.literal("")),
  STELLARFLOW_PAYMENT_CONTRACT: z.string().optional().or(z.literal("")),
  STELLARFLOW_ESCROW_CONTRACT: z.string().optional().or(z.literal("")),
  STELLARFLOW_REGISTRY_CONTRACT: z.string().optional().or(z.literal("")),
  STELLARFLOW_INDEXER_URL: z.string().url().default("http://localhost:4000"),
  STELLARFLOW_SECRET_KEY: z.string().optional().or(z.literal("")),
  DATABASE_URL: z.string().optional().or(z.literal("")),
});

export type StellarFlowEnv = z.infer<typeof envSchema>;

let cached: StellarFlowEnv | undefined;

/** Parse (and cache) the environment. Throws a descriptive error on invalid env. */
export function parseEnv(env: NodeJS.ProcessEnv = process.env): StellarFlowEnv {
  if (!cached) {
    const result = envSchema.safeParse(env);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    cached = result.data;
  }
  return cached;
}

/** Reset the cached env (used in tests). */
export function resetEnvCache(): void {
  cached = undefined;
}

/** Resolve the full network configuration for the current environment. */
export function networkConfig(env: NodeJS.ProcessEnv = process.env): NetworkConfig {
  const parsed = parseEnv(env);
  const network: Network = parsed.STELLARFLOW_NETWORK;
  return {
    network,
    rpcUrl: parsed.STELLARFLOW_RPC_URL || DEFAULT_RPC_URLS[network],
    horizonUrl: parsed.STELLARFLOW_HORIZON_URL || DEFAULT_HORIZON_URLS[network],
    networkPassphrase:
      parsed.STELLARFLOW_NETWORK_PASSPHRASE || NETWORK_PASSPHRASES[network],
  };
}

/** Resolve deployed contract addresses from the environment. */
export function contractAddresses(env: NodeJS.ProcessEnv = process.env): ContractAddresses {
  const parsed = parseEnv(env);
  return {
    payment: parsed.STELLARFLOW_PAYMENT_CONTRACT || undefined,
    escrow: parsed.STELLARFLOW_ESCROW_CONTRACT || undefined,
    registry: parsed.STELLARFLOW_REGISTRY_CONTRACT || undefined,
  };
}
