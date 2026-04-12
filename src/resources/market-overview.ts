/**
 * Resource: crypto://market-overview (static)
 *
 * ─── MCP CONCEPT: RESOURCES ───
 *
 * Resources are DATA the AI can READ — think of them as GET endpoints
 * or files the AI can browse. Unlike tools (which are actions the AI
 * invokes), resources represent passive data sources.
 *
 * There are two kinds:
 *
 *   1. **Static resources** — fixed URI, always available.
 *      Registered with a plain string URI like "crypto://market-overview".
 *
 *   2. **Dynamic (template) resources** — URI patterns with variables.
 *      See src/resources/coin-profile.ts for that pattern.
 *
 * Resources support three operations:
 *
 *   - **list**    — the AI discovers what resources exist
 *   - **read**    — the AI reads the content of a specific resource
 *   - **complete** — autocomplete suggestions for URI template variables
 *                   (dynamic resources only)
 *
 * When to use resources vs tools?
 *   - Use a TOOL when the AI needs to *do* something (compute, compare, etc.)
 *   - Use a RESOURCE when the AI needs to *read* contextual data
 *     (e.g. a config file, a dashboard, a profile page).
 *
 * This file registers a static resource at "crypto://market-overview"
 * that returns global market metrics.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { geckoFetch } from "../api/coingecko.js";
import { formatPercent, formatLargeNumber } from "../formatting.js";

export function register(server: McpServer) {
  server.registerResource(
    "market-overview",
    "crypto://market-overview",
    {
      title: "Global Crypto Market Overview",
      description:
        "Live global crypto market metrics: total market cap, BTC dominance, 24h volume, active coins. Updated on every read.",
      mimeType: "text/plain",
    },
    async (uri) => {
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
      const text = [
        "Global Crypto Market Overview (Resource)",
        "",
        `Total Market Cap:    ${formatLargeNumber(g.total_market_cap.usd)}`,
        `24h Change:          ${formatPercent(g.market_cap_change_percentage_24h_usd)}`,
        `24h Volume:          ${formatLargeNumber(g.total_volume.usd)}`,
        `BTC Dominance:       ${g.market_cap_percentage.btc.toFixed(1)}%`,
        `ETH Dominance:       ${g.market_cap_percentage.eth.toFixed(1)}%`,
        `Active Coins:        ${g.active_cryptocurrencies.toLocaleString()}`,
      ].join("\n");

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text,
          },
        ],
      };
    }
  );
}
