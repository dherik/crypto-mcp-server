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
 *   4. **SAMPLING (via input_required)** — The server asks the client's
 *      LLM to generate text. Used in src/tools/get-ai-insight.ts. The
 *      server fetches live data, returns an `input_required` result with
 *      an embedded LLM request, and the client answers it and retries
 *      the call (Multi Round-Trip Requests).
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
 *
 * The server is built through a FACTORY (`createServer`) and served
 * with `serveStdio`, which owns the transport. This is the MCP
 * TypeScript SDK v2 shape, and it lets the server speak the stateless
 * `2026-07-28` protocol revision: every request is self-describing
 * (protocol version, client info, and capabilities travel in `_meta`),
 * there is no initialize handshake and no session. Older 2025-era
 * clients are still served from the same factory via the legacy
 * `initialize` handshake.
 */

import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

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

/**
 * Builds a fully-registered server instance.
 *
 * The factory shape is what allows stateless serving: a fresh instance
 * handles each connection (HTTP) or the single stdio connection, and
 * no state is shared between them.
 */
export function createServer() {
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

  return server;
}

const isMainModule =
  process.argv[1]?.endsWith("build/index.js") ||
  process.argv[1]?.endsWith("build\\index.js");

if (isMainModule) {
  const handle = serveStdio(createServer);
  console.error("Crypto MCP server running on stdio (protocol 2026-07-28)");

  process.on("SIGINT", () => {
    void handle.close();
  });
}
