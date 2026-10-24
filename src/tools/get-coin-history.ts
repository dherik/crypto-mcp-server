/**
 * Tool: get_coin_history
 *
 * Price history (open/high/low/close) for a coin over N days.
 * See src/tools/get-crypto-price.ts for the TOOLS concept overview.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { geckoFetch, sanitizeCoinId } from "../api/coingecko.js";
import { formatUSD, formatPercent } from "../formatting.js";

export function register(server: McpServer) {
  server.registerTool(
    "get_coin_history",
    {
      title: "Get Coin Price History",
      description:
        "Get the price history of a cryptocurrency over a number of days, with high/low/open/close summary.",
      inputSchema: z.object({
        coinId: z.string().describe("CoinGecko coin ID (e.g. 'bitcoin')"),
        days: z
          .number()
          .min(1)
          .max(365)
          .default(7)
          .describe("Number of days of history to retrieve (1-365, default 7)"),
      }),
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
}
