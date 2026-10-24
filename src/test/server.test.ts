/**
 * Integration tests: drive the real server through a real Client over
 * InMemoryTransport. These cover the SDK v2 registration surface offline
 * (no CoinGecko API calls) — listing all primitives and template
 * completion. Live API behavior is exercised manually via the Inspector.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createServer } from "../index.js";

async function connect() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const server = createServer();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return { client, server };
}

describe("server registration (over InMemoryTransport)", () => {
  it("lists all six tools with input schemas", async () => {
    const { client } = await connect();
    const { tools } = await client.listTools();

    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      "compare_coins",
      "get_ai_insight",
      "get_coin_history",
      "get_crypto_price",
      "get_market_overview",
      "get_top_coins",
    ]);

    for (const tool of tools) {
      assert.ok(
        tool.inputSchema &&
          Object.keys(tool.inputSchema).length > 0,
        `tool ${tool.name} should have a non-empty input schema`
      );
      assert.ok(tool.description, `tool ${tool.name} should have a description`);
    }
  });

  it("lists both prompts with argument schemas", async () => {
    const { client } = await connect();
    const { prompts } = await client.listPrompts();

    const names = prompts.map((p) => p.name).sort();
    assert.deepEqual(names, ["analyze-coin", "compare-report"]);

    for (const prompt of prompts) {
      assert.ok(
        prompt.arguments && prompt.arguments.length > 0,
        `prompt ${prompt.name} should declare arguments`
      );
    }
  });

  it("lists the static resource and the URI template", async () => {
    const { client } = await connect();

    // The coin-profile template's list callback expands live CoinGecko
    // data into concrete resources; only the static resource is stable
    // offline, so assert inclusion rather than exact equality.
    const { resources } = await client.listResources();
    assert.ok(
      resources.some((r) => r.uri === "crypto://market-overview"),
      "static market-overview resource should be listed"
    );
    for (const resource of resources) {
      assert.match(
        resource.uri,
        /^crypto:\/\/(market-overview|coins\/[^/]+\/profile)$/,
        `unexpected resource URI: ${resource.uri}`
      );
    }

    const { resourceTemplates } = await client.listResourceTemplates();
    assert.deepEqual(
      resourceTemplates.map((t) => t.uriTemplate).sort(),
      ["crypto://coins/{coinId}/profile"]
    );
  });

  it("completes the coinId template variable offline", async () => {
    const { client } = await connect();
    const result = await client.complete({
      ref: { type: "ref/resource", uri: "crypto://coins/{coinId}/profile" },
      argument: { name: "coinId", value: "bit" },
    });

    const values = result.completion.values;
    assert.ok(values.includes("bitcoin"), `expected 'bitcoin' in ${JSON.stringify(values)}`);
    for (const value of values) {
      assert.ok(value.startsWith("bit"), `completion ${value} should match prefix 'bit'`);
    }
  });
});
