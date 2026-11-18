import { PublicKey } from "@solana/web3.js";

/** Devnet by default: play money, nothing has real value. */
export const CLUSTER = (process.env.NEXT_PUBLIC_CLUSTER || "devnet") as "devnet" | "mainnet";
export const RPC = process.env.NEXT_PUBLIC_RPC || "https://api.devnet.solana.com";

export const PROGRAM_ID = new PublicKey("GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y");
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || "3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ",
);
export const USDC_LABEL = CLUSTER === "devnet" ? "mUSDC" : "USDC";
export const FAUCET_URL = "https://pm-amm-devnet.vercel.app/api/faucet";

/** Pays network fees and token-account rent for players (see app/api/relay). */
export const SPONSOR = process.env.NEXT_PUBLIC_SPONSOR ? new PublicKey(process.env.NEXT_PUBLIC_SPONSOR) : null;

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const explorerTx = (sig: string) =>
  `https://solscan.io/tx/${sig}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;
export const explorerAccount = (a: string) =>
  `https://solscan.io/account/${a}${CLUSTER === "devnet" ? "?cluster=devnet" : ""}`;
