#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const COINGECKO_BASE = "https://api.coingecko.com/api/v3";

async function geckoFetch(path: string): Promise<unknown> {
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

function sanitizeCoinId(id: string): string {
  const sanitized = id.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(sanitized)) {
    throw new Error(
      `Invalid coin ID: "${id}". Use lowercase alphanumeric IDs with hyphens (e.g. "bitcoin", "binancecoin").`
    );
  }
  return encodeURIComponent(sanitized);
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value < 1 ? 6 : 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatLargeNumber(value: number): string {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return formatUSD(value);
}

// ─────────────────────────────────────────────
// Create the MCP server
// ─────────────────────────────────────────────
const server = new McpServer({
  name: "crypto-mcp-server",
  version: "1.0.0",
});

// ─────────────────────────────────────────────
// Tool 1: get_crypto_price
// Get current price + basic stats for a coin
// ─────────────────────────────────────────────
server.registerTool(
  "get_crypto_price",
  {
    title: "Get Crypto Price",
    description:
      "Get the current price, market cap, 24h volume, and 24h price change for a cryptocurrency. Use coin IDs like 'bitcoin', 'ethereum', 'solana', 'cardano'.",
    inputSchema: {
      coinId: z
        .string()
        .describe(
          "CoinGecko coin ID (e.g. 'bitcoin', 'ethereum', 'solana')"
        ),
    },
  },
  async ({ coinId }) => {
    const safeId = sanitizeCoinId(coinId);
    const data = (await geckoFetch(
      `/coins/markets?vs_currency=usd&ids=${safeId}&price_change_percentage=24h`
    )) as Array<{
      name: string;
      symbol: string;
      current_price: number;
      market_cap: number;
      total_volume: number;
      price_change_percentage_24h: number;
      market_cap_rank: number;
      circulating_supply: number;
      ath: number;
    }>;

      if (!data || data.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Coin "${coinId}" not found. Try using the full CoinGecko ID (e.g. "bitcoin" not "BTC").`,
          },
        ],
      };
    }

    const coin = data[0];
    const result = [
      `${coin.name} (${coin.symbol.toUpperCase()})`,
      `Rank: #${coin.market_cap_rank}`,
      `Price: ${formatUSD(coin.current_price)}`,
      `24h Change: ${formatPercent(coin.price_change_percentage_24h)}`,
      `Market Cap: ${formatLargeNumber(coin.market_cap)}`,
      `24h Volume: ${formatLargeNumber(coin.total_volume)}`,
      `Circulating Supply: ${coin.circulating_supply.toLocaleString()} ${coin.symbol.toUpperCase()}`,
      `All-Time High: ${formatUSD(coin.ath)}`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: result }],
    };
  }
);

