// HitCap keeper: opens memecoin markets on the pm-AMM and resolves them on its own.
//
//   node keeper/keeper.cjs          (loop forever)
//   node keeper/keeper.cjs --once   (one round, for tests)
//
// Every round:
//   1. RESOLVE  markets past their end: read the token's market cap from
//               GeckoTerminal, resolve YES/NO on-chain, store the evidence.
//   2. RECYCLE  pull the keeper's liquidity back out of resolved markets.
//   3. OPEN     new markets for trending Solana tokens, seeded at the price the
//               pm-AMM's own model gives (Gaussian score = log(mcap / strike)).
//
// CommonJS on purpose: @anchor-lang/core is CJS (see pm-AMM hackathon kit).

const fs = require("fs");
const path = require("path");
const { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } = require("@solana/web3.js");
const { AnchorProvider, Wallet } = require("@anchor-lang/core");
const { getAssociatedTokenAddressSync } = require("@solana/spl-token");
const { PmAmmClient } = require("@pm-amm/sdk");
const { capitalPhi } = require("@pm-amm/sdk/math");

const ROOT = path.join(__dirname, "..");
const RPC = process.env.KEEPER_RPC || "https://api.devnet.solana.com";
const FAUCET = "https://pm-amm-devnet.vercel.app/api/faucet";
const PROGRAM_ID = new PublicKey("GV1FMGHRYBjQLaghE5fnGuYCuCcpdt3GD5xEX3TwN16y");
const USDC_MINT = new PublicKey(process.env.USDC_MINT || "3WQ8hCqTNwjrh8WzE2XyoZoUrd1miPcwWfMkmFPUMEWZ");
const WALLET_FILE = process.env.KEEPER_WALLET || path.join(__dirname, "keeper-wallet.json");
const REGISTRY = process.env.REGISTRY || path.join(ROOT, "data", "markets.json");
const GECKO = "https://api.geckoterminal.com/api/v2/networks/solana";

/** What the keeper opens. Each "kind" is one question per token. */
const KINDS = {
  // "Higher in 1 hour?" — strike = mcap right now, so it opens at ~50%.
  hour: { durationSecs: 3600, strikeMult: 1, liquidity: 100, every: 3600, maxOpen: 3 },
  // "2x in 24 hours?" — strike = 2x mcap, opens at whatever the model says.
  moon: { durationSecs: 86400, strikeMult: 2, liquidity: 150, every: 6 * 3600, maxOpen: 3 },
};
const ROUND_MS = 60_000;
const MIN_LIQ_USD = 40_000; // ignore thin pools: their price is easy to push around
const MAX_FDV_USD = 3e9; // memecoins and small caps, not blue chips
const SKIP_SYMBOLS = new Set(["SOL", "WSOL", "USDC", "USDT", "WETH", "WBTC", "CBBTC", "ZEC", "JITOSOL", "MSOL", "JUP", "KMNO", "USD1", "PYUSD", "USDG"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------------------------------------------------------------- registry

function loadRegistry() {
  try {
    return JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
  } catch {
    return { keeper: null, markets: [] };
  }
}
function saveRegistry(reg) {
  fs.mkdirSync(path.dirname(REGISTRY), { recursive: true });
  const tmp = REGISTRY + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(reg, null, 1));
  fs.renameSync(tmp, REGISTRY); // atomic: the web app never reads a half-written file
}

// ---------------------------------------------------------------- wallet & funds

function loadWallet() {
  if (fs.existsSync(WALLET_FILE)) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"))));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(WALLET_FILE, JSON.stringify(Array.from(kp.secretKey)));
  log(`created ${WALLET_FILE} (devnet only)`);
  return kp;
}

async function usdcBalance(conn, owner) {
  try {
    const b = await conn.getTokenAccountBalance(getAssociatedTokenAddressSync(USDC_MINT, owner));
    return Number(b.value.uiAmount);
  } catch {
    return 0;
  }
}

let nextFaucetAt = 0;
async function topUp(conn, owner) {
  if (Date.now() < nextFaucetAt) return;
  const res = await fetch(FAUCET, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ wallet: owner.toBase58() }),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: e.message }), headers: new Map() }));
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const wait = Number(res.headers?.get?.("Retry-After")) || 3600;
    nextFaucetAt = Date.now() + wait * 1000;
    log(`faucet: ${body.error || res.status} (next try in ${Math.round(wait / 60)} min)`);
    return;
  }
  await conn.confirmTransaction(body.signature, "confirmed").catch(() => {});
  nextFaucetAt = Date.now() + 3600 * 1000;
  log(`faucet: +${body.amount} mUSDC${body.sol ? ` +${body.sol} SOL` : ""}`);
}

// ---------------------------------------------------------------- oracle (GeckoTerminal)

async function gecko(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(GECKO + url, { headers: { accept: "application/json" } }).catch(() => null);
    if (r && r.ok) return r.json();
    await sleep(r && r.status === 429 ? 15_000 : 3_000);
  }
  throw new Error("GeckoTerminal unreachable: " + url);
}

