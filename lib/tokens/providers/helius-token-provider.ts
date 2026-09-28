import { z } from "zod";
import { TokenServiceError } from "../errors";
import type { MemeSpliceToken, TokenMetadataProvider } from "../types";
import { finiteNumber, safeImageUrl } from "../validation";
import { providerJson, type Fetcher } from "../server/http";
import { imageGatewayVariants, orderedImages } from "../image-sources";

const assetSchema = z.object({
  id: z.string(), interface: z.string(), burnt: z.boolean().optional(),
  content: z.object({
    json_uri: z.string().nullish(),
    metadata: z.object({ name: z.string().nullish(), symbol: z.string().nullish() }).nullish(),
    links: z.object({ image: z.string().nullish() }).nullish(),
    files: z.array(z.object({ uri: z.string().nullish(), cdn_uri: z.string().nullish(), mime: z.string().nullish() })).nullish(),
  }).nullish(),
  token_info: z.object({ symbol: z.string().nullish(), decimals: z.number().int().min(0).max(255).nullish(), price_info: z.object({ price_per_token: z.number().nullish(), currency: z.string().nullish() }).nullish() }).nullish(),
});
const envelope = z.object({ result: z.unknown().optional(), error: z.object({ code: z.number(), message: z.string().optional() }).optional() });

export class HeliusTokenProvider implements TokenMetadataProvider {
  constructor(private readonly apiKey: string, private readonly fetcher: Fetcher = fetch) {}
  async getToken(mintAddress: string): Promise<MemeSpliceToken | null> {
    const json = await providerJson(this.fetcher, `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(this.apiKey)}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "splice-token", method: "getAsset", params: { id: mintAddress, options: { showFungible: true } } }),
    });
    const parsed = envelope.safeParse(json);
    if (!parsed.success) throw new TokenServiceError("MALFORMED_RESPONSE", "The token provider returned an invalid response. Please try again.");
    if (parsed.data.error) {
      if (parsed.data.error.code === -32004) return null;
      if (parsed.data.error.code === -32029) throw new TokenServiceError("BUSY","Token verification is busy. Please try again shortly.",429,60);
      throw new TokenServiceError("PROVIDER_FAILURE", "Helius could not verify this token. Please try again shortly.");
    }
    if (parsed.data.result === null) return null;
    const result = assetSchema.safeParse(parsed.data.result);
    if (!result.success || result.data.id !== mintAddress) throw new TokenServiceError("MALFORMED_RESPONSE", "The token provider returned incomplete data. Please try again.");
    const asset = result.data;
    if (!["FungibleToken", "FungibleAsset"].includes(asset.interface) || asset.burnt) return null;
    const price = asset.token_info?.price_info;
    const imageFiles = asset.content?.files?.filter(file => file.mime?.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(file.uri ?? "")) ?? [];
    const imageSources = orderedImages([asset.content?.links?.image, ...imageFiles.map(file => file.uri), ...imageFiles.map(file => file.cdn_uri)].flatMap(value => imageGatewayVariants(value).map(url => ({source: "helius" as const,url}))));
    return {
      mintAddress,
      name: asset.content?.metadata?.name?.trim().slice(0, 100) || "Unnamed token",
      ticker: (asset.content?.metadata?.symbol || asset.token_info?.symbol)?.trim().replace(/^\$/, "").slice(0, 32) || "UNKNOWN",
      imageUrl: imageSources[0]?.url ?? null, imageSources,
      metadataUri: safeImageUrl(asset.content?.json_uri),
      priceUsd: price?.currency === "USDC" || price?.currency === "USD" ? finiteNumber(price.price_per_token) : null,
      marketCapUsd: null, decimals: asset.token_info?.decimals ?? null,
    };
  }
}
