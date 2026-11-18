"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { TradePanel } from "@/components/TradePanel";
import { TokenIcon } from "@/components/MarketCard";
import { useMarkets, useNow } from "@/components/useMarkets";
import { explorerAccount, explorerTx } from "@/lib/config";
import { pct, question, timeLeft, usd, utcTime } from "@/lib/format";

export default function MarketPage() {
  const { id } = useParams<{ id: string }>();
  const { data, reload } = useMarkets();
  const now = useNow();
  const m = data?.markets.find((x) => String(x.id) === id);

  if (!data) return <p className="text-muted">Loading…</p>;
  if (!m)
    return (
      <p className="text-muted">
        Market not found. <Link href="/" className="underline">Back to markets</Link>
      </p>
    );

  const left = Math.max(m.endTs - now, 0);
  const share = `https://x.com/intent/tweet?text=${encodeURIComponent(
    `${question(m)}\n\nMarket says ${m.resolved ? (m.outcome === "yes" ? "YES ✅" : "NO ❌") : `YES ${pct(m.price)}`}. What do you think?`,
  )}&url=${encodeURIComponent(typeof window !== "undefined" ? window.location.href : "")}`;

  return (
    <div>
      <Link href="/" className="text-sm text-muted hover:text-text">← All markets</Link>

      <div className="mt-4 flex items-start gap-4">
        <TokenIcon m={m} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-md bg-panel-2 px-1.5 py-0.5 font-semibold text-text">{m.kind === "moon" ? "2x · 24h" : "1 hour"}</span>
            <span>{m.tokenName}</span>
            <span className="tabular">{m.resolved ? "resolved" : left ? `ends in ${timeLeft(left)}` : "resolving…"}</span>
          </div>
          <h1 className="mt-1 text-2xl font-black leading-tight sm:text-3xl">{question(m)}</h1>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat k="Target" v={usd(m.strike)} />
            <Stat k="Cap at open" v={usd(m.capAtOpen)} />
            <Stat k="Chance of YES" v={m.resolved ? (m.outcome === "yes" ? "100%" : "0%") : pct(m.price)} />
            <Stat k="Pool" v={usd(m.poolUsd)} />
          </div>

          <div className="overflow-hidden rounded-2xl border border-line bg-panel">
            <iframe
              title="chart"
              src={`https://www.geckoterminal.com/solana/pools/${m.pool}?embed=1&info=0&swaps=0&light_chart=0`}
              className="h-[380px] w-full"
            />
          </div>

          <div className="rounded-2xl border border-line bg-panel p-5 text-sm leading-relaxed">
            <h2 className="mb-2 font-bold">Rules</h2>
            <p className="text-muted">
              Resolves <b className="text-yes">YES</b> if ${m.symbol}&apos;s market cap is above <b className="text-text">{usd(m.strike)}</b> at{" "}
              {utcTime(m.endTs)}, otherwise <b className="text-no">NO</b>. Market cap is read from{" "}
              <a className="underline" href={`https://www.geckoterminal.com/solana/pools/${m.pool}`} target="_blank">GeckoTerminal</a> by
              the HitCap oracle the moment trading closes. Each winning token pays 1 USDC.
            </p>
            <p className="mt-2 text-muted">
              Opened at {(m.seedBps / 100).toFixed(1)}% YES: the fair price from the pm-AMM&apos;s own model, using the token&apos;s
              recent volatility ({(m.sigmaHour * 100).toFixed(1)}% per hour).
            </p>
            {m.resolution && (
              <div className={`mt-3 rounded-xl p-3 ${m.outcome === "yes" ? "bg-yes/10" : "bg-no/10"}`}>
                <b>{m.outcome === "yes" ? "Resolved YES" : "Resolved NO"}</b>: market cap {usd(m.resolution.cap)} at{" "}
                {new Date(m.resolution.at * 1000).toISOString().slice(11, 19)} UTC vs target {usd(m.strike)}.{" "}
                <a className="underline" href={explorerTx(m.resolution.tx)} target="_blank">resolution tx</a>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">
              Market <a className="underline" href={explorerAccount(m.pda)} target="_blank">{m.pda.slice(0, 8)}…</a> ·{" "}
              <a className="underline" href={explorerTx(m.createTx)} target="_blank">created</a> · token{" "}
              <a className="underline" href={`https://solscan.io/token/${m.mint}`} target="_blank">{m.mint.slice(0, 6)}…</a>
            </p>
          </div>
        </div>

        <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
          <TradePanel pda={m.pda} onTraded={reload} />
          <a href={share} target="_blank" className="block rounded-xl border border-line py-2.5 text-center text-sm font-semibold hover:bg-panel">
            Share on X
          </a>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-3 py-2">
      <p className="text-xs text-muted">{k}</p>
      <p className="tabular text-lg font-bold">{v}</p>
    </div>
  );
}
