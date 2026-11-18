/** One market as the keeper writes it in data/markets.json. */
export interface RegistryMarket {
  id: number;
  pda: string;
  kind: "hour" | "moon";
  symbol: string;
  tokenName: string;
  mint: string;
  pool: string;
  image: string | null;
  capAtOpen: number;
  strike: number;
  sigmaHour: number;
  seedBps: number;
  liquidity: number;
  openedAt: number;
  endTs: number;
  createTx: string;
  resolved: boolean;
  outcome?: "yes" | "no";
  resolution?: { cap: number; price: number; at: number; source: string; tx: string };
  recycled?: boolean;
}

/** What /api/markets returns: the registry entry + live on-chain state. */
export interface LiveMarket extends RegistryMarket {
  /** YES price 0..1 right now (1/0 once resolved). */
  price: number;
  secondsLeft: number;
  /** Pool value in USDC (L_eff * phi(Phi^-1(P))). */
  poolUsd: number;
  /** Latest market cap the keeper saw (open or resolution). */
  capNow?: number;
  /** Trades through HitCap and their USDC volume. */
  trades: number;
  volumeUsd: number;
}

export interface MarketsResponse {
  keeper: string | null;
  cluster: string;
  updatedAt: number;
  markets: LiveMarket[];
  stats: { markets: number; resolved: number; players: number; trades: number; volumeUsd: number };
}
