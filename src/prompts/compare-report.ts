/**
 * Prompt: compare-report
 *
 * A multi-argument prompt that generates a structured comparison report
 * for two cryptocurrencies. Demonstrates prompts with multiple parameters.
 *
 * See src/prompts/analyze-coin.ts for the PROMPTS concept overview.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { geckoFetch, sanitizeCoinId } from "../api/coingecko.js";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

export function register(server: McpServer) {
  server.registerPrompt(
    "compare-report",
    {
      title: "Compare Two Cryptocurrencies",
      description:
        "Fetches live data for two coins and returns a prompt asking the AI to produce a detailed comparison report.",
      argsSchema: {
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
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Could not find both coins. Found: ${data.map((c) => c.name).join(", ")}. Please provide valid CoinGecko coin IDs.`,
              },
            },
          ],
        };
      }

      const [a, b] = data;

      const contextBlock = [
        `Compare ${a.name} vs ${b.name} using this live data:`,
        "",
        `## ${a.name} (${a.symbol.toUpperCase()})`,
        `- Rank: #${a.market_cap_rank}`,
        `- Price: ${formatUSD(a.current_price)}`,
        `- 24h Change: ${formatPercent(a.price_change_percentage_24h)}`,
        `- Market Cap: ${formatLargeNumber(a.market_cap)}`,
        `- 24h Volume: ${formatLargeNumber(a.total_volume)}`,
        "",
        `## ${b.name} (${b.symbol.toUpperCase()})`,
        `- Rank: #${b.market_cap_rank}`,
        `- Price: ${formatUSD(b.current_price)}`,
        `- 24h Change: ${formatPercent(b.price_change_percentage_24h)}`,
        `- Market Cap: ${formatLargeNumber(b.market_cap)}`,
        `- 24h Volume: ${formatLargeNumber(b.total_volume)}`,
        "",
        "Please produce a comparison report with these sections:",
        "1. **Price Performance** — Which coin performed better in 24h?",
        "2. **Market Dominance** — Compare market caps and ranks",
        "3. **Liquidity** — Compare trading volumes",
        "4. **Verdict** — Which coin looks stronger right now and why?",
      ].join("\n");

      return {
        messages: [
          {
            role: "user" as const,
            content: {
              type: "text" as const,
              text: contextBlock,
            },
          },
        ],
      };
    }
  );
}
