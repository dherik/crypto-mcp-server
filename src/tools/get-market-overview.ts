/**
 * Tool: get_market_overview
 *
 * Global crypto market metrics (total market cap, BTC dominance, etc.).
 * See src/tools/get-crypto-price.ts for the TOOLS concept overview.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { geckoFetch } from "../api/coingecko.js";
import { formatPercent, formatLargeNumber } from "../formatting.js";
import { z } from "zod";

export function register(server: McpServer) {
  server.registerTool(
    "get_market_overview",
    {
      title: "Get Market Overview",
      description:
        "Get a global overview of the crypto market: total market cap, BTC dominance, 24h volume, and number of active coins.",
      inputSchema: z.object({}),
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
}
