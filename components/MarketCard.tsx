"use client";
import Link from "next/link";
import type { LiveMarket } from "@/lib/types";
import { pct, question, timeLeft, usd } from "@/lib/format";

export function TokenIcon({ m, size = 40 }: { m: { image: string | null; symbol: string }; size?: number }) {
  return m.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={m.image} alt="" width={size} height={size} className="shrink-0 rounded-full bg-panel-2 object-cover" style={{ width: size, height: size }} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-panel-2 font-bold text-muted" style={{ width: size, height: size }}>
      {m.symbol.slice(0, 2)}
    </span>
  );
}

export function MarketCard({ m, now }: { m: LiveMarket; now: number }) {
  const left = Math.max(m.endTs - now, 0);
  const ended = left === 0;
  const yes = m.price;
  return (
    <Link
      href={`/m/${m.id}`}
      className="group flex flex-col gap-3 rounded-2xl border border-line bg-panel p-4 transition hover:border-brand/60 hover:bg-panel-2"
    >
      <div className="flex items-start gap-3">
        <TokenIcon m={m} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className={`rounded-md px-1.5 py-0.5 font-semibold ${m.kind === "moon" ? "bg-brand/15 text-brand" : "bg-panel-2 text-text"}`}>
              {m.kind === "moon" ? "2x · 24h" : "1 hour"}
            </span>
            <span className="tabular">{m.resolved ? "resolved" : ended ? "resolving…" : timeLeft(left)}</span>
          </div>
          <p className="mt-1 text-[15px] font-semibold leading-snug">{question(m)}</p>
        </div>
      </div>

      {m.resolved ? (
        <div className={`rounded-xl px-3 py-2 text-sm font-bold ${m.outcome === "yes" ? "bg-yes/15 text-yes" : "bg-no/15 text-no"}`}>
          {m.outcome === "yes" ? "YES won" : "NO won"} · cap {usd(m.resolution?.cap)}
        </div>
      ) : (
        <>
          <div className="h-2 overflow-hidden rounded-full bg-no/30">
            <div className="h-full rounded-full bg-yes transition-all" style={{ width: `${yes * 100}%` }} />
          </div>
          <div className="flex gap-2 text-sm font-bold">
            <span className="flex-1 rounded-xl bg-yes/15 py-2 text-center text-yes">YES {pct(yes)}</span>
            <span className="flex-1 rounded-xl bg-no/15 py-2 text-center text-no">NO {pct(1 - yes)}</span>
          </div>
        </>
      )}
      <div className="flex justify-between text-xs text-muted">
        <span>cap at open {usd(m.capAtOpen)}</span>
        <span>
          {m.trades} trade{m.trades === 1 ? "" : "s"} · {m.resolved ? `vol ${usd(m.volumeUsd)}` : `pool ${usd(m.poolUsd)}`}
        </span>
      </div>
    </Link>
  );
}
