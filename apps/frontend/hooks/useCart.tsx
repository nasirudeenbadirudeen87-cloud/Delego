"use client";

/**
 * Global shopping cart context (#917).
 *
 * Persists cart items to localStorage so they survive page navigation and
 * browser restarts. Exposes a useCart hook consumed by the CartDrawer,
 * product cards, and the checkout flow.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  computeCartSummary,
  readCartFromStorage,
  writeCartToStorage,
  type CartItem,
  type CartSummary,
} from "../lib/cart";

// ---------------------------------------------------------------------------
// State & reducer
// ---------------------------------------------------------------------------

interface CartState {
  items: CartItem[];
  /** True once the persisted value has been read on the client */
  hydrated: boolean;
  /** True when the drawer is open */
  drawerOpen: boolean;
}

type CartAction =
  | { type: "HYDRATE"; items: CartItem[] }
  | { type: "ADD_ITEM"; item: CartItem }
  | { type: "REMOVE_ITEM"; productId: string }
  | { type: "SET_QUANTITY"; productId: string; quantity: number }
  | { type: "CLEAR" }
  | { type: "OPEN_DRAWER" }
  | { type: "CLOSE_DRAWER" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "HYDRATE":
      return { ...state, items: action.items, hydrated: true };

    case "ADD_ITEM": {
      const existing = state.items.find(
        (i) => i.productId === action.item.productId
      );
      if (existing) {
        // Increment quantity up to maxStock
        const next = Math.min(
          existing.quantity + action.item.quantity,
          existing.maxStock
        );
        return {
          ...state,
          items: state.items.map((i) =>
            i.productId === action.item.productId
              ? { ...i, quantity: next }
              : i
          ),
        };
      }
      const clampedItem: CartItem = {
        ...action.item,
        quantity: Math.min(action.item.quantity, action.item.maxStock),
      };
      return { ...state, items: [...state.items, clampedItem] };
    }

    case "REMOVE_ITEM":
      return {
        ...state,
        items: state.items.filter((i) => i.productId !== action.productId),
      };

    case "SET_QUANTITY": {
      if (action.quantity <= 0) {
        return {
          ...state,
          items: state.items.filter((i) => i.productId !== action.productId),
        };
      }
      return {
        ...state,
        items: state.items.map((i) => {
          if (i.productId !== action.productId) return i;
          return { ...i, quantity: Math.min(action.quantity, i.maxStock) };
        }),
      };
    }

    case "CLEAR":
      return { ...state, items: [] };

    case "OPEN_DRAWER":
      return { ...state, drawerOpen: true };

    case "CLOSE_DRAWER":
      return { ...state, drawerOpen: false };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface CartContextValue {
  summary: CartSummary;
  hydrated: boolean;
  drawerOpen: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    hydrated: false,
    drawerOpen: false,
  });

  // Hydrate from localStorage on the first client render
  useEffect(() => {
    dispatch({ type: "HYDRATE", items: readCartFromStorage() });
  }, []);

  // Persist every time items change (after hydration)
  useEffect(() => {
    if (!state.hydrated) return;
    writeCartToStorage(state.items);
  }, [state.items, state.hydrated]);

  const addItem = useCallback((item: CartItem) => {
    dispatch({ type: "ADD_ITEM", item });
  }, []);

  const removeItem = useCallback((productId: string) => {
    dispatch({ type: "REMOVE_ITEM", productId });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    dispatch({ type: "SET_QUANTITY", productId, quantity });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  const openDrawer = useCallback(() => {
    dispatch({ type: "OPEN_DRAWER" });
  }, []);

  const closeDrawer = useCallback(() => {
    dispatch({ type: "CLOSE_DRAWER" });
  }, []);

  const summary = useMemo(
    () => computeCartSummary(state.items),
    [state.items]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      summary,
      hydrated: state.hydrated,
      drawerOpen: state.drawerOpen,
      addItem,
      removeItem,
      setQuantity,
      clearCart,
      openDrawer,
      closeDrawer,
    }),
    [
      summary,
      state.hydrated,
      state.drawerOpen,
      addItem,
      removeItem,
      setQuantity,
      clearCart,
      openDrawer,
      closeDrawer,
    ]
  );

  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/** Access the cart state and actions. Must be used within a CartProvider. */
export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
