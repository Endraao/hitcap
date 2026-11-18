import Link from "next/link";

export const metadata = { title: "How it works · HitCap" };

export default function How() {
  return (
    <article className="mx-auto max-w-3xl space-y-8 leading-relaxed">
      <header>
        <h1 className="text-3xl font-black">How HitCap works</h1>
        <p className="mt-2 text-muted">
          Short-lived prediction markets on memecoin market caps, created and resolved by an open keeper, priced by the
          pm-AMM.
        </p>
      </header>

      <Section n="1" t="Markets open on their own">
        Every hour the keeper reads the trending Solana pools on GeckoTerminal, skips thin pools and blue chips, and opens
        two kinds of markets: <b>1 hour</b> (“above today&apos;s cap at the top of the next hour?”) and <b>2x · 24h</b>{" "}
        (“does it double by tomorrow?”). It seeds each one with liquidity, so you can trade from the first second.
      </Section>

      <Section n="2" t="Why the pm-AMM fits memecoins">
        <p>
          A memecoin&apos;s market cap is a random walk with huge volatility, and a cap target is exactly the “score minus
          strike” event the pm-AMM was designed for (Moallemi &amp; Robinson, Paradigm 2024). Its fair YES price is{" "}
          <code className="rounded bg-panel-2 px-1">P = Φ(Z / σ√(T−t))</code>.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>
            <b className="text-text">Fair from the first trade.</b> We set Z = ln(cap / target) and σ from the token&apos;s
            recent moves, and open the market at that exact price. No blind 50/50.
          </li>
          <li>
            <b className="text-text">LPs survive expiry.</b> A constant-product pool on an outcome token loses almost
            everything at expiry. The dynamic pm-AMM withdraws liquidity as √(T−t), so LP losses stay uniform, which is
            what makes hourly markets possible at all.
          </li>
          <li>
            <b className="text-text">Always liquid.</b> No order book to fill, no one to match. Anyone can buy or sell
            YES/NO against the pool until the close.
          </li>
        </ul>
      </Section>

      <Section n="3" t="Resolution without a human">
        The pm-AMM ships without an oracle: the market creator resolves by hand. HitCap&apos;s keeper is that missing piece.
        When trading closes it reads the pool on GeckoTerminal, resolves YES or NO on-chain, and publishes the evidence
        (cap, timestamp, source, transaction) on the market page. Anyone can check it.
      </Section>

      <Section n="4" t="Play without a wallet">
        Your browser gets a play wallet funded with free test USDC. A relay pays the Solana fees and account rent, and it
        can only sponsor pm-AMM trades, never act for the keeper. You can export the key into Phantom whenever you want.
      </Section>

      <Section n="5" t="Fees">
        Every buy and sell pays the pm-AMM&apos;s 2% fee: half to the $PREDICT DAO, half to the market creator (the
        keeper), which funds liquidity for the next markets.
      </Section>

      <p>
        <Link href="/" className="font-semibold text-brand">Go to the markets →</Link>
      </p>
    </article>
  );
}

function Section({ n, t, children }: { n: string; t: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel p-5">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand text-sm text-black">{n}</span>
        {t}
      </h2>
      <div className="text-muted [&_b]:text-text">{children}</div>
    </section>
  );
}
