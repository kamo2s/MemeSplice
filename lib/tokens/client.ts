import { z } from "zod";
import type { Coin } from "../memesplice/types";
import type { MemeSpliceToken, TokenSearchResponse } from "./types";
import { isSolanaAddress, safeImageUrl } from "./validation";
import { popularCoins,normalizeSearch } from "./catalog";
import { imagesForToken, mergeVerifiedToken, orderedImages } from "./image-sources";

const number = z.number().finite().nonnegative().nullable();
const responseSchema = z.object({
  tokens: z.array(z.object({ mintAddress: z.string().refine(isSolanaAddress), name: z.string(), ticker: z.string(), imageUrl: z.string().nullable(), imageSources: z.array(z.object({source:z.enum(["helius","dex","metadata"]),url:z.string(),displayUrl:z.string().optional()})).max(12).optional(), metadataUri:z.string().nullable().optional(), priceUsd: number, marketCapUsd: number, decimals: number })).max(8),
  warning: z.string().optional(),
});
const cooldowns=new Map<string,number>();
async function fetchResult(url:string,signal:AbortSignal):Promise<TokenSearchResponse>{
  if((cooldowns.get(url)??0)>Date.now())throw new Error("Too many searches. Please wait a moment and try again.");
  const response = await fetch(url, { signal });
  if(response.status===429){const seconds=Number(response.headers.get("Retry-After")||60);cooldowns.set(url,Date.now()+Math.max(1,seconds)*1000);}
  const data: unknown = await response.json();
  if (!response.ok) {
    const error = z.object({ error: z.object({ message: z.string() }) }).safeParse(data);
    throw new Error(error.success ? error.data.error.message : "Token search is unavailable. Please try again.");
  }
  const parsed = responseSchema.safeParse(data);
  if (!parsed.success) throw new Error("Token search returned incomplete data. Please try again.");
  return parsed.data;
}
export async function fetchTokens(query:string,signal:AbortSignal){return fetchResult(`/api/tokens/search?q=${encodeURIComponent(isSolanaAddress(query.trim())?query.trim():normalizeSearch(query))}`,signal);}
export async function fetchVerifiedToken(mint:string,signal:AbortSignal,discovery?:Coin){const result=await fetchResult(`/api/tokens/verify?mint=${encodeURIComponent(mint)}`,signal);if(!result.tokens[0] || result.tokens[0].mintAddress!==mint)throw new Error("Token not found.");return tokenToCoin(mergeVerifiedToken(result.tokens[0],discovery?.token));}
export function tokenToCoin(token: MemeSpliceToken): Coin {
  const catalog = popularCoins.find(coin=>coin.contractAddress===token.mintAddress)?.token;
  const imageSources = orderedImages(imagesForToken(token),catalog?.imageSources);
  const urls = imageSources.map(image => image.displayUrl && /^\/images\/tokens\/[a-z0-9.-]+$|^\/api\/tokens\/image\?/.test(image.displayUrl) ? image.displayUrl : safeImageUrl(image.url)!).filter(Boolean);
  const resolved = {...token,imageSources,imageUrl:imageSources[0]?.url??null};
  return {
    id: token.mintAddress, name: token.name, ticker: token.ticker, contractAddress: token.mintAddress,
    image: {atlas:"parents",index:0,url:urls[0]??null,urls},
    marketCap: token.marketCapUsd === null ? "" : `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(token.marketCapUsd)} MC`,
    trait: "meme energy", generation: 0, token:resolved,
  };
}
export function sameParent(a: Coin | null | undefined, b: Coin | null | undefined): boolean {
  return !!a && !!b && a.contractAddress === b.contractAddress;
}