const num = (v) => (v == null ? null : Number(v));

/** Market cap the way traders read it on pump.fun / DexScreener (FDV when mcap is missing). */
function capOf(a) {
  const mc = num(a.market_cap_usd);
  const fdv = num(a.fdv_usd);
  return mc && mc > 0 ? mc : fdv;
}

/**
 * Hourly volatility of log(mcap), from the price changes GeckoTerminal gives.
 * Each window is scaled to one hour (random walk: sigma grows with sqrt(time)).
 */
function hourlySigma(pc) {
  const w = [
    [num(pc.h1), 1],
    [num(pc.h6), 6],
    [num(pc.h24), 24],
  ];
  let s = 0.04; // floor: 4%/h, memecoins never sit still
  for (const [pct, hours] of w) {
    if (pct == null || pct <= -99) continue;
    s = Math.max(s, Math.abs(Math.log(1 + pct / 100)) / Math.sqrt(hours));
  }
  return Math.min(s, 1.5);
}

/**
 * The pm-AMM prices a YES token as P = Phi(Z / (sigma * sqrt(T - t))), with Z the
 * "score" that decides the market. Here Z = log(mcap / strike). We seed every
 * market at exactly that price, so it opens fair instead of at a blind 50%.
 */
function fairPriceBps(cap, strike, sigmaHour, secs) {
  const z = Math.log(cap / strike);
  const p = capitalPhi(z / (sigmaHour * Math.sqrt(secs / 3600)));
  return Math.max(100, Math.min(9900, Math.round(p * 10_000)));
}

async function trending() {
  const j = await gecko("/trending_pools?include=base_token&duration=1h&page=1");
  const tokens = new Map((j.included || []).map((t) => [t.id, t.attributes]));
  const seen = new Set();
  const out = [];
  for (const p of j.data || []) {
    const a = p.attributes;
    const tok = tokens.get(p.relationships.base_token.data.id);
    if (!tok || seen.has(tok.address) || seen.has(String(tok.symbol).toUpperCase())) continue;
    const quote = p.relationships.quote_token.data.id;
    if (!/So11111111111111111111111111111111111111112|EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/.test(quote)) continue;
    const cap = capOf(a);
    if (!cap || cap > MAX_FDV_USD || Number(a.reserve_in_usd) < MIN_LIQ_USD) continue;
    if (SKIP_SYMBOLS.has(String(tok.symbol).toUpperCase())) continue;
    seen.add(tok.address);
    seen.add(String(tok.symbol).toUpperCase());
    out.push({
      pool: a.address,
      mint: tok.address,
      symbol: String(tok.symbol).slice(0, 12),
      name: tok.name,
      image: tok.image_url && tok.image_url !== "missing.png" ? tok.image_url : null,
      cap,
      sigma: hourlySigma(a.price_change_percentage),
      volume24h: num(a.volume_usd?.h24),
    });
  }
  return out;
}

async function capNow(pool) {
  const j = await gecko(`/pools/${pool}`);
  return { cap: capOf(j.data.attributes), price: num(j.data.attributes.base_token_price_usd) };
}

// ---------------------------------------------------------------- formatting

