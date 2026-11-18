/**
 * Burner wallets (from the pm-AMM hackathon kit, MIT) + our gas relay.
 *
 * Each visitor gets a keypair created in the browser and funded with test
 * USDC by the pm-AMM faucet. Trades are signed locally (no popups) and sent
 * through /api/relay, which pays the network fee and any token-account rent,
 * so a player never needs SOL.
 *
 * DEVNET ONLY: the secret key lives in localStorage.
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
} from "@solana/web3.js";
import { AnchorProvider } from "@anchor-lang/core";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PmAmmClient } from "@pm-amm/sdk";
import bs58 from "bs58";
import { FAUCET_URL, PROGRAM_ID, USDC_MINT } from "./config";

const KEY = "hitcap-burner";

export function loadOrCreateBurner(): Keypair {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) return Keypair.fromSecretKey(bs58.decode(saved));
  } catch {}
  const kp = Keypair.generate();
  try {
    localStorage.setItem(KEY, bs58.encode(kp.secretKey));
  } catch {}
  return kp;
}

export function exportBurner(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export interface Balances {
  sol: number;
  usdc: number;
}

export async function getBalances(connection: Connection, owner: PublicKey): Promise<Balances> {
  const ata = getAssociatedTokenAddressSync(USDC_MINT, owner);
  const [lamports, usdc] = await Promise.all([
    connection.getBalance(owner).catch(() => 0),
    connection
      .getTokenAccountBalance(ata)
      .then((b) => Number(b.value.uiAmount ?? 0))
      .catch(() => 0),
  ]);
  return { sol: lamports / 1e9, usdc };
}

export type FundResult = { funded: true; usdc: number } | { funded: false; reason: string };

export async function fundBurner(connection: Connection, owner: PublicKey): Promise<FundResult> {
  try {
    const res = await fetch(FAUCET_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ wallet: owner.toBase58(), role: "player" }),
    });
    const body = await res.json();
    if (!res.ok) return { funded: false, reason: body.error ?? `faucet ${res.status}` };
    await connection.confirmTransaction(body.signature, "confirmed");
    return { funded: true, usdc: body.amount };
  } catch (e) {
    return { funded: false, reason: `faucet unreachable (${e instanceof Error ? e.message : e})` };
  }
}

function keypairWallet(kp: Keypair) {
  const sign = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if (tx instanceof VersionedTransaction) tx.sign([kp]);
    else tx.partialSign(kp);
    return tx;
  };
  return {
    publicKey: kp.publicKey,
    payer: kp,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => sign(tx),
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs.map(sign),
  };
}

let sponsorCache: Promise<PublicKey | null> | null = null;
export function sponsorKey(): Promise<PublicKey | null> {
  sponsorCache ??= fetch("/api/relay")
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j?.sponsor ? new PublicKey(j.sponsor) : null))
    .catch(() => null);
  return sponsorCache;
}

/**
 * Send through the relay: sponsor pays the fee, and pays the rent of any token
 * account the SDK creates for the player (the SDK names the player as payer;
 * we swap in the sponsor).
 */
async function relaySend(connection: Connection, kp: Keypair, sponsor: PublicKey, ixs: TransactionInstruction[]) {
  const fixed = ixs.map((ix) => {
    if (!ix.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID) || !ix.keys[0]?.pubkey.equals(kp.publicKey)) return ix;
    const keys = ix.keys.map((k, i) => (i === 0 ? { ...k, pubkey: sponsor } : k));
    return new TransactionInstruction({ programId: ix.programId, keys, data: ix.data });
  });
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: sponsor, recentBlockhash: blockhash }).add(...fixed);
  tx.partialSign(kp);
  const res = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tx: tx.serialize({ requireAllSignatures: false }).toString("base64") }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `relay ${res.status}`);
  return body.signature as string;
}

/** A pm-AMM client that signs with the burner and sends through the relay. */
export function createBurnerClient(connection: Connection, kp: Keypair, sponsor: PublicKey | null): PmAmmClient {
  const provider = new AnchorProvider(connection, keypairWallet(kp), { commitment: "confirmed" });
  const client = PmAmmClient.fromProvider(provider, PROGRAM_ID, USDC_MINT);
  if (sponsor) {
    client.sendIxs = (ixs: TransactionInstruction[]) => relaySend(connection, kp, sponsor, ixs);
  }
  return client;
}
