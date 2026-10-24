/**
 * Tool: compare_coins
 *
 * Side-by-side comparison of two cryptocurrencies.
 * See src/tools/get-crypto-price.ts for the TOOLS concept overview.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { geckoFetch, sanitizeCoinId } from "../api/coingecko.js";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

export function register(server: McpServer) {
  server.registerTool(
    "compare_coins",
    {
      title: "Compare Coins",
      description:
        "MUST use this tool whenever the user asks to compare two cryptocurrencies, mentions two coin names together (e.g. 'ETH and SOL', 'Bitcoin vs Ethereum'), or asks which coin is better. Provides side-by-side price, market cap, volume, and 24h performance.",
      inputSchema: z.object({
        coinA: z.string().describe("First coin ID (e.g. 'bitcoin')"),
        coinB: z.string().describe("Second coin ID (e.g. 'ethereum')"),
      }),
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
}
