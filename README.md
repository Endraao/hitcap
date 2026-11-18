# HitCap

**Memecoin prediction markets that open and resolve themselves, priced by the pm-AMM on Solana.**

> Will $TOKEN be above $1.2M market cap at 18:00 UTC? YES or NO.

Every hour HitCap picks the trending Solana tokens, opens a YES/NO market on each one's market cap and seeds it with liquidity. When the market closes, an oracle reads the market cap and resolves it on-chain, with the evidence published on the page. Anyone can play in one tap: no wallet extension, no SOL.

Built for the Solana Foundation **Perps & Prediction Markets** hackathon, on top of [Predict's pm-AMM](https://predict-pm-amm.dev).

## Why the pm-AMM

A market-cap target is the textbook pm-AMM case: the outcome depends on a score that drifts like a random walk (`ln(cap / target)`) and is settled at a fixed time. The pm-AMM prices YES as `P = Φ(Z / σ√(T−t))`, so:

- **Fair at open.** The keeper sets `Z = ln(cap / target)` and estimates `σ` from the token's recent moves (1h/6h/24h), then opens each market at exactly that price (`initialPriceBps`). A 2x-in-24h market on a calm token opens near 1%, a wild one near 15%, never a blind 50/50.
- **Short markets are viable.** The dynamic pm-AMM withdraws liquidity as `√(T−t)`, so the LP's loss to arbitrage stays uniform up to expiry. With a constant-product pool or LMSR, hourly markets would bleed their liquidity at the close.
- **Always tradable.** No order book to fill and no counterparty to wait for, which matters when a market lives for one hour.

## What we added

| Piece | What it does |
|---|---|
| `keeper/keeper.cjs` | Opens markets for trending tokens (GeckoTerminal), seeds them at the model price, **resolves them automatically** from live market cap, then pulls its liquidity back out. The pm-AMM ships without an oracle; this is one. |
| `app/api/relay` | Gas relay: a sponsor wallet pays fees and token-account rent, so players never need SOL. It only co-signs pm-AMM trades and may not appear in any pm-AMM instruction (it can't trade, deposit or resolve). |
| Burner wallets | Each visitor gets a browser wallet funded with test USDC (pm-AMM faucet). Exportable to Phantom. |
| Traction log | Every relayed swap is logged with its signature (`data/trades.jsonl`), so players, trades and volume on the home page can be checked on-chain. |

## Market types

- **1 hour**: "above the current market cap at the top of the next hour?" Opens around 50%.
- **2x · 24h**: "does it double by tomorrow?" Opens at the model's probability.

## Run it

```bash
npm install
node keeper/keeper.cjs          # opens and resolves markets (devnet), loops every minute
npm run dev                     # http://localhost:3000
```

The keeper creates `keeper/keeper-wallet.json` (market authority) and the relay reads `keeper/sponsor-wallet.json` (fee payer). Both are devnet-only and need a little devnet SOL. Never use them on mainnet.

Environment (all optional): `NEXT_PUBLIC_RPC`, `SERVER_RPC`, `KEEPER_RPC`, `REGISTRY`, `TRADES_LOG`, `SPONSOR_WALLET`.

## Stack

Next.js 16, `@pm-amm/sdk`, `@solana/web3.js`, GeckoTerminal API. Program `GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y` (devnet, mUSDC collateral).

## Limits (honest list)

- Resolution trusts one keeper and one data source (GeckoTerminal). Next: a second source, a dispute window and a multisig resolver.
- Devnet only: play money. The same program runs on mainnet with real USDC; moving there needs real wallets instead of burners.

MIT License.
