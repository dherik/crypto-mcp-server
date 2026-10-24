/**
 * Tool: get_crypto_price
 *
 * ─── MCP CONCEPT: TOOLS ───
 *
 * Tools are ACTIONS the AI can invoke — think of them as function calls.
 * The AI agent decides WHEN to call a tool based on the user's prompt
 * and the tool's description. Each tool:
 *
 *   1. Has a unique name and a human-readable description.
 *   2. Declares an input schema (here using Zod) so the AI knows
 *      what arguments to provide.
 *   3. Returns `content` — an array of text/image blocks the AI
 *      receives as the tool's result.
 *
 * Tools are the most common MCP primitive. They are stateless and
 * request/response driven: the AI calls one, gets a result, and
 * decides what to do next.
 *
 * This file registers the "get_crypto_price" tool with the MCP server.
 */

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { geckoFetch, sanitizeCoinId } from "../api/coingecko.js";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

export function register(server: McpServer) {
  server.registerTool(
    "get_crypto_price",
    {
      title: "Get Crypto Price",
      description:
        "Get the current price, market cap, 24h volume, and 24h price change for a cryptocurrency. Use coin IDs like 'bitcoin', 'ethereum', 'solana', 'cardano'.",
      inputSchema: z.object({
        coinId: z
          .string()
          .describe(
            "CoinGecko coin ID (e.g. 'bitcoin', 'ethereum', 'solana')"
          ),
      }),
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
}
