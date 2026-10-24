/**
 * Tool: get_top_coins
 *
 * Lists the top N cryptocurrencies ranked by market cap.
 * See src/tools/get-crypto-price.ts for the TOOLS concept overview.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { geckoFetch } from "../api/coingecko.js";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

export function register(server: McpServer) {
  server.registerTool(
    "get_top_coins",
    {
      title: "Get Top Coins",
      description:
        "Get the top cryptocurrencies ranked by market cap, with current prices and 24h changes.",
      inputSchema: z.object({
        limit: z
          .number()
          .min(1)
          .max(25)
          .default(10)
          .describe("Number of coins to return (1-25, default 10)"),
      }),
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
}
