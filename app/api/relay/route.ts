/**
 * Gas relay: players never need SOL.
 *
 * The browser builds a pm-AMM transaction with the SPONSOR as fee payer (and as
 * the payer of any new token account), signs it with the player's burner, and
 * posts it here. We check that it only does what a player is allowed to do,
 * add the sponsor's signature and send it.
 *
 * The sponsor is a wallet with SOL and nothing else: it is never the keeper
 * (the keeper resolves markets), and it may not appear in any pm-AMM
 * instruction, so a forged transaction can't make it trade, deposit or resolve.
 */
import fs from "fs";
import path from "path";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  Transaction,
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PROGRAM_ID, RPC } from "@/lib/config";

export const dynamic = "force-dynamic";

const SPONSOR_FILE = process.env.SPONSOR_WALLET || path.join(process.cwd(), "keeper", "sponsor-wallet.json");
const SERVER_RPC = process.env.SERVER_RPC || RPC;
const MAX_IXS = 8;
const PER_IP_PER_MIN = 20;

let sponsor: Keypair | null = null;
function loadSponsor() {
  if (sponsor) return sponsor;
  sponsor = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(SPONSOR_FILE, "utf8"))));
  return sponsor;
}

const hits = new Map<string, number[]>();
function rateLimited(ip: string) {
  const t = Date.now();
  const list = (hits.get(ip) || []).filter((x) => t - x < 60_000);
  list.push(t);
  hits.set(ip, list);
  return list.length > PER_IP_PER_MIN;
}

/**
 * Traction log: every swap that goes through the relay, one JSON line each.
 * Every line carries its signature, so the numbers can be checked on-chain.
 */
const TRADES = process.env.TRADES_LOG || path.join(process.cwd(), "data", "trades.jsonl");
const SWAP_DISC = Buffer.from([248, 198, 158, 145, 225, 117, 135, 200]);
const DIRS = ["usdcToYes", "usdcToNo", "yesToUsdc", "noToUsdc", "yesToNo", "noToYes"];

function logTrades(tx: Transaction, sig: string, player: string) {
  try {
    const lines: string[] = [];
    for (const ix of tx.instructions) {
      if (!ix.programId.equals(PROGRAM_ID) || ix.data.length < 25) continue;
      if (!ix.data.subarray(0, 8).equals(SWAP_DISC)) continue;
      lines.push(
        JSON.stringify({
          t: Math.floor(Date.now() / 1000),
          sig,
          player,
          market: ix.keys[1].pubkey.toBase58(),
          dir: DIRS[ix.data[8]] ?? "unknown",
          amountIn: Number(ix.data.readBigUInt64LE(9)),
          minOut: Number(ix.data.readBigUInt64LE(17)),
        }),
      );
    }
    if (lines.length) {
      fs.mkdirSync(path.dirname(TRADES), { recursive: true });
      fs.appendFileSync(TRADES, lines.join("\n") + "\n");
    }
  } catch {
    /* stats are best-effort; never fail a trade over them */
  }
}

function bad(msg: string, status = 400) {
  return Response.json({ error: msg }, { status });
}

export async function GET() {
  try {
    return Response.json({ sponsor: loadSponsor().publicKey.toBase58() });
  } catch {
    return bad("relay not configured", 503);
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) return bad("slow down a little", 429);

  let kp: Keypair;
  try {
    kp = loadSponsor();
  } catch {
    return bad("relay not configured", 503);
  }

  let tx: Transaction;
  try {
    const { tx: b64 } = await req.json();
    tx = Transaction.from(Buffer.from(String(b64), "base64"));
  } catch {
    return bad("bad transaction");
  }

  const me = kp.publicKey;
  if (!tx.feePayer?.equals(me)) return bad("fee payer must be the sponsor");
  if (tx.instructions.length === 0 || tx.instructions.length > MAX_IXS) return bad("too many instructions");

  // The player: the one other signer.
  const players = tx.signatures.map((s) => s.publicKey).filter((k) => !k.equals(me));
  if (players.length !== 1) return bad("exactly one player signature expected");

  for (const ix of tx.instructions) {
    const p = ix.programId;
    if (p.equals(ComputeBudgetProgram.programId)) continue;
    if (p.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      // create / createIdempotent: [payer, ata, owner, mint, system, token]. The
      // sponsor may pay the rent, never own the account.
      if (ix.keys[2] && ix.keys[2].pubkey.equals(me)) return bad("sponsor can't own accounts");
      continue;
    }
    if (p.equals(PROGRAM_ID)) {
      if (ix.keys.some((k) => k.pubkey.equals(me))) return bad("sponsor can't take part in a trade");
      continue;
    }
    return bad("program not allowed: " + p.toBase58());
  }

  const conn = new Connection(SERVER_RPC, "confirmed");
  try {
    tx.partialSign(kp);
    if (!tx.verifySignatures()) return bad("missing player signature");
    const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false });
    const res = await conn.confirmTransaction(sig, "confirmed");
    if (res.value.err) return bad("transaction failed: " + JSON.stringify(res.value.err));
    logTrades(tx, sig, players[0].toBase58());
    return Response.json({ signature: sig });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const logs = (e as { logs?: string[] }).logs;
    return bad(msg.split("\n")[0] + (logs ? " | " + logs.slice(-3).join(" | ") : ""));
  }
}
