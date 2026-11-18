"use client";
import { useEffect, useState } from "react";
import type { MarketsResponse } from "@/lib/types";

/** Polls /api/markets (server batches the chain reads and caches them). */
export function useMarkets(everyMs = 10_000) {
  const [data, setData] = useState<MarketsResponse | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let gone = false;
    const load = () =>
      fetch("/api/markets", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => !gone && setData(j))
        .catch(() => {});
    load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, everyMs);
    return () => {
      gone = true;
      clearInterval(id);
    };
  }, [everyMs, tick]);

  return { data, reload: () => setTick((t) => t + 1) };
}

/** Re-renders every second (countdowns). */
export function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
