"use client";
/**
 * One funded burner wallet for the whole app (see lib/burner.ts).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { PmAmmClient } from "@pm-amm/sdk";
import { RPC } from "@/lib/config";
import { createBurnerClient, fundBurner, getBalances, loadOrCreateBurner, sponsorKey, type Balances } from "@/lib/burner";

type Status = "loading" | "funding" | "ready" | "error";

interface WalletCtx {
  publicKey: PublicKey | null;
  client: PmAmmClient | null;
  connection: Connection;
  balances: Balances | null;
  status: Status;
  error: string | null;
  refresh: () => Promise<void>;
  topUp: () => Promise<void>;
}

const Ctx = createContext<WalletCtx | null>(null);

export function useWallet() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useWallet outside WalletProvider");
  return c;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const connection = useMemo(() => new Connection(RPC, "confirmed"), []);
  const [keypair, setKeypair] = useState<Keypair | null>(null);
  const [sponsor, setSponsor] = useState<PublicKey | null | undefined>(undefined);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setKeypair(loadOrCreateBurner());
    sponsorKey().then(setSponsor);
  }, []);

  const client = useMemo(
    () => (keypair && sponsor !== undefined ? createBurnerClient(connection, keypair, sponsor) : null),
    [connection, keypair, sponsor],
  );
  const publicKey = useMemo(() => keypair?.publicKey ?? null, [keypair]);

  const refresh = useCallback(async () => {
    if (keypair) setBalances(await getBalances(connection, keypair.publicKey));
  }, [connection, keypair]);

  const topUp = useCallback(async () => {
    if (!keypair) return;
    setStatus("funding");
    const r = await fundBurner(connection, keypair.publicKey);
    const b = await getBalances(connection, keypair.publicKey);
    setBalances(b);
    if (!r.funded && b.usdc === 0) {
      setError(r.reason);
      setStatus("error");
    } else {
      setError(r.funded ? null : r.reason);
      setStatus("ready");
    }
  }, [connection, keypair]);

  // First visit: fund the new wallet with test USDC.
  useEffect(() => {
    if (!keypair) return;
    let gone = false;
    (async () => {
      const b = await getBalances(connection, keypair.publicKey);
      if (gone) return;
      setBalances(b);
      if (b.usdc < 10) await topUp();
      else setStatus("ready");
    })();
    return () => {
      gone = true;
    };
  }, [connection, keypair, topUp]);

  return (
    <Ctx.Provider value={{ publicKey, client, connection, balances, status, error, refresh, topUp }}>
      {children}
    </Ctx.Provider>
  );
}
