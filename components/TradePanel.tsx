"use client";
/**
 * Buy YES / NO, sell back, and claim winnings, for one market.
 * Quotes come from pm-amm-helpers (exact program math, 2% fee included).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { mapAnchorError, type MarketAccount, type SwapDirection } from "@pm-amm/sdk";
import { useWallet } from "./WalletProvider";
import { marketState, minOutput, quoteSwap } from "@/lib/pm-amm-helpers";
import { USDC_LABEL, explorerTx } from "@/lib/config";
import { pct } from "@/lib/format";

type Side = "yes" | "no";
type Mode = "buy" | "sell";

function friendly(e: unknown): string {
  const mapped = mapAnchorError(e);
  if (mapped?.name === "SlippageExceeded") return "Price moved while you were trading. Try again.";
  if (mapped) return mapped.msg || mapped.name;
  const msg = e instanceof Error ? e.message : String(e);
  return msg.split("\n")[0].slice(0, 160);
}

export function TradePanel({ pda, onTraded }: { pda: string; onTraded?: () => void }) {
  const { client, connection, publicKey, balances, refresh, status } = useWallet();
  const market = useMemo(() => new PublicKey(pda), [pda]);
  const [acc, setAcc] = useState<MarketAccount | null>(null);
  const [pos, setPos] = useState({ yes: 0, no: 0 });
  const [side, setSide] = useState<Side>("yes");
  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("10");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; sig?: string } | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    const m = await client.fetchMarket(market).catch(() => null);
    setAcc(m);
    if (m && publicKey) {
      const bal = async (mint: PublicKey) =>
        connection
          .getTokenAccountBalance(getAssociatedTokenAddressSync(mint, publicKey))
          .then((b) => Number(b.value.amount))
          .catch(() => 0);
      const [yes, no] = await Promise.all([bal(client.yesMint(market)), bal(client.noMint(market))]);
      setPos({ yes, no });
    }
  }, [client, connection, market, publicKey]);

  useEffect(() => {
    load();
    const id = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => clearInterval(id);
  }, [load]);

  const s = acc ? marketState(acc) : null;
  const raw = Math.floor(Number(amount || 0) * 1e6);
  const dir: SwapDirection = mode === "buy" ? (side === "yes" ? "usdcToYes" : "usdcToNo") : side === "yes" ? "yesToUsdc" : "noToUsdc";

  const quote = useMemo(() => {
    if (!acc || !s || s.expired || s.resolved || raw <= 0) return null;
    try {
      return quoteSwap(acc, dir, raw);
    } catch {
      return null;
    }
  }, [acc, s, dir, raw]);

  const owned = side === "yes" ? pos.yes : pos.no;
  const tooMuch = mode === "buy" ? (balances ? raw > balances.usdc * 1e6 : false) : raw > owned;

  async function trade() {
    if (!client || !quote) return;
    setBusy(true);
    setMsg(null);
    try {
      const sig = await client.send.swap(market, dir, raw, minOutput(quote));
      setMsg({
        ok: true,
        text: mode === "buy" ? `Bought ${(quote.out / 1e6).toFixed(2)} ${side.toUpperCase()}` : `Sold for ${(quote.out / 1e6).toFixed(2)} ${USDC_LABEL}`,
        sig,
      });
      await Promise.all([load(), refresh()]);
      onTraded?.();
    } catch (e) {
      setMsg({ ok: false, text: friendly(e) });
    } finally {
      setBusy(false);
    }
  }

  async function claim() {
    if (!client) return;
    setBusy(true);
    setMsg(null);
    try {
      const sig = await client.send.claimWinnings(market);
      setMsg({ ok: true, text: "Winnings claimed", sig });
      await Promise.all([load(), refresh()]);
    } catch (e) {
      setMsg({ ok: false, text: friendly(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <div className="rounded-2xl border border-line bg-panel p-5 text-muted">Loading market…</div>;

  const won = s.winner === "yes" ? pos.yes : s.winner === "no" ? pos.no : 0;

  return (
    <div className="rounded-2xl border border-line bg-panel p-5">
      <div className="mb-4 grid grid-cols-2 gap-2">
        {(["yes", "no"] as Side[]).map((x) => {
          const p = x === "yes" ? s.price : 1 - s.price;
          const on = side === x;
          return (
            <button
              key={x}
              onClick={() => setSide(x)}
              disabled={s.resolved}
              className={`rounded-xl border-2 py-3 text-lg font-black transition ${
                x === "yes"
                  ? on
                    ? "border-yes bg-yes/20 text-yes"
                    : "border-transparent bg-yes/10 text-yes/70"
                  : on
                    ? "border-no bg-no/20 text-no"
                    : "border-transparent bg-no/10 text-no/70"
              }`}
            >
              {x.toUpperCase()} {pct(p)}
            </button>
          );
        })}
      </div>

      {s.resolved ? (
        <div className="space-y-3">
          <p className={`text-xl font-black ${s.winner === "yes" ? "text-yes" : "text-no"}`}>{s.winner?.toUpperCase()} won</p>
          {won > 0 ? (
            <button onClick={claim} disabled={busy} className="w-full rounded-xl bg-brand py-3 font-bold text-black disabled:opacity-50">
              {busy ? "Claiming…" : `Claim ${(won / 1e6).toFixed(2)} ${USDC_LABEL}`}
            </button>
          ) : (
            <p className="text-sm text-muted">{pos.yes + pos.no > 0 ? "No winning tokens to claim." : "You didn't hold a position here."}</p>
          )}
        </div>
      ) : s.expired ? (
        <p className="text-muted">Trading closed. The oracle resolves this market within a minute.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-1 rounded-xl bg-panel-2 p-1 text-sm font-semibold">
            {(["buy", "sell"] as Mode[]).map((x) => (
              <button key={x} onClick={() => setMode(x)} className={`flex-1 rounded-lg py-1.5 ${mode === x ? "bg-bg text-text" : "text-muted"}`}>
                {x === "buy" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-xs text-muted">
              {mode === "buy" ? `Amount (${USDC_LABEL})` : `${side.toUpperCase()} tokens to sell (you have ${(owned / 1e6).toFixed(2)})`}
            </span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              className="tabular mt-1 w-full rounded-xl border border-line bg-bg px-3 py-3 text-xl font-bold outline-none focus:border-brand"
            />
          </label>
          <div className="flex gap-2">
            {(mode === "buy" ? [5, 10, 25, 100] : [0.25, 0.5, 1]).map((v) => (
              <button
                key={v}
                onClick={() => setAmount(mode === "buy" ? String(v) : ((owned * v) / 1e6).toFixed(2))}
                className="flex-1 rounded-lg border border-line py-1 text-xs text-muted hover:text-text"
              >
                {mode === "buy" ? v : v === 1 ? "Max" : `${v * 100}%`}
              </button>
            ))}
          </div>
          {quote && (
            <div className="rounded-xl bg-panel-2 p-3 text-sm">
              {mode === "buy" ? (
                <>
                  <Row k="You get" v={`${(quote.out / 1e6).toFixed(2)} ${side.toUpperCase()}`} />
                  <Row k={`If ${side.toUpperCase()} wins`} v={`${(quote.out / 1e6).toFixed(2)} ${USDC_LABEL} (${((quote.out / raw - 1) * 100).toFixed(0)}% profit)`} strong />
                </>
              ) : (
                <Row k="You get" v={`${(quote.out / 1e6).toFixed(2)} ${USDC_LABEL}`} strong />
              )}
              <Row k="Fee (2%)" v={`${(quote.fee / 1e6).toFixed(2)} ${USDC_LABEL}`} />
            </div>
          )}
          <button
            onClick={trade}
            disabled={busy || !quote || tooMuch || status !== "ready"}
            className={`w-full rounded-xl py-3 text-lg font-black text-black disabled:opacity-40 ${side === "yes" ? "bg-yes" : "bg-no"}`}
          >
            {busy ? "Sending…" : tooMuch ? "Not enough balance" : `${mode === "buy" ? "Buy" : "Sell"} ${side.toUpperCase()}`}
          </button>
          {(pos.yes > 0 || pos.no > 0) && (
            <p className="text-center text-xs text-muted">
              Your position: {(pos.yes / 1e6).toFixed(2)} YES · {(pos.no / 1e6).toFixed(2)} NO
            </p>
          )}
        </div>
      )}

      {msg && (
        <p className={`mt-3 text-sm ${msg.ok ? "text-yes" : "text-no"}`}>
          {msg.text}{" "}
          {msg.sig && (
            <a href={explorerTx(msg.sig)} target="_blank" className="underline">
              view tx
            </a>
          )}
        </p>
      )}
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted">{k}</span>
      <span className={`tabular ${strong ? "font-bold" : ""}`}>{v}</span>
    </div>
  );
}
