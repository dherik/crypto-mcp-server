#!/usr/bin/env node

/**
 * Crypto MCP Server — Entry Point
 *
 * ─── WHAT IS MCP? ───
 *
 * MCP (Model Context Protocol) is a protocol that connects AI agents
 * (like GitHub Copilot, Claude, OpenCode) to external data and tools.
 * It uses JSON-RPC over stdio (stdin/stdout) for communication.
 *
 * IMPORTANT: console.log() is NEVER used for output, because stdout
 * is reserved for JSON-RPC messages. Use console.error() for debug logs.
 *
 * ─── MCP PRIMITIVES ───
 *
 * This server demonstrates all four MCP primitives:
 *
 *   1. **TOOLS** — Actions the AI can invoke (function calls).
 *      Defined in src/tools/*. Each tool has a name, description,
 *      input schema (Zod), and returns content to the AI.
 *      → Tools are the most common primitive.
 *
 *   2. **RESOURCES** — Data the AI can read (like GET endpoints).
 *      Defined in src/resources/*. Resources can be static (fixed URI)
 *      or dynamic (URI templates with variables).
 *      → Good for contextual data the AI browses.
 *
 *   3. **PROMPTS** — Reusable prompt templates the AI client can invoke.
 *      Defined in src/prompts/*. They return structured messages that
 *      guide the AI's response. They accept arguments (Zod schemas).
 *      → Good for structured analysis workflows.
 *
 *   4. **SAMPLING** — The server asks the client's LLM to generate text.
 *      Used in src/tools/get-ai-insight.ts. The server fetches live data,
 *      sends it to the LLM via createMessage(), and returns the result.
 *      → The most advanced MCP feature. Client must support it.
 *
 * ─── ARCHITECTURE ───
 *
 * Each module exports a single `register(server)` function that wires
 * up its tools/resources/prompts to the MCP server. This keeps the
 * entry point clean and each feature self-contained:
 *
 *   src/
 *   ├── index.ts                  ← You are here (bootstrap)
 *   ├── api/coingecko.ts          Shared fetch & validation logic
 *   ├── formatting.ts             Number/currency formatters
 *   ├── tools/                    Tool registrations
 *   ├── resources/                Resource registrations
 *   ├── prompts/                  Prompt registrations
 *   └── test/                     Unit tests
 *
 * ─── TRANSPORT ───
 *
 * This server uses **stdio transport** — it reads JSON-RPC from stdin
 * and writes JSON-RPC to stdout. The AI client spawns this process
 * and communicates with it directly. No HTTP server needed.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { register as registerGetCryptoPrice } from "./tools/get-crypto-price.js";
import { register as registerGetTopCoins } from "./tools/get-top-coins.js";
import { register as registerCompareCoins } from "./tools/compare-coins.js";
import { register as registerGetMarketOverview } from "./tools/get-market-overview.js";
import { register as registerGetCoinHistory } from "./tools/get-coin-history.js";
import { register as registerGetAiInsight } from "./tools/get-ai-insight.js";
import { register as registerMarketOverviewResource } from "./resources/market-overview.js";
import { register as registerCoinProfileResource } from "./resources/coin-profile.js";
import { register as registerAnalyzeCoinPrompt } from "./prompts/analyze-coin.js";
import { register as registerCompareReportPrompt } from "./prompts/compare-report.js";

const server = new McpServer({
  name: "crypto-mcp-server",
  version: "1.0.0",
});

registerGetCryptoPrice(server);
registerGetTopCoins(server);
registerCompareCoins(server);
registerGetMarketOverview(server);
registerGetCoinHistory(server);
registerGetAiInsight(server);
registerMarketOverviewResource(server);
registerCoinProfileResource(server);
registerAnalyzeCoinPrompt(server);
registerCompareReportPrompt(server);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Crypto MCP server running on stdio");
}

const isMainModule =
  process.argv[1]?.endsWith("build/index.js") ||
  process.argv[1]?.endsWith("build\\index.js");

if (isMainModule) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}

export { server };
