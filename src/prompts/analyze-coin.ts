/**
 * Prompt: analyze-coin
 *
 * ─── MCP CONCEPT: PROMPTS ───
 *
 * Prompts are **reusable prompt templates** that the AI client can invoke.
 * Think of them as "saved prompts" with parameterized arguments — the
 * user picks a prompt, fills in the args, and the server returns a
 * structured set of messages that guide the conversation.
 *
 * Key points:
 *
 *   - Prompts return an array of `messages`, each with a `role`
 *     ("user" or "assistant") and `content` (text or images).
 *   - They can accept arguments (validated with Zod, just like tools).
 *   - The client decides whether to use a prompt — they are optional
 *     convenience features, not required for the server to function.
 *   - Prompts are discoverable: the client can list all available prompts.
 *
 * When to use prompts?
 *   - When you want to provide a structured analysis workflow
 *   - When you want to pre-fill context that guides the AI's response
 *   - When you want to offer "recipes" for common use cases
 *
 * This prompt fetches live market data and injects it as context,
 * so the AI starts with real numbers when performing analysis.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { geckoFetch, sanitizeCoinId } from "../api/coingecko.js";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

export function register(server: McpServer) {
  server.registerPrompt(
    "analyze-coin",
    {
      title: "Analyze a Cryptocurrency",
      description:
        "Fetches live market data for a coin and returns a prompt that asks the AI to perform a structured fundamental analysis.",
      argsSchema: {
        coinId: z
          .string()
          .describe("CoinGecko coin ID (e.g. 'bitcoin', 'ethereum')"),
      },
    },
    async ({ coinId }) => {
      const safeId = sanitizeCoinId(coinId);
      const data = (await geckoFetch(
        `/coins/markets?vs_currency=usd&ids=${safeId}&price_change_percentage=24h,7d`
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
          messages: [
            {
              role: "user" as const,
              content: {
                type: "text" as const,
                text: `Could not find coin "${coinId}". Please provide a valid CoinGecko coin ID.`,
              },
            },
          ],
        };
      }

      const coin = data[0];
      const contextBlock = [
        `Here is the live market data for ${coin.name} (${coin.symbol.toUpperCase()}):`,
        "",
        `- Rank: #${coin.market_cap_rank}`,
        `- Price: ${formatUSD(coin.current_price)}`,
        `- 24h Change: ${formatPercent(coin.price_change_percentage_24h)}`,
        `- Market Cap: ${formatLargeNumber(coin.market_cap)}`,
        `- 24h Volume: ${formatLargeNumber(coin.total_volume)}`,
        `- Circulating Supply: ${coin.circulating_supply.toLocaleString()} ${coin.symbol.toUpperCase()}`,
        `- All-Time High: ${formatUSD(coin.ath)}`,
        "",
        "Based on this data, provide a structured analysis covering:",
        "1. **Price Action** — What is the current trend? How far from ATH?",
        "2. **Market Position** — Rank, market cap relative to peers",
        "3. **Volume Analysis** — Is trading volume healthy?",
        "4. **Risk Assessment** — Key risks and considerations",
        "5. **Summary** — One-paragraph verdict",
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
