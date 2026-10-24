/**
 * Tool: get_ai_insight (uses MULTI-ROUND-TRIP REQUESTS / input_required)
 *
 * ─── THE PLAIN-ENGLISH VERSION (NO JARGON) ───
 *
 * Think of this server as a **market data helper** with one limitation:
 * it can look up live prices instantly, but it cannot *think* about
 * them — the thinking (the AI) lives inside the app you are chatting
 * with, not here.
 *
 * So when you ask "How is Bitcoin doing?", this happens:
 *
 *   1. Your app asks this server for an insight on Bitcoin.
 *   2. The server looks up the live numbers (price, 24h change, ...).
 *   3. The server can't write the opinion itself, so instead of a final
 *      answer it hands back a request slip: "Here are the numbers —
 *      please have your AI write 2-3 sentences about them, then call me
 *      back with what it wrote."
 *   4. Your app's AI writes the insight (e.g. "Bitcoin trades a little
 *      below its record high; the mood today is slightly cautious.").
 *   5. Your app calls the server again — the same question as before,
 *      but this time with the AI's text attached.
 *   6. The server staples the numbers and the AI's text together and
 *      hands you the finished report.
 *
 * Two safety nets:
 *
 *   - If the answer never comes back (you cancelled, the AI refused, or
 *     the app gave up), the server doesn't keep asking — it simply gives
 *     you the raw numbers so you can draw your own conclusion.
 *   - The request slip carries a small "already asked once" note, which
 *     is how the server tells a first visit from a return visit.
 *
 * That two-step "I'll get back to you" dance is what the rest of this
 * file describes in protocol terms as a Multi Round-Trip Request.
 *
 * ─── MCP CONCEPT: SERVER-TO-CLIENT LLM CALLS ───
 *
 * In the 2026-07-28 protocol revision the server cannot push a request to
 * the client: there is no held-open session. When a tool needs the
 * client's LLM mid-call, it uses the Multi Round-Trip Request (MRTR)
 * pattern — the call is turned around:
 *
 *   Round 1:  Client (AI) → Server  [tool call]
 *             Server returns `input_required` with an embedded LLM request
 *   Round 2:  Client answers the embedded request and RETRIES the tool
 *             call, attaching the answer in `inputResponses`
 *             Server sees the answer and returns the final result
 *
 *   inputRequired({
 *     inputRequests: {
 *       insight: inputRequired.createMessage({ messages: [...], maxTokens })
 *     }
 *   })
 *
 * The client decides which model fulfils the request — the server never
 * holds an LLM API key.
 *
 * ─── A REAL ROUND TRIP, ON THE WIRE ───
 *
 * A user asks their agent: "Give me an AI insight on Bitcoin".
 *
 * ROUND 1 — the client calls the tool. No LLM answer exists yet, so the
 * handler comes back with an `input_required` result instead of a tool
 * result (this is a SUCCESSFUL JSON-RPC response, not an error). Note
 * that `sampling/createMessage` below is the embedded request's wire
 * identifier — on this revision it travels inside the tool result, not
 * as a server-initiated request:
 *
 *   {
 *     "resultType": "input_required",
 *     "requestState": "get_ai_insight:asked",
 *     "inputRequests": {
 *       "insight": {
 *         "method": "sampling/createMessage",
 *         "params": {
 *           "messages": [
 *             {
 *               "role": "user",
 *               "content": {
 *                 "type": "text",
 *                 "text": "Here is the current market data:\n\nBitcoin (BTC)\nRank: #1\nPrice: $80,476.00\n24h Change: -0.95%\n...\n\nProvide a brief (2-3 sentence) market insight..."
 *               }
 *             }
 *           ],
 *           "systemPrompt": "You are a concise crypto market analyst...",
 *           "maxTokens": 300
 *         }
 *       }
 *     }
 *   }
 *
 * The client routes `params` through the model it controls (say, Claude
 * Sonnet), gets a completion, and RETRIES the exact same tool call —
 * same name, same arguments — with the answer and the requestState echo
 * attached to the params (simplified; `_meta` carries the same
 * protocol/client envelope as round 1):
 *
 *   {
 *     "method": "tools/call",
 *     "params": {
 *       "name": "get_ai_insight",
 *       "arguments": { "coinId": "bitcoin" },
 *       "requestState": "get_ai_insight:asked",
 *       "inputResponses": {
 *         "insight": {
 *           "role": "assistant",
 *           "model": "claude-sonnet-4-5",
 *           "content": {
 *             "type": "text",
 *             "text": "BTC trades ~2% below its all-time high after a mild 24h pullback. Volume remains healthy relative to market cap and the trend structure stays constructive."
 *           }
 *         }
 *       }
 *     }
 *   }
 *
 * Note the symmetry: `inputResponses` keys mirror `inputRequests` keys,
 * and each value is the BARE result object (`role` + `model` + `content`
 * for sampling, `action` + `content` for elicitations). These values
 * arrive from the client, so the handler treats them as untrusted input
 * and narrows them defensively before use.
 *
 * ROUND 2 — the handler runs again (re-fetching the data), finds the
 * answer under "insight", and returns the final tool result:
 *
 *   {
 *     "content": [
 *       {
 *         "type": "text",
 *         "text": "## AI Insight for Bitcoin\n\n### Market Data\nBitcoin (BTC)\n...\n\n### AI Analysis\nBTC trades ~2% below its all-time high..."
 *       }
 *     ]
 *   }
 *
 * If the retry had carried the requestState but NO usable answer — the
 * user declined, the model errored, or a buggy client retried empty —
 * the handler returns the raw-data fallback instead. The requestState
 * marker is what prevents an infinite ping-pong: once it is present, the
 * handler never re-issues the LLM request.
 *
 * Handling all outcomes:
 *
 *   - Round 1 has no answer yet → return `inputRequired`.
 *   - Round 2 with a sampling answer → use the generated text.
 *   - Round 2+ without a usable answer (declined, errored, or a client
 *     that retried without answering) → graceful fallback with the raw
 *     market data. The `requestState` marker distinguishes "asked at
 *     least once" from "first entry", so the same handler can't loop
 *     forever against a misbehaving client.
 *
 *
 * Requirements:
 *   - The client must support LLM routing (sampling). Clients that never
 *     declared it get a protocol-level rejection before the wire.
 *   - The MCP Inspector may NOT support it; the fallback path covers that.
 *
 * This tool fetches live coin data, then asks the client's LLM to
 * generate a brief market insight based on the numbers.
 */

