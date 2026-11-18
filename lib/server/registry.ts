import "server-only";
import fs from "fs";
import path from "path";
import { Connection, PublicKey } from "@solana/web3.js";
import { PmAmmClient } from "@pm-amm/sdk";
import { poolValue } from "@pm-amm/sdk/math";
import { PROGRAM_ID, RPC, USDC_MINT } from "@/lib/config";
import { fetchMarkets, marketState } from "@/lib/pm-amm-helpers";
import type { LiveMarket, MarketsResponse, RegistryMarket } from "@/lib/types";

const REGISTRY = process.env.REGISTRY || path.join(process.cwd(), "data", "markets.json");
const SERVER_RPC = process.env.SERVER_RPC || RPC;

const TRADES = process.env.TRADES_LOG || path.join(process.cwd(), "data", "trades.jsonl");

interface Trade {
  player: string;
  market: string;
  dir: string;
  amountIn: number;
  minOut: number;
}

function readTrades(): Trade[] {
  try {
    return fs
      .readFileSync(TRADES, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** USDC that changed hands: the input of a buy, the (minimum) output of a sell. */
const tradeUsd = (t: Trade) =>
  (t.dir.startsWith("usdcTo") ? t.amountIn : t.dir.endsWith("ToUsdc") ? t.minOut : 0) / 1e6;

let client: PmAmmClient | null = null;
function reader() {
  client ??= PmAmmClient.readOnly(new Connection(SERVER_RPC, "confirmed"), PROGRAM_ID, USDC_MINT);
  return client;
}

function readRegistry(): { keeper: string | null; cluster?: string; markets: RegistryMarket[] } {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  } catch {
    return { keeper: null, markets: [] };
  }
}

let cache: { at: number; data: MarketsResponse } | null = null;
let inflight: Promise<MarketsResponse> | null = null;

/** Registry + live on-chain state, cached a few seconds (public RPCs rate-limit). */
export async function liveMarkets(): Promise<MarketsResponse> {
  if (cache && Date.now() - cache.at < 8000) return cache.data;
  inflight ??= build().finally(() => (inflight = null));
  return inflight;
}

async function build(): Promise<MarketsResponse> {
  const reg = readRegistry();
  // Show what's live, plus the most recent resolved ones.
  const sorted = [...reg.markets].sort((a, b) => b.openedAt - a.openedAt);
  const live = sorted.filter((m) => !m.resolved);
  const done = sorted.filter((m) => m.resolved).slice(0, 60);
  const shown = [...live, ...done];

  const accounts: Awaited<ReturnType<typeof fetchMarkets>> = [];
  for (let i = 0; i < shown.length; i += 100) {
    const chunk = shown.slice(i, i + 100).map((m) => new PublicKey(m.pda));
    try {
      accounts.push(...(await fetchMarkets(reader(), chunk)));
    } catch {
      accounts.push(...chunk.map(() => null));
    }
  }

  const trades = readTrades();
  const perMarket = new Map<string, { trades: number; volumeUsd: number }>();
  for (const t of trades) {
    const s = perMarket.get(t.market) ?? { trades: 0, volumeUsd: 0 };
    s.trades++;
    s.volumeUsd += tradeUsd(t);
    perMarket.set(t.market, s);
  }
  const flow = (pda: string) => perMarket.get(pda) ?? { trades: 0, volumeUsd: 0 };

  const markets: LiveMarket[] = shown.map((m, i) => {
    const acc = accounts[i];
    if (!acc) {
      const left = Math.max(m.endTs - Math.floor(Date.now() / 1000), 0);
      return { ...m, ...flow(m.pda), price: m.outcome ? (m.outcome === "yes" ? 1 : 0) : m.seedBps / 10_000, secondsLeft: left, poolUsd: 0 };
    }
    const s = marketState(acc);
    return {
      ...m,
      ...flow(m.pda),
      price: s.price,
      secondsLeft: s.secondsLeft,
      poolUsd: s.resolved ? 0 : poolValue(s.price, s.lEff) / 1e6,
      capNow: m.resolution?.cap ?? m.capAtOpen,
    };
  });

  const data: MarketsResponse = {
    keeper: reg.keeper,
    cluster: reg.cluster || "devnet",
    updatedAt: Date.now(),
    markets,
    stats: {
      markets: reg.markets.length,
      resolved: reg.markets.filter((m) => m.resolved).length,
      players: new Set(trades.map((t) => t.player)).size,
      trades: trades.length,
      volumeUsd: trades.reduce((a, t) => a + tradeUsd(t), 0),
    },
  };
  cache = { at: Date.now(), data };
  return data;
}