// ─────────────────────────────────────────────
// Tool 2: get_top_coins
// List top N coins by market cap
// ─────────────────────────────────────────────
server.registerTool(
  "get_top_coins",
  {
    title: "Get Top Coins",
    description:
      "Get the top cryptocurrencies ranked by market cap, with current prices and 24h changes.",
    inputSchema: {
      limit: z
        .number()
        .min(1)
        .max(25)
        .default(10)
        .describe("Number of coins to return (1-25, default 10)"),
    },
  },
  async ({ limit }) => {
    const data = (await geckoFetch(
      `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&price_change_percentage=24h`
    )) as Array<{
      market_cap_rank: number;
      name: string;
      symbol: string;
      current_price: number;
      price_change_percentage_24h: number;
      market_cap: number;
    }>;

    const rows = data.map((coin) =>
      [
        `#${coin.market_cap_rank} ${coin.name} (${coin.symbol.toUpperCase()})`,
        `  Price: ${formatUSD(coin.current_price)}  |  24h: ${formatPercent(coin.price_change_percentage_24h)}  |  MCap: ${formatLargeNumber(coin.market_cap)}`,
      ].join("\n")
    );

    return {
      content: [
        {
          type: "text" as const,
          text: `Top ${limit} Cryptocurrencies by Market Cap:\n\n${rows.join("\n\n")}`,
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────
// Tool 3: compare_coins
// Side-by-side comparison of two coins
// ─────────────────────────────────────────────
server.registerTool(
  "compare_coins",
  {
    title: "Compare Coins",
    description:
      "MUST use this tool whenever the user asks to compare two cryptocurrencies, mentions two coin names together (e.g. 'ETH and SOL', 'Bitcoin vs Ethereum'), or asks which coin is better. Provides side-by-side price, market cap, volume, and 24h performance.",
    inputSchema: {
      coinA: z.string().describe("First coin ID (e.g. 'bitcoin')"),
      coinB: z.string().describe("Second coin ID (e.g. 'ethereum')"),
    },
  },
  async ({ coinA, coinB }) => {
    const safeA = sanitizeCoinId(coinA);
    const safeB = sanitizeCoinId(coinB);
    const data = (await geckoFetch(
      `/coins/markets?vs_currency=usd&ids=${safeA},${safeB}&price_change_percentage=24h`
    )) as Array<{
      name: string;
      symbol: string;
      current_price: number;
      market_cap: number;
      total_volume: number;
      price_change_percentage_24h: number;
      market_cap_rank: number;
    }>;

    if (data.length < 2) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Could not find both coins. Found: ${data.map((c) => c.name).join(", ")}. Check that both IDs are valid CoinGecko IDs.`,
          },
        ],
      };
    }

    const [a, b] = data;
    const lines = [
      `Comparison: ${a.name} vs ${b.name}`,
      "",
      `                        ${a.name.padEnd(16)} ${b.name}`,
      `Rank                    #${String(a.market_cap_rank).padEnd(15)} #${b.market_cap_rank}`,
      `Price                   ${formatUSD(a.current_price).padEnd(16)} ${formatUSD(b.current_price)}`,
      `24h Change              ${formatPercent(a.price_change_percentage_24h).padEnd(16)} ${formatPercent(b.price_change_percentage_24h)}`,
      `Market Cap              ${formatLargeNumber(a.market_cap).padEnd(16)} ${formatLargeNumber(b.market_cap)}`,
      `24h Volume              ${formatLargeNumber(a.total_volume).padEnd(16)} ${formatLargeNumber(b.total_volume)}`,
    ];

    return {
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  }
);

// ─────────────────────────────────────────────
// Tool 4: get_market_overview
// Global crypto market metrics
// ─────────────────────────────────────────────
server.registerTool(
  "get_market_overview",
  {
    title: "Get Market Overview",
    description:
      "Get a global overview of the crypto market: total market cap, BTC dominance, 24h volume, and number of active coins.",
    inputSchema: {},
  },
  async () => {
    const data = (await geckoFetch(`/global`)) as {
      data: {
        total_market_cap: { usd: number };
        total_volume: { usd: number };
        market_cap_percentage: { btc: number; eth: number };
        active_cryptocurrencies: number;
        market_cap_change_percentage_24h_usd: number;
      };
    };

    const g = data.data;
    const result = [
      "Global Crypto Market Overview",
      "",
      `Total Market Cap:    ${formatLargeNumber(g.total_market_cap.usd)}`,
      `24h Change:          ${formatPercent(g.market_cap_change_percentage_24h_usd)}`,
      `24h Volume:          ${formatLargeNumber(g.total_volume.usd)}`,
      `BTC Dominance:       ${g.market_cap_percentage.btc.toFixed(1)}%`,
      `ETH Dominance:       ${g.market_cap_percentage.eth.toFixed(1)}%`,
      `Active Coins:        ${g.active_cryptocurrencies.toLocaleString()}`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: result }],
    };
  }
);

// ─────────────────────────────────────────────
// Tool 5: get_coin_history
// Price history for a coin over N days
// ─────────────────────────────────────────────
server.registerTool(
  "get_coin_history",
  {
    title: "Get Coin Price History",
    description:
      "Get the price history of a cryptocurrency over a number of days, with high/low/open/close summary.",
    inputSchema: {
      coinId: z.string().describe("CoinGecko coin ID (e.g. 'bitcoin')"),
      days: z
        .number()
        .min(1)
        .max(365)
        .default(7)
        .describe("Number of days of history to retrieve (1-365, default 7)"),
    },
  },
  async ({ coinId, days }) => {
    const safeId = sanitizeCoinId(coinId);
    const data = (await geckoFetch(
      `/coins/${safeId}/market_chart?vs_currency=usd&days=${days}`
    )) as {
      prices: Array<[number, number]>;
    };

    if (!data.prices || data.prices.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No price history found for "${coinId}".`,
          },
        ],
      };
    }

    const prices = data.prices.map(([, price]) => price);
    const open = prices[0];
    const close = prices[prices.length - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const change = ((close - open) / open) * 100;

    const result = [
      `${coinId.charAt(0).toUpperCase() + coinId.slice(1)} — Last ${days} day(s)`,
      "",
      `Open:    ${formatUSD(open)}`,
      `Close:   ${formatUSD(close)}`,
      `High:    ${formatUSD(high)}`,
      `Low:     ${formatUSD(low)}`,
      `Change:  ${formatPercent(change)}`,
      `Points:  ${prices.length} data points sampled`,
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: result }],
    };
  }
);

// ─────────────────────────────────────────────
// Start the server over stdio
// ─────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Crypto MCP server running on stdio");
}

const isMainModule =
  process.argv[1]?.endsWith("build/index.js") ||
  process.argv[1]?.endsWith("build\\index.js");

if (isMainModule) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