import type {
  CallToolResult,
  InputRequiredResult,
} from "@modelcontextprotocol/server";
import { inputRequired, inputResponse } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { geckoFetch, sanitizeCoinId } from "../api/coingecko.js";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

/**
 * Opaque marker carried across MRTR rounds. It claims nothing sensitive
 * (only "the LLM was already asked once"), so it is left unencrypted and
 * unsigned on purpose — a forged marker just skips the LLM ask and yields
 * the same raw data any other tool returns.
 */
const ASKED_MARKER = "get_ai_insight:asked";

export function register(server: McpServer) {
  server.registerTool(
    "get_ai_insight",
    {
      title: "Get AI-Generated Market Insight",
      description:
        "Fetches live market data for a coin, then asks the client's LLM (via a multi-round-trip sampling request) to generate a brief market insight. Requires a client that supports sampling/LLM routing; otherwise falls back to raw data.",
      inputSchema: z.object({
        coinId: z
          .string()
          .describe("CoinGecko coin ID (e.g. 'bitcoin', 'ethereum')"),
      }),
    },
    async ({ coinId }, ctx): Promise<CallToolResult | InputRequiredResult> => {
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

      const fallback = (): CallToolResult => ({
        content: [
          {
            type: "text" as const,
            text: [
              `## Market Data for ${coin.name}`,
              "",
              marketContext,
              "",
              "### AI Insight",
              "Could not generate an AI insight: the client did not return an answer for the LLM request.",
              "Use the raw data above to form your own analysis.",
            ].join("\n"),
          },
        ],
      });

      const view = inputResponse(ctx.mcpReq.inputResponses, "insight");

      // What `view` can be, in practice:
      //
      //   Round 1 (just called):        { kind: "missing" }
      //   Round 2 (client answered):    { kind: "sampling", result: {
      //                                   role: "assistant",
      //                                   model: "claude-sonnet-4-5",
      //                                   content: { type: "text", text: "BTC trades ~2% below ATH..." }
      //                                 } }
      //   Retry without an answer:      { kind: "missing" }   ← caught by the requestState guard below

      if (view.kind === "sampling") {
        const result = view.result;
        // `content` is a single block normally, or an array when the
        // client answered with the tool-use variant of sampling.
        const content = Array.isArray(result.content)
          ? result.content.find((c) => c.type === "text")
          : result.content;
        const insight =
          content?.type === "text"
            ? content.text
            : "(AI returned non-text content)";

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
      }

      if (view.kind === "missing" && ctx.mcpReq.requestState() === undefined) {
        // Round 1 — no answer yet, never asked. Ask the client's LLM by
        // returning the embedded sampling request; the client answers it
        // and retries this same tool call.
        return inputRequired({
          inputRequests: {
            insight: inputRequired.createMessage({
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
            }),
          },
          requestState: ASKED_MARKER,
        });
      }

      // Asked before, still no usable answer (declined, errored, or a
      // retry that carried no response) — degrade gracefully.
      return fallback();
    }
  );
}
