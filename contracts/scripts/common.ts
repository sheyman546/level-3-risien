import { execFileSync } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

export type Network = "testnet" | "mainnet" | "local";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
export const CONTRACTS_DIR = path.join(REPO_ROOT, "contracts");
export const WASM_DIR = path.join(
  CONTRACTS_DIR,
  "target",
  "wasm32v1-none",
  "release",
);

export const NETWORK_CONFIG: Record<Network, { rpcUrl: string; passphrase: string }> = {
  testnet: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    passphrase: "Test SDF Network ; September 2015",
  },
  mainnet: {
    rpcUrl: "https://soroban-mainnet.stellar.org",
    passphrase: "Public Global Stellar Network ; September 2015",
  },
  local: {
    rpcUrl: "http://localhost:8000",
    passphrase: "Standalone Network ; February 2017",
  },
};

/** Run a command and return its trimmed stdout. Throws with stderr on failure. */
export function run(cmd: string, args: string[], opts: { cwd?: string; input?: string } = {}): string {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      cwd: opts.cwd,
      input: opts.input,
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string; message?: string };
    const stderr = (err.stderr?.toString?.() ?? "").trim();
    const stdout = (err.stdout?.toString?.() ?? "").trim();
    throw new Error(
      `Command failed: ${cmd} ${args.join(" ")}\n${stderr || stdout || (err.message ?? "")}`,
    );
  }
}

/** Parse --key value pairs from argv (e.g. --network testnet). */
export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (key && value) out[key] = value;
  }
  return out;
}

/** Resolve the network to deploy to from --network, env, or the default. */
export function resolveNetwork(argv: string[]): Network {
  const flag = parseArgs(argv).network as Network | undefined;
  const fromEnv = process.env.STELLARFLOW_NETWORK as Network | undefined;
  const network = flag ?? fromEnv ?? "testnet";
  if (!(network in NETWORK_CONFIG)) {
    throw new Error(`Unknown network "${network}". Expected one of: ${Object.keys(NETWORK_CONFIG).join(", ")}`);
  }
  return network;
}

/** Require STELLARFLOW_SECRET_KEY from the environment. */
export function requireSecretKey(): string {
  const secret = process.env.STELLARFLOW_SECRET_KEY;
  if (!secret) {
    throw new Error(
      "STELLARFLOW_SECRET_KEY is not set. Add it to your .env file " +
        "(see .env.example). Never commit real secret keys.",
    );
  }
  return secret;
}

/** Add the deployer key to the local stellar-cli keychain (idempotent). */
export function ensureKey(alias: string, secret: string): void {
  try {
    run("stellar", ["keys", "address", alias]);
    return; // already present
  } catch {
    // not present — add it; feed a newline in case of an interactive prompt
    run("stellar", ["keys", "add", alias, "--secret-key", secret, "--force"], {
      input: "\n",
    });
  }
}

export function keyAddress(alias: string): string {
  return run("stellar", ["keys", "address", alias]);
}

export function deployContract(name: string, wasmPath: string, network: Network, alias: string): string {
  console.log(`\n▶ Deploying ${name}...`);
  const out = run("stellar", [
    "contract",
    "deploy",
    "--wasm", wasmPath,
    "--source-account", alias,
    "--network", network,
    "--output", "json",
  ]);
  let parsed: { id?: string };
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error(`Could not parse deploy output for ${name}. Got:\n${out}`);
  }
  if (!parsed.id) {
    throw new Error(`Deploy output for ${name} had no "id" field. Got:\n${out}`);
  }
  console.log(`  ✓ ${name}: ${parsed.id}`);
  return parsed.id;
}

export function invokeContract(
  network: Network,
  id: string,
  method: string,
  args: string[],
  alias: string,
): string {
  return run("stellar", [
    "contract",
    "invoke",
    "--id", id,
    "--source-account", alias,
    "--network", network,
    "--",
    method,
    ...args,
  ]);
}

/** Read contract ids previously written by deploy.ts. */
export function readDeployedIds(): Record<string, string> {
  const ids: Record<string, string> = {};
  for (const key of ["payment", "escrow", "registry"]) {
    const envKey = `STELLARFLOW_${key.toUpperCase()}_CONTRACT`;
    ids[key] = process.env[envKey] ?? "";
  }
  if (Object.values(ids).some((v) => !v)) {
    throw new Error(
      "Contract addresses are not configured. Run `pnpm deploy:testnet` first " +
        "(or set STELLARFLOW_PAYMENT_CONTRACT / ESCROW / REGISTRY in .env).",
    );
  }
  return ids;
}
