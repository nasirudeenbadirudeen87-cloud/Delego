"use client";

import { useCallback, useSyncExternalStore } from "react";

export interface TransactionLockState {
  activeTxId: string | null;
  isLocked: boolean;
  lockTimestamp: number | null;
  timeoutMs: number;
}

/** Safety timeout for a wallet that never resolves or rejects (#937). */
export const DEFAULT_TX_LOCK_TIMEOUT_MS = 45_000;

const UNLOCKED: TransactionLockState = {
  activeTxId: null,
  isLocked: false,
  lockTimestamp: null,
  timeoutMs: DEFAULT_TX_LOCK_TIMEOUT_MS,
};

// Module-level so every action button in the app shares one lock: a second
// "Release Funds" click anywhere is rejected while a signature is pending.
let state: TransactionLockState = UNLOCKED;
let releaseTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function setState(next: TransactionLockState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Claims the lock synchronously; returns false if another tx holds it. */
export function acquireTransactionLock(
  txId: string,
  timeoutMs = DEFAULT_TX_LOCK_TIMEOUT_MS
): boolean {
  if (state.isLocked) return false;
  setState({ activeTxId: txId, isLocked: true, lockTimestamp: Date.now(), timeoutMs });
  releaseTimer = setTimeout(() => releaseTransactionLock(txId), timeoutMs);
  return true;
}

/** Releases the lock if `txId` still owns it (a timed-out holder can't free a newer lock). */
export function releaseTransactionLock(txId: string) {
  if (state.activeTxId !== txId) return;
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  setState(UNLOCKED);
}

/** Test helper: force the store back to its initial state. */
export function resetTransactionLock() {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  setState(UNLOCKED);
}

/**
 * Global mutual exclusion for signing + submitting Soroban transactions.
 * `runLocked` resolves to `undefined` without calling `fn` when a transaction
 * is already in flight, so rapid multi-clicks submit exactly once. The lock is
 * always released when `fn` settles (including a declined signature) or after
 * `timeoutMs`, whichever comes first.
 */
export function useTransactionLock(timeoutMs = DEFAULT_TX_LOCK_TIMEOUT_MS) {
  const lock = useSyncExternalStore(subscribe, () => state, () => UNLOCKED);

  const runLocked = useCallback(
    async <T>(txId: string, fn: () => Promise<T>): Promise<T | undefined> => {
      if (!acquireTransactionLock(txId, timeoutMs)) return undefined;
      try {
        return await fn();
      } finally {
        releaseTransactionLock(txId);
      }
    },
    [timeoutMs]
  );

  return { ...lock, runLocked };
}
