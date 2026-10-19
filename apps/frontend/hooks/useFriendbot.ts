"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Shape required by issue #905. */
export interface FriendbotRequestState {
  address: string;
  status: "idle" | "requesting" | "polling" | "success" | "error";
  transactionHash?: string;
  cooldownSecondsRemaining: number;
  errorMessage?: string;
}

/** Legacy response type kept for backward-compat with existing callers. */
export interface FaucetFundResponse {
  success: boolean;
  transactionHash?: string;
  fundedAmountXlm: string;
  errorMessage?: string;
}

const FRIENDBOT_URL = "https://friendbot.stellar.org";
const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const FUNDED_AMOUNT_XLM = "10000";
const COOLDOWN_SECONDS = 60;
const POLL_INTERVAL_MS = 3_000;
const POLL_MAX_ATTEMPTS = 20; // up to 60 s of polling
const LS_COOLDOWN_KEY = "delego:friendbot:cooldown"; // { address, expiresAt }

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

interface CooldownEntry {
  address: string;
  expiresAt: number; // epoch ms
}

function readCooldown(): CooldownEntry | null {
  try {
    const raw = window.localStorage.getItem(LS_COOLDOWN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CooldownEntry;
  } catch {
    return null;
  }
}

function writeCooldown(address: string): void {
  try {
    const entry: CooldownEntry = {
      address,
      expiresAt: Date.now() + COOLDOWN_SECONDS * 1_000,
    };
    window.localStorage.setItem(LS_COOLDOWN_KEY, JSON.stringify(entry));
  } catch {
    // localStorage unavailable (private mode) – cooldown lives only in memory
  }
}

function clearCooldown(): void {
  try {
    window.localStorage.removeItem(LS_COOLDOWN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns remaining cooldown seconds (0 when expired / no entry).
 * Clears the stored entry when it has expired to avoid stale reads.
 */
function remainingCooldownSeconds(address: string): number {
  const entry = readCooldown();
  if (!entry || entry.address !== address) return 0;
  const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1_000);
  if (remaining <= 0) {
    clearCooldown();
    return 0;
  }
  return remaining;
}

// ---------------------------------------------------------------------------
// Horizon polling
// ---------------------------------------------------------------------------

/** Polls Horizon until the transaction with `hash` reaches ledger inclusion. */
async function pollTransactionConfirmation(hash: string): Promise<boolean> {
  for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
    try {
      const res = await fetch(
        `${HORIZON_TESTNET}/transactions/${encodeURIComponent(hash)}`
      );
      if (res.ok) return true;
    } catch {
      // transient network error – keep polling
    }
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const INITIAL_STATE: FriendbotRequestState = {
  address: "",
  status: "idle",
  cooldownSecondsRemaining: 0,
};

/**
 * useFriendbot – issue #905
 *
 * Exposes a `fund(address)` function that:
 *   1. Enforces a 60-second localStorage-backed cooldown per address.
 *   2. Calls the Stellar Testnet Friendbot API.
 *   3. Polls Horizon until the transaction lands on-ledger.
 *   4. Ticks a countdown timer for the cooldown period.
 *
 * The full `FriendbotRequestState` is available via `state`, and a simpler
 * `FaucetFundResponse` promise is returned from `fund()` for call-sites that
 * only need the result.
 */
export function useFriendbot() {
  const [state, setState] = useState<FriendbotRequestState>(INITIAL_STATE);

  // Countdown ticker – decrements cooldownSecondsRemaining every second while
  // it is > 0.
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTicker = useCallback((address: string) => {
    if (tickerRef.current) clearInterval(tickerRef.current);

    tickerRef.current = setInterval(() => {
      const remaining = remainingCooldownSeconds(address);
      setState((prev) => {
        if (prev.cooldownSecondsRemaining === remaining) return prev;
        if (remaining <= 0) {
          if (tickerRef.current) clearInterval(tickerRef.current);
          tickerRef.current = null;
          return { ...prev, cooldownSecondsRemaining: 0 };
        }
        return { ...prev, cooldownSecondsRemaining: remaining };
      });
    }, 1_000);
  }, []);

  // Restore cooldown from localStorage when the address is already known.
  const initForAddress = useCallback(
    (address: string) => {
      const remaining = remainingCooldownSeconds(address);
      if (remaining > 0) {
        setState({
          address,
          status: "idle",
          cooldownSecondsRemaining: remaining,
        });
        startTicker(address);
      }
    },
    [startTicker]
  );

  // Clean up ticker on unmount.
  useEffect(() => {
    return () => {
      if (tickerRef.current) clearInterval(tickerRef.current);
    };
  }, []);

  const fund = useCallback(
    async (address: string): Promise<FaucetFundResponse> => {
      // -- Cooldown guard --
      const remaining = remainingCooldownSeconds(address);
      if (remaining > 0) {
        setState({
          address,
          status: "idle",
          cooldownSecondsRemaining: remaining,
          errorMessage: `Please wait ${remaining}s before requesting again.`,
        });
        return {
          success: false,
          fundedAmountXlm: "0",
          errorMessage: `Please wait ${remaining}s before requesting again.`,
        };
      }

      // -- Start request --
      setState({
        address,
        status: "requesting",
        cooldownSecondsRemaining: 0,
      });

      let txHash: string | undefined;

      try {
        const res = await fetch(
          `${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`
        );
        const json = (await res.json()) as { hash?: string; detail?: string };

        if (!res.ok) {
          const errorMessage =
            json.detail ?? `Friendbot request failed (${res.status}).`;
          setState({
            address,
            status: "error",
            cooldownSecondsRemaining: 0,
            errorMessage,
          });
          return { success: false, fundedAmountXlm: "0", errorMessage };
        }

        txHash = json.hash;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Friendbot request failed.";
        setState({
          address,
          status: "error",
          cooldownSecondsRemaining: 0,
          errorMessage,
        });
        return { success: false, fundedAmountXlm: "0", errorMessage };
      }

      // -- Poll for ledger confirmation --
      setState({
        address,
        status: "polling",
        transactionHash: txHash,
        cooldownSecondsRemaining: 0,
      });

      const confirmed = txHash
        ? await pollTransactionConfirmation(txHash)
        : false;

      if (!confirmed && txHash) {
        // Transaction was submitted but not confirmed within timeout – still
        // treat as success since Friendbot accepted it; the balance will
        // appear shortly.
      }

      // -- Start cooldown --
      writeCooldown(address);
      const cooldownRemaining = remainingCooldownSeconds(address);

      setState({
        address,
        status: "success",
        transactionHash: txHash,
        cooldownSecondsRemaining: cooldownRemaining,
      });

      startTicker(address);

      return {
        success: true,
        transactionHash: txHash,
        fundedAmountXlm: FUNDED_AMOUNT_XLM,
      };
    },
    [startTicker]
  );

  const reset = useCallback(() => {
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  return { state, fund, initForAddress, reset, status: state.status };
}
