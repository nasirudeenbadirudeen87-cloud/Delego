/**
 * useBalanceHistory
 *
 * Fetches all account balances from Horizon and builds a 30-day daily XLM
 * balance series by replaying account_credited / account_debited effects in
 * reverse chronological order.
 *
 * Graceful behaviour:
 *  - When Horizon returns HTTP 404 the account is unfunded → balance = 0,
 *    series = [], status = "idle".
 *  - When effects are unavailable / empty the series is [] (sparkline shows
 *    its own empty state).
 *  - Works on both testnet and mainnet via the active network horizonUrl.
 */

"use client";

import { useCallback, useEffect, useState } from "react";

/** A single Horizon balance entry from GET /accounts/{id} */
export interface HorizonBalance {
  asset_type: "native" | "credit_alphanum4" | "credit_alphanum12";
  asset_code?: string; // undefined for native XLM
  asset_issuer?: string; // undefined for native XLM
  balance: string;
}

/** One daily checkpoint for the sparkline */
export interface BalancePoint {
  /** ISO date string, e.g. "2025-07-26" */
  date: string;
  balance: number;
}

export type BalanceHistoryStatus = "idle" | "loading" | "error";

export interface BalanceHistoryState {
  /** All balances returned by Horizon (empty when not loaded or unfunded) */
  balances: HorizonBalance[];
  /** 30-day daily XLM series, newest entry last */
  series: BalancePoint[];
  status: BalanceHistoryStatus;
  /** True when the account exists on-chain but has zero XLM */
  isUnfunded: boolean;
  /** True when the Horizon 404 response confirms account does not exist yet */
  accountNotFound: boolean;
  /** Refetches account balance and effects history from Horizon */
  refetch: () => Promise<void>;
}

// Horizon effect type identifiers we care about
const CREDIT_TYPE = "account_credited";
const DEBIT_TYPE = "account_debited";

interface HorizonEffect {
  type: string;
  asset_type?: string;
  amount?: string;
  created_at: string; // ISO 8601
}

interface HorizonEffectsPage {
  _embedded: {
    records: HorizonEffect[];
  };
  _links: {
    next?: { href: string };
  };
}

/** Formats a Date as "YYYY-MM-DD" in UTC */
function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Builds 30 UTC date keys ending today (inclusive), newest last */
function buildDateRange(): string[] {
  const keys: string[] = [];
  const now = new Date();
  const utcNow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  for (let i = 29; i >= 0; i--) {
    const d = new Date(utcNow);
    d.setUTCDate(utcNow.getUTCDate() - i);
    keys.push(toDateKey(d));
  }
  return keys;
}

/**
 * Fetches up to `maxEffects` native-asset effects for `address` from Horizon,
 * paginating until we've collected all effects within the last 30 days or
 * reached the page limit.
 */
async function fetchRecentEffects(
  horizonUrl: string,
  address: string,
  maxEffects = 400
): Promise<HorizonEffect[]> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);

  const all: HorizonEffect[] = [];
  let url: string | null =
    `${horizonUrl}/accounts/${encodeURIComponent(address)}/effects?limit=200&order=desc`;

  while (url && all.length < maxEffects) {
    const res = await fetch(url);
    if (!res.ok) break;

    const page = (await res.json()) as HorizonEffectsPage;
    const records = page._embedded?.records ?? [];
    if (records.length === 0) break;

    let hitCutoff = false;
    for (const effect of records) {
      const ts = new Date(effect.created_at);
      if (ts < cutoff) {
        hitCutoff = true;
        break;
      }
      all.push(effect);
    }

    if (hitCutoff) break;
    url = page._links?.next?.href ?? null;
  }

  return all;
}

/**
 * Replays effects in reverse to reconstruct daily XLM balance checkpoints.
 * We start from the current XLM balance and subtract credits / add back debits
 * as we travel back in time.
 */
function buildSeries(
  currentXlm: number,
  effects: HorizonEffect[]
): BalancePoint[] {
  const dateRange = buildDateRange();
  const dateSet = new Set(dateRange);
  // Map date → running balance delta (positive = net credit on that day)
  const deltaByDate = new Map<string, number>();

  for (const effect of effects) {
    if (effect.asset_type !== "native") continue;
    if (effect.type !== CREDIT_TYPE && effect.type !== DEBIT_TYPE) continue;
    const amount = parseFloat(effect.amount ?? "0");
    if (!isFinite(amount)) continue;

    const key = effect.created_at ? effect.created_at.slice(0, 10) : "";
    if (!dateSet.has(key)) continue;

    const prev = deltaByDate.get(key) ?? 0;
    // Credits increased balance; debits decreased it
    deltaByDate.set(
      key,
      effect.type === CREDIT_TYPE ? prev + amount : prev - amount
    );
  }

  // Walk from oldest → newest, accumulating. We start by computing what the
  // balance was 30 days ago by subtracting all net credits since then.
  const totalDeltaSince = Array.from(deltaByDate.values()).reduce(
    (s, d) => s + d,
    0
  );
  let running = currentXlm - totalDeltaSince;

  const series: BalancePoint[] = dateRange.map((date) => {
    const delta = deltaByDate.get(date) ?? 0;
    running += delta;
    return { date, balance: Math.max(0, running) };
  });

  return series;
}

export function useBalanceHistory(
  address: string | null,
  horizonUrl: string,
  enabled: boolean
): BalanceHistoryState {
  const load = useCallback(async () => {
    if (!address || !enabled) {
      setState({
        balances: [],
        series: [],
        status: "idle",
        isUnfunded: false,
        accountNotFound: false,
        refetch: async () => {},
      });
      return;
    }

    setState({
      balances: [],
      series: [],
      status: "loading",
      isUnfunded: false,
      accountNotFound: false,
      refetch: load,
    });

    try {
      // 1. Fetch account record for balances
      const accountRes = await fetch(
        `${horizonUrl}/accounts/${encodeURIComponent(address)}`
      );

      if (accountRes.status === 404) {
        setState({
          balances: [],
          series: [],
          status: "idle",
          isUnfunded: false,
          accountNotFound: true,
          refetch: load,
        });
        return;
      }

      if (!accountRes.ok) {
        throw new Error(`Horizon account fetch failed: ${accountRes.status}`);
      }

      const accountData = (await accountRes.json()) as {
        balances?: HorizonBalance[];
      };
      const balances: HorizonBalance[] = accountData.balances ?? [];

      const nativeBalance = balances.find(
        (b: HorizonBalance) => b.asset_type === "native"
      );
      const currentXlm = nativeBalance ? parseFloat(nativeBalance.balance) : 0;
      const isUnfunded = currentXlm === 0 && balances.length <= 1;

      // 2. Fetch effects for sparkline series (best-effort)
      let series: BalancePoint[] = [];
      try {
        const effects = await fetchRecentEffects(horizonUrl, address);
        series = buildSeries(currentXlm, effects);
      } catch {
        // Non-fatal: sparkline shows empty state
        series = [];
      }

      setState({
        balances,
        series,
        status: "idle",
        isUnfunded,
        accountNotFound: false,
        refetch: load,
      });
    } catch {
      setState((prev: BalanceHistoryState) => ({
        ...prev,
        status: "error",
        series: [],
        balances: [],
        refetch: load,
      }));
    }
  }, [address, horizonUrl, enabled]);

  const [state, setState] = useState<BalanceHistoryState>({
    balances: [],
    series: [],
    status: "idle",
    isUnfunded: false,
    accountNotFound: false,
    refetch: load,
  });

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}
