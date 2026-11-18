export function usd(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "–";
  if (n >= 1e9) return `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K`;
  return `$${n.toFixed(n >= 100 ? 0 : 2)}`;
}

export function pct(p: number): string {
  const v = p * 100;
  if (v > 0 && v < 1) return "<1%";
  if (v < 100 && v > 99) return ">99%";
  return `${v.toFixed(0)}%`;
}

/** "42m 10s", "3h 05m", "ended". */
export function timeLeft(secs: number): string {
  if (secs <= 0) return "ended";
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function utcTime(ts: number): string {
  return new Date(ts * 1000).toISOString().slice(11, 16) + " UTC";
}

/** The question, written for humans. */
export function question(m: { kind: string; symbol: string; strike: number; endTs: number }): string {
  return m.kind === "moon"
    ? `Will $${m.symbol} 2x to ${usd(m.strike)} market cap by ${utcTime(m.endTs)}?`
    : `Will $${m.symbol} be above ${usd(m.strike)} market cap at ${utcTime(m.endTs)}?`;
}

export const usdc = (raw: number) => raw / 1e6;
