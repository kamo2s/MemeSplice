import { z } from "zod";
import { TokenServiceError } from "../errors";
import type { TokenCandidate, TokenDiscoveryProvider } from "../types";
import { finiteNumber, isSolanaAddress, safeImageUrl } from "../validation";
import { providerJson, type Fetcher } from "../server/http";
import { imageGatewayVariants } from "../image-sources";

const pairSchema = z.object({
  chainId: z.string(), baseToken: z.object({ address: z.string(), name: z.string(), symbol: z.string() }),
  priceUsd: z.union([z.string(), z.number()]).nullish(), marketCap: z.number().nullish(),
  liquidity: z.object({ usd: z.number().nullish() }).nullish(),
  info: z.object({ imageUrl: z.string().nullish() }).nullish(),
});
type Pair = z.infer<typeof pairSchema>;
function parsePairs(value: unknown): Pair[] {
  if (!Array.isArray(value)) throw new TokenServiceError("MALFORMED_RESPONSE", "Token discovery returned an invalid response. Please try again.");
  const parsed = value.map(item => pairSchema.safeParse(item));
  if (parsed.length && parsed.every(item => !item.success)) throw new TokenServiceError("MALFORMED_RESPONSE", "Token discovery returned incomplete data. Please try again.");
  return parsed.flatMap(item => item.success && item.data.chainId === "solana" && isSolanaAddress(item.data.baseToken.address) ? [item.data] : []);
}
function candidate(pair: Pair): TokenCandidate {
  return { mintAddress: pair.baseToken.address, name: pair.baseToken.name.trim().slice(0, 100), ticker: pair.baseToken.symbol.trim().replace(/^\$/, "").slice(0, 32), imageUrl: safeImageUrl(pair.info?.imageUrl), imageSources: imageGatewayVariants(pair.info?.imageUrl).map(url => ({source:"dex",url})), priceUsd: finiteNumber(pair.priceUsd), marketCapUsd: finiteNumber(pair.marketCap) };
}
export class DexScreenerTokenProvider implements TokenDiscoveryProvider {
  constructor(private readonly fetcher: Fetcher = fetch) {}
  async search(query: string): Promise<TokenCandidate[]> {
    const json = await providerJson(this.fetcher, `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,{},8000,true);
    const envelope = z.object({ pairs: z.array(z.unknown()).nullable() }).safeParse(json);
    if (!envelope.success) throw new TokenServiceError("MALFORMED_RESPONSE", "Token discovery returned an invalid response. Please try again.");
    const q = query.toLowerCase();
    const score = (pair: Pair) => pair.baseToken.symbol.toLowerCase() === q ? 2 : pair.baseToken.name.toLowerCase() === q ? 1 : 0;
    const pairs = parsePairs(envelope.data.pairs ?? []).filter(pair => pair.baseToken.name.toLowerCase().includes(q) || pair.baseToken.symbol.toLowerCase().includes(q));
    pairs.sort((a, b) => score(b) - score(a) || (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const unique = new Map<string, TokenCandidate>();
    for (const pair of pairs) if (!unique.has(pair.baseToken.address)) unique.set(pair.baseToken.address, candidate(pair));
    return [...unique.values()].slice(0, 5);
  }
  async getMarketData(mintAddress: string): Promise<TokenCandidate | null> {
    const json = await providerJson(this.fetcher, `https://api.dexscreener.com/token-pairs/v1/solana/${mintAddress}`, {}, 3000,true);
    const pairs = parsePairs(json).filter(pair => pair.baseToken.address === mintAddress);
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    return pairs[0] ? candidate(pairs[0]) : null;
  }
}