function usd(n) {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function hhmm(ts) {
  return new Date(ts * 1000).toISOString().slice(11, 16);
}
/** On-chain name, 1..64 bytes. Full details live in the registry. */
function marketName(kind, sym, strike, endTs) {
  const q = kind === "hour" ? `$${sym} above ${usd(strike)} at ${hhmm(endTs)} UTC?` : `$${sym} 2x to ${usd(strike)} by ${hhmm(endTs)} UTC?`;
  return Buffer.from(q).subarray(0, 64).toString();
}

// ---------------------------------------------------------------- the three jobs

async function resolveDue(client, reg) {
  for (const m of reg.markets) {
    if (m.resolved || now() < m.endTs) continue;
    try {
      // Read the oracle FIRST, so the outcome is fixed before anything else runs.
      const { cap, price } = await capNow(m.pool);
      const side = cap > m.strike ? "yes" : "no";
      // The pm-AMM refuses withdrawals once a market is resolved, so the keeper
      // pulls its liquidity out between expiry (no more trading) and resolution.
      await withdrawAll(client, new PublicKey(m.pda));
      const sig = await client.send.resolveMarket(new PublicKey(m.pda), side);
      m.resolved = true;
      m.outcome = side;
      m.resolution = { cap, price, at: now(), source: `https://www.geckoterminal.com/solana/pools/${m.pool}`, tx: sig };
      saveRegistry(reg);
      log(`resolved #${m.id} ${m.symbol} -> ${side.toUpperCase()} (${usd(cap)} vs ${usd(m.strike)})`);
    } catch (e) {
      const msg = String(e.message || e);
      // Already resolved on-chain (a previous round crashed before saving): sync it.
      if (/AlreadyResolved|already resolved/i.test(msg)) {
        const acc = await client.fetchMarket(new PublicKey(m.pda)).catch(() => null);
        if (acc && acc.resolved) {
          m.resolved = true;
          m.outcome = acc.winningSide === 1 ? "yes" : "no";
          saveRegistry(reg);
        }
      } else log(`resolve #${m.id} failed: ${msg.split("\n")[0]}`);
    }
  }
}

async function withdrawAll(client, market) {
  try {
    const lp = await client.fetchLpPosition(market, client.walletPubkey());
    if (lp && !lp.shares.isZero()) await client.send.withdrawLiquidity(market, lp.shares);
  } catch (e) {
    log(`withdraw ${market.toBase58().slice(0, 6)}: ${String(e.message || e).split("\n")[0]}`);
  }
}

/** After resolution: LP residuals + the winning side of what the keeper withdrew, back to USDC. */
async function recycle(client, reg) {
  for (const m of reg.markets) {
    if (!m.resolved || m.recycled) continue;
    const market = new PublicKey(m.pda);
    try {
      await client.send.claimLpResiduals(market);
    } catch {}
    try {
      await client.send.claimWinnings(market);
    } catch {}
    m.recycled = true;
    saveRegistry(reg);
  }
}

async function openNew(client, conn, reg, owner) {
  const live = (kind) => reg.markets.filter((m) => m.kind === kind && !m.resolved && m.endTs > now());
  const lastOpen = (kind) => Math.max(0, ...reg.markets.filter((m) => m.kind === kind).map((m) => m.openedAt));

  const due = Object.entries(KINDS).filter(([kind, k]) => now() - lastOpen(kind) >= k.every - 60 && live(kind).length === 0);
  if (!due.length) return;

  const list = await trending();
  log(`trending: ${list.map((t) => t.symbol).join(", ")}`);

  for (const [kind, k] of due) {
    for (const t of list.slice(0, k.maxOpen)) {
      let bal = await usdcBalance(conn, owner);
      if (bal < k.liquidity + 5) {
        await topUp(conn, owner);
        bal = await usdcBalance(conn, owner);
        if (bal < k.liquidity + 5) {
          log(`not enough mUSDC (${bal}) for ${kind} ${t.symbol}`);
          break;
        }
      }
      const strike = t.cap * k.strikeMult;
      const endTs = now() + k.durationSecs;
      const bps = fairPriceBps(t.cap, strike, t.sigma, k.durationSecs);
      try {
        const { marketId, marketPda, signature } = await client.send.createMarket({
          name: marketName(kind, t.symbol, strike, endTs),
          durationSecs: k.durationSecs,
          initialPriceBps: bps,
          depositUsdc: k.liquidity,
        });
        const acc = await client.fetchMarket(new PublicKey(marketPda));
        reg.markets.push({
          id: marketId,
          pda: marketPda,
          kind,
          symbol: t.symbol,
          tokenName: t.name,
          mint: t.mint,
          pool: t.pool,
          image: t.image,
          capAtOpen: t.cap,
          strike,
          sigmaHour: t.sigma,
          seedBps: bps,
          liquidity: k.liquidity,
          openedAt: now(),
          endTs: acc ? acc.endTs.toNumber() : endTs,
          createTx: signature,
          resolved: false,
        });
        saveRegistry(reg);
        log(`opened #${marketId} ${kind} ${t.symbol} strike ${usd(strike)} seed ${(bps / 100).toFixed(1)}%`);
      } catch (e) {
        log(`open ${kind} ${t.symbol} failed: ${String(e.message || e).split("\n")[0]}`);
      }
      await sleep(1500);
    }
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const conn = new Connection(RPC, "confirmed");
  const kp = loadWallet();
  const client = PmAmmClient.fromProvider(new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" }), PROGRAM_ID, USDC_MINT);
  const reg = loadRegistry();
  reg.keeper = kp.publicKey.toBase58();
  reg.cluster = RPC.includes("devnet") ? "devnet" : "mainnet";
  saveRegistry(reg);
  log(`keeper ${reg.keeper} on ${reg.cluster}`);

  const sol = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  if (sol < 0.1 || (await usdcBalance(conn, kp.publicKey)) < 100) await topUp(conn, kp.publicKey);
  log(`balance ${((await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL).toFixed(3)} SOL, ${await usdcBalance(conn, kp.publicKey)} mUSDC`);

  const once = process.argv.includes("--once");
  for (;;) {
    const jobs = [
      ["resolve", () => resolveDue(client, reg)],
      ["recycle", () => recycle(client, reg)],
      ["open", () => openNew(client, conn, reg, kp.publicKey)],
    ];
    for (const [name, job] of jobs) {
      try {
        await job();
      } catch (e) {
        log(`${name}: ${String(e.message || e).split("\n")[0]}`);
      }
    }
    if (once) break;
    await sleep(ROUND_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
