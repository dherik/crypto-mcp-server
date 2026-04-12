/**
 * Tool: get_ai_insight (uses SAMPLING)
 *
 * ─── MCP CONCEPT: SAMPLING ───
 *
 * Sampling is the most advanced MCP feature. It reverses the normal flow:
 *
 *   Normal flow:  Client (AI) → Server (your code)   [tool call]
 *   Sampling:     Server (your code) → Client (AI)   [text generation]
 *
 * With sampling, your MCP server asks the client's LLM to generate text.
 * This is powerful because your server can:
 *
 *   1. Fetch live data from an API
 *   2. Send that data to the LLM with a specific instruction
 *   3. Get back an AI-generated analysis
 *   4. Return that analysis to the user
 *
 * How it works:
 *
 *   server.server.createMessage({
 *     messages: [
 *       { role: "user", content: { type: "text", text: "..." } }
 *     ],
 *     maxTokens: 500,
 *     systemPrompt: "You are a crypto analyst...",
 *   })
 *
 * The client may REJECT sampling requests (user preference, capability
 * limits, etc.). Your code must handle this gracefully.
 *
 * Requirements:
 *   - The client must support sampling (e.g. Claude Desktop)
 *   - The MCP Inspector may NOT support sampling
 *   - Always wrap in try/catch and provide a fallback
 *
 * This tool fetches live coin data, then asks the client's LLM to
 * generate a brief market insight based on the numbers.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { geckoFetch, sanitizeCoinId } from "../api/coingecko.js";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

export function register(server: McpServer) {
  server.registerTool(
    "get_ai_insight",
    {
      title: "Get AI-Generated Market Insight",
      description:
        "Fetches live market data for a coin, then uses AI (via sampling) to generate a brief market insight. Requires a sampling-capable client.",
      inputSchema: {
        coinId: z
          .string()
          .describe("CoinGecko coin ID (e.g. 'bitcoin', 'ethereum')"),
      },
    },
    async ({ coinId }, extra) => {
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
        ath: number;
      }>;

      if (!data || data.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Coin "${coinId}" not found.`,
            },
          ],
        };
      }

      const coin = data[0];

      const marketContext = [
        `${coin.name} (${coin.symbol.toUpperCase()})`,
        `Rank: #${coin.market_cap_rank}`,
        `Price: ${formatUSD(coin.current_price)}`,
        `24h Change: ${formatPercent(coin.price_change_percentage_24h)}`,
        `Market Cap: ${formatLargeNumber(coin.market_cap)}`,
        `24h Volume: ${formatLargeNumber(coin.total_volume)}`,
        `All-Time High: ${formatUSD(coin.ath)}`,
        `Distance from ATH: ${(((coin.current_price - coin.ath) / coin.ath) * 100).toFixed(1)}%`,
      ].join("\n");

      try {
        const result = await server.server.createMessage({
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Here is the current market data:\n\n${marketContext}\n\nProvide a brief (2-3 sentence) market insight about this coin. Focus on the price action relative to ATH and the 24h trend. Be concise and objective.`,
              },
            },
          ],
          maxTokens: 300,
          systemPrompt:
            "You are a concise crypto market analyst. Provide brief, data-driven insights. Do not give financial advice.",
        });

        const insight =
          result.content.type === "text" ? result.content.text : "(AI returned non-text content)";

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `## AI Insight for ${coin.name}`,
                "",
                "### Market Data",
                marketContext,
                "",
                "### AI Analysis",
                insight,
              ].join("\n"),
            },
          ],
        };
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : String(err);

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `## Market Data for ${coin.name}`,
                "",
                marketContext,
                "",
                "### AI Insight",
                `Could not generate AI insight: ${errorMsg}`,
                "The client may not support sampling. Use the raw data above to form your own analysis.",
              ].join("\n"),
            },
          ],
        };
      }
    }
  );
}
