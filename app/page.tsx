"use client";
import { useState } from "react";
import Link from "next/link";
import { MarketCard } from "@/components/MarketCard";
import { useMarkets, useNow } from "@/components/useMarkets";
import { usd } from "@/lib/format";

type Tab = "live" | "resolved";

export default function Home() {
  const { data } = useMarkets();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("live");

  const all = data?.markets ?? [];
  const live = all.filter((m) => !m.resolved).sort((a, b) => a.endTs - b.endTs);
  const resolved = all.filter((m) => m.resolved).sort((a, b) => b.endTs - a.endTs);
  const shown = tab === "live" ? live : resolved;

  return (
    <div>
      <section className="mb-8 mt-2">
        <h1 className="text-3xl font-black tracking-tight sm:text-5xl">
          Will it <span className="text-brand">hit the cap</span>?
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Bet YES or NO on where today&apos;s trending Solana memecoins land. New markets open every hour, and they
          resolve on their own from live market-cap data. No wallet to install, no SOL needed.
        </p>
        <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted">
          <span className="rounded-full border border-line px-3 py-1">Priced by the pm-AMM</span>
          <span className="rounded-full border border-line px-3 py-1">Auto-resolved by an open oracle</span>
          <Link href="/how" className="rounded-full border border-brand/40 px-3 py-1 text-brand">How it works →</Link>
        </div>
        {data && (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Markets opened", data.stats.markets.toLocaleString("en-US")],
              ["Players", data.stats.players.toLocaleString("en-US")],
              ["Trades", data.stats.trades.toLocaleString("en-US")],
              ["Volume", usd(data.stats.volumeUsd)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-panel px-4 py-3">
                <p className="text-xs text-muted">{k}</p>
                <p className="tabular text-2xl font-black">{v}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mb-4 flex gap-2">
        {(["live", "resolved"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${tab === t ? "bg-text text-bg" : "bg-panel text-muted hover:text-text"}`}
          >
            {t === "live" ? `Live (${live.length})` : `Resolved (${resolved.length})`}
          </button>
        ))}
      </div>

      {!data ? (
        <p className="text-muted">Loading markets…</p>
      ) : shown.length === 0 ? (
        <p className="rounded-2xl border border-line bg-panel p-6 text-muted">
          {tab === "live" ? "New markets open every hour. Check back in a few minutes." : "Nothing resolved yet."}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((m) => (
            <MarketCard key={m.pda} m={m} now={now} />
          ))}
        </div>
      )}
    </div>
  );
}
