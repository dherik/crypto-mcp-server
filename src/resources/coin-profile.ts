/**
 * Resource: crypto://coins/{coinId}/profile (dynamic / URI template)
 *
 * ─── MCP CONCEPT: DYNAMIC RESOURCES WITH URI TEMPLATES ───
 *
 * This is the more advanced form of MCP resources. Instead of a fixed URI,
 * we register a **URI template** with a variable: `crypto://coins/{coinId}/profile`.
 *
 * The three callbacks:
 *
 *   1. **list** — Called when the AI asks "what resources are available?"
 *      We return the top 10 coins as concrete resource entries so the AI
 *      can discover and browse them without knowing coin IDs upfront.
 *
 *   2. **read** — Called when the AI reads a specific URI, e.g.
 *      `crypto://coins/bitcoin/profile`. The `{coinId}` variable is
 *      extracted from the URI and passed as `variables.coinId`.
 *
 *   3. **complete** — Provides autocomplete for the `{coinId}` variable.
 *      When the AI or user starts typing a coin ID, the client can ask
 *      the server for suggestions. We return popular coins.
 *
 * The ResourceTemplate class from the SDK handles URI parsing and
 * variable extraction. You just provide the callbacks.
 */

import { ResourceTemplate } from "@modelcontextprotocol/server";
import type { McpServer } from "@modelcontextprotocol/server";
import { geckoFetch, sanitizeCoinId } from "../api/coingecko.js";
import { formatUSD, formatPercent, formatLargeNumber } from "../formatting.js";

const POPULAR_COINS = [
  "bitcoin",
  "ethereum",
  "tether",
  "solana",
  "binancecoin",
  "ripple",
  "usd-coin",
  "cardano",
  "dogecoin",
  "tron",
  "polkadot",
  "avalanche-2",
  "chainlink",
  "litecoin",
  "near",
];

export function register(server: McpServer) {
  server.registerResource(
    "coin-profile",
    new ResourceTemplate("crypto://coins/{coinId}/profile", {
      list: async () => {
        const data = (await geckoFetch(
          `/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1`
        )) as Array<{ id: string; name: string; symbol: string }>;

        return {
          resources: data.map((coin) => ({
            uri: `crypto://coins/${coin.id}/profile`,
            name: `${coin.name} (${coin.symbol.toUpperCase()}) Profile`,
            mimeType: "text/plain",
          })),
        };
      },
      complete: {
        coinId: async (value: string) => {
          return POPULAR_COINS.filter((c) => c.startsWith(value.toLowerCase()));
        },
      },
    }),
    {
      title: "Coin Profile",
      description:
        "Detailed profile for any cryptocurrency: price, market cap, description, and links. Uses URI template with coinId variable.",
    },
    async (uri, variables) => {
      const coinId = variables.coinId as string;
      const safeId = sanitizeCoinId(coinId);

      const coin = (await geckoFetch(`/coins/${safeId}`)) as {
        name: string;
        symbol: string;
        market_cap_rank: number;
        market_data: {
          current_price: { usd: number };
          market_cap: { usd: number };
          total_volume: { usd: number };
          price_change_percentage_24h: number;
          ath: { usd: number };
          circulating_supply: number;
        };
        description: { en: string };
        links: {
          homepage: string[];
          blockchain_site: string[];
          subreddit_url: string;
        };
        categories: string[];
      };

      const md = coin.market_data;
      const desc = coin.description.en
        .replace(/<[^>]*>/g, "")
        .trim()
        .slice(0, 500);

      const text = [
        `# ${coin.name} (${coin.symbol.toUpperCase()})`,
        "",
        `Rank: #${coin.market_cap_rank}`,
        `Price: ${formatUSD(md.current_price.usd)}`,
        `24h Change: ${formatPercent(md.price_change_percentage_24h)}`,
        `Market Cap: ${formatLargeNumber(md.market_cap.usd)}`,
        `24h Volume: ${formatLargeNumber(md.total_volume.usd)}`,
        `Circulating Supply: ${md.circulating_supply?.toLocaleString() ?? "N/A"} ${coin.symbol.toUpperCase()}`,
        `All-Time High: ${formatUSD(md.ath.usd)}`,
        "",
        `Categories: ${coin.categories?.slice(0, 5).join(", ") || "N/A"}`,
        "",
        "## Description",
        desc || "No description available.",
        "",
        "## Links",
        coin.links.homepage
          .filter(Boolean)
          .map((l: string) => `- ${l}`)
          .join("\n"),
        coin.links.blockchain_site
          .filter(Boolean)
          .slice(0, 3)
          .map((l: string) => `- ${l}`)
          .join("\n"),
      ].join("\n");

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text,
          },
        ],
      };
    }
  );
}
