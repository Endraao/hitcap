"use client";
import Link from "next/link";
import { useState } from "react";
import { useWallet } from "./WalletProvider";
import { USDC_LABEL, explorerAccount } from "@/lib/config";
import { exportBurner } from "@/lib/burner";

export function Header() {
  const { publicKey, balances, status, error, topUp } = useWallet();
  const [open, setOpen] = useState(false);
  const short = publicKey ? publicKey.toBase58().slice(0, 4) + "…" + publicKey.toBase58().slice(-4) : "…";

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-black">H</span>
          HitCap
        </Link>
        <nav className="ml-4 hidden gap-4 text-sm text-muted sm:flex">
          <Link href="/" className="hover:text-text">Markets</Link>
          <Link href="/how" className="hover:text-text">How it works</Link>
        </nav>
        <div className="relative ml-auto">
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-line bg-panel px-3 py-1.5 text-sm"
          >
            <span className="tabular font-semibold">
              {status === "funding" ? "Funding…" : balances ? `${balances.usdc.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${USDC_LABEL}` : "…"}
            </span>
            <span className="text-muted">{short}</span>
          </button>
          {open && (
            <div className="absolute right-0 mt-2 w-72 rounded-xl border border-line bg-panel p-4 text-sm shadow-xl">
              <p className="font-semibold">Your play wallet</p>
              <p className="mt-1 text-muted">
                Created in this browser and funded with free test {USDC_LABEL}. No sign-up, no SOL needed: we pay the fees.
              </p>
              {publicKey && (
                <a className="mt-2 block break-all text-xs text-muted underline" href={explorerAccount(publicKey.toBase58())} target="_blank">
                  {publicKey.toBase58()}
                </a>
              )}
              {error && <p className="mt-2 text-xs text-no">{error}</p>}
              <div className="mt-3 flex gap-2">
                <button onClick={topUp} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-black">
                  Get 1,000 {USDC_LABEL}
                </button>
                <button
                  onClick={() => {
                    const k = exportBurner();
                    if (k) navigator.clipboard.writeText(k);
                  }}
                  className="rounded-lg border border-line px-3 py-1.5"
                  title="Copy the secret key to import this wallet in Phantom"
                >
                  Export key
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
