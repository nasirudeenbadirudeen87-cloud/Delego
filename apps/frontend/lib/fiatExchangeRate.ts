/**
 * FiatExchangeRate type and in-memory rate cache for the price tooltip (#920).
 *
 * Rates are fetched once per asset+target pair and cached in a module-level
 * Map for 5 minutes so multiple tooltip instances on the same page share the
 * same request. The cache is keyed as "ASSET:TARGET" (e.g. "XLM:USD").
 *
 * This layer is separate from lib/fiatRates.ts (which covers the storefront
 * fiat-switcher's aggregate rates) so the tooltip can handle per-asset USDC
 * rates as well.
 */

export type FiatAssetCode = "XLM" | "USDC";
export type FiatTargetCurrency = "USD" | "EUR" | "GBP";

export interface FiatExchangeRate {
  assetCode: FiatAssetCode;
  targetCurrency: FiatTargetCurrency;
  /** Units of targetCurrency per 1 unit of assetCode (e.g. USD per 1 XLM). */
  rate: number;
  /** Epoch millis the rate was fetched (or the fallback was applied). */
  fetchedAt: number;
  source: "oracle" | "coingecko";
}

// ---------------------------------------------------------------------------
// Module-level 5-minute in-memory cache (shared across all hook instances)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000;

const _cache = new Map<string, FiatExchangeRate>();

function cacheKey(asset: FiatAssetCode, target: FiatTargetCurrency): string {
  return `${asset}:${target}`;
}

function getCached(
  asset: FiatAssetCode,
  target: FiatTargetCurrency
): FiatExchangeRate | null {
  const entry = _cache.get(cacheKey(asset, target));
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    _cache.delete(cacheKey(asset, target));
    return null;
  }
  return entry;
}

function setCache(rate: FiatExchangeRate): void {
  _cache.set(cacheKey(rate.assetCode, rate.targetCurrency), rate);
}

// ---------------------------------------------------------------------------
// Static fallback rates (not live market data — displayed with staleness note)
// ---------------------------------------------------------------------------

const FALLBACK_RATES: Record<FiatAssetCode, Record<FiatTargetCurrency, number>> = {
  XLM:  { USD: 0.12, EUR: 0.11, GBP: 0.095 },
  USDC: { USD: 1.00, EUR: 0.93, GBP: 0.80  },
};

function makeFallback(
  asset: FiatAssetCode,
  target: FiatTargetCurrency
): FiatExchangeRate {
  return {
    assetCode: asset,
    targetCurrency: target,
    rate: FALLBACK_RATES[asset][target],
    fetchedAt: Date.now(),
    source: "oracle",
  };
}

/** True when a rate is older than the 5-minute staleness window. */
export function isFiatExchangeRateStale(rate: FiatExchangeRate): boolean {
  return Date.now() - rate.fetchedAt > CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Fetch helper — hits NEXT_PUBLIC_FIAT_RATES_URL with asset/target params,
// falls back to module cache then static placeholder on any error.
// ---------------------------------------------------------------------------

/**
 * Fetches the exchange rate for the given asset → target pair.
 * Results are cached in memory for 5 minutes.
 */
export async function fetchFiatExchangeRate(
  asset: FiatAssetCode,
  target: FiatTargetCurrency,
  signal?: AbortSignal
): Promise<FiatExchangeRate> {
  const cached = getCached(asset, target);
  if (cached) return cached;

  const baseUrl = process.env.NEXT_PUBLIC_FIAT_RATES_URL;
  if (!baseUrl) {
    const fallback = makeFallback(asset, target);
    setCache(fallback);
    return fallback;
  }

  try {
    const url = new URL(baseUrl);
    url.searchParams.set("asset", asset);
    url.searchParams.set("target", target);

    const res = await fetch(url.toString(), { signal });
    if (!res.ok) throw new Error(`Rates endpoint returned ${res.status}`);

    const body = (await res.json()) as unknown;
    const rate = parseRateFromBody(body, asset, target);
    if (rate === null) throw new Error("Invalid rate payload");

    const entry: FiatExchangeRate = {
      assetCode: asset,
      targetCurrency: target,
      rate,
      fetchedAt: Date.now(),
      source: "oracle",
    };
    setCache(entry);
    return entry;
  } catch {
    // Fall back to existing cache (possibly expired) then static placeholder
    const stale = _cache.get(cacheKey(asset, target));
    if (stale) return stale;
    const fallback = makeFallback(asset, target);
    setCache(fallback);
    return fallback;
  }
}

/**
 * Tries to parse a numeric rate from an API response. Accepts either:
 *   { rate: number }  |  { rates: { XLM: { USD: number } } }  |  bare number
 */
function parseRateFromBody(
  body: unknown,
  asset: FiatAssetCode,
  target: FiatTargetCurrency
): number | null {
  if (typeof body === "number" && Number.isFinite(body) && body > 0) {
    return body;
  }
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    // { rate: number }
    if (typeof obj.rate === "number" && Number.isFinite(obj.rate) && obj.rate > 0) {
      return obj.rate;
    }
    // { rates: { XLM: { USD: 0.12 } } }
    const nested =
      obj.rates &&
      typeof obj.rates === "object" &&
      (obj.rates as Record<string, unknown>)[asset];
    if (nested && typeof nested === "object") {
      const val = (nested as Record<string, unknown>)[target];
      if (typeof val === "number" && Number.isFinite(val) && val > 0) return val;
    }
    // { USD: 0.12 }
    if (typeof obj[target] === "number" && Number.isFinite(obj[target]) && (obj[target] as number) > 0) {
      return obj[target] as number;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Stroop → fiat conversion (mirrors lib/fiatRates.ts for consistency)
// ---------------------------------------------------------------------------

const STROOPS_PER_XLM = 10_000_000n;

/**
 * Converts a stroop amount to fiat using the given exchange rate.
 * Only meaningful when assetCode is "XLM"; for USDC pass the USDC amount
 * directly as a non-stroop bigint representing micro-USDC (7 decimals).
 */
export function convertStroopsToFiatExact(
  stroops: bigint,
  rate: FiatExchangeRate
): number {
  const units = Number(stroops) / Number(STROOPS_PER_XLM);
  return units * rate.rate;
}

/** Formats a fiat value with the currency symbol for the user's locale. */
export function formatFiatExact(
  value: number,
  currency: FiatTargetCurrency,
  locale?: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}
