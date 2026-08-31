/**
 * One-shot environment setup:
 *   1. checks required tooling (node, pnpm, docker, stellar CLI)
 *   2. creates .env from .env.example if missing
 *   3. installs dependencies
 *   4. starts the local Postgres (for the event indexer)
 *
 * Usage: pnpm setup
 */

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function check(cmd: string, args: string[] = ["--version"]): string {
  try {
    return execFileSync(cmd, args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function step(label: string, fn: () => void): void {
  console.log(`\n▶ ${label}`);
  fn();
  console.log("  ✓");
}

const results: string[] = [];

step("Checking tooling", () => {
  const node = check("node");
  const pnpm = check("pnpm");
  const docker = check("docker");
  const stellar = check("stellar");

  if (!node) results.push("  ✗ node not found — install Node.js >= 20 (https://nodejs.org)");
  if (!pnpm) results.push("  ✗ pnpm not found — install with `corepack enable` or `npm i -g pnpm`");
  if (!docker) results.push("  ✗ docker not found — install Docker (https://docs.docker.com/get-docker/)");
  if (!stellar) {
    results.push(
      "  ✗ stellar CLI not found — `cargo install stellar-cli --locked` (Rust toolchain required)",
    );
  }
  console.log(`  node ${node || "missing"}`);
  console.log(`  pnpm ${pnpm || "missing"}`);
  console.log(`  docker ${docker ? "available" : "missing"}`);
  console.log(`  stellar ${stellar || "missing"}`);
});

step("Creating .env", () => {
  const envPath = path.join(REPO_ROOT, ".env");
  if (fs.existsSync(envPath)) {
    console.log("  .env already exists — leaving it untouched");
    return;
  }
  fs.copyFileSync(path.join(REPO_ROOT, ".env.example"), envPath);
  console.log("  created .env from .env.example — review the values");
});

step("Installing dependencies", () => {
  execFileSync("pnpm", ["install"], { cwd: REPO_ROOT, stdio: "inherit" });
});

step("Starting Postgres", () => {
  try {
    execFileSync("docker", ["compose", "up", "-d", "postgres"], { cwd: REPO_ROOT, stdio: "inherit" });
  } catch {
    results.push("  ✗ could not start Postgres — run `docker compose up -d postgres` manually");
  }
});

console.log("\n────────────────────────────────────────────");
if (results.length > 0) {
  console.log("Notes:");
  for (const r of results) console.log(r);
}
console.log("Next steps:");
console.log("  1. Fund a testnet account and set STELLARFLOW_SECRET_KEY in .env");
console.log("  2. pnpm deploy:testnet   (deploys the contracts)");
console.log("  3. pnpm dev:indexer      (starts the event indexer)");
console.log("  4. pnpm dev:web          (starts the frontend)");
