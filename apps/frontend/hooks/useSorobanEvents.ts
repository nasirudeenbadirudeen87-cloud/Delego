/**
 * React hook for Soroban contract event subscriptions.
 *
 * Provides an EventSubscriptionManager instance that automatically
 * manages WebSocket connections and event delivery.
 *
 * @param config - Subscription configuration
 * @returns EventSubscriptionManager instance
 *
 * @example
 * ```tsx
 * const manager = useSorobanEvents({
 *   networkId: "testnet",
 *   rpcUrl: "https://soroban-testnet.stellar.org",
 * });
 *
 * useEffect(() => {
 *   const unsubscribe = manager.subscribe({
 *     contractId: contractAddress,
 *     topics: ["escrow_created"],
 *     startLedger: lastKnownLedger,
 *     onEvent: handleEvent,
 *     onError: handleError,
 *   });
 *
 *   return unsubscribe;
 * }, [manager, contractAddress]);
 * ```
 */

import { useEffect, useMemo, useRef } from "react";
import { useNetwork } from "./useNetwork";
import { createSubscriptionManager, type EventSubscriptionManager } from "../lib/sorobanEvents";

export interface UseSorobanEventsConfig {
  rpcUrl?: string;
}

export function useSorobanEvents(config: UseSorobanEventsConfig = {}): EventSubscriptionManager {
  const { networkId, network } = useNetwork();
  const managerRef = useRef<EventSubscriptionManager | null>(null);

  // Get RPC URL - prefer config, fall back to network config
  const rpcUrl = config.rpcUrl || network.sorobanRpcUrl;

  // Create manager once on mount
  useEffect(() => {
    const manager = createSubscriptionManager({
      networkId,
      rpcUrl,
    });

    managerRef.current = manager;

    return () => {
      manager.destroy();
    };
  }, [networkId, rpcUrl]);

  // Return the manager instance
  return useMemo(() => {
    if (!managerRef.current) {
      // Fallback in case of SSR or premature access
      return createSubscriptionManager({
        networkId,
        rpcUrl,
      });
    }
    return managerRef.current;
  }, [networkId, rpcUrl]);
}