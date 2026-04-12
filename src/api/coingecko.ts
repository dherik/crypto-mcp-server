/**
 * Shared CoinGecko API layer.
 *
 * Isolates all CoinGecko-specific logic (base URL, fetching, validation,
 * error handling) so that tools, resources, and prompts all reuse the
 * same code. Any module that needs market data imports from here.
 */

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

export async function geckoFetch(path: string): Promise<unknown> {
  const res = await fetch(`${COINGECKO_BASE}${path}`, {
    headers: { Accept: "application/json" },
  });

  if (res.status === 429) {
    throw new Error(
      "CoinGecko API rate limit reached (30 req/min on the free tier). Please wait a moment and try again."
    );
  }

  if (!res.ok) {
    throw new Error(`CoinGecko API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export function sanitizeCoinId(id: string): string {
  const sanitized = id.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(sanitized)) {
    throw new Error(
      `Invalid coin ID: "${id}". Use lowercase alphanumeric IDs with hyphens (e.g. "bitcoin", "binancecoin").`
    );
  }
  return encodeURIComponent(sanitized);
}
