import { safeImageUrl } from "./validation";
import type { MemeSpliceToken } from "./types";

export type TokenImageSource = { source: "helius" | "dex" | "metadata"; url: string; displayUrl?: string };
const priority = { helius: 0, dex: 1, metadata: 2 };

// Keep native URLs as provenance/reference inputs; displayUrl is only the delivery path.
export function orderedImages(...groups: (TokenImageSource[] | undefined)[]): TokenImageSource[] {
  const seen = new Map<string,TokenImageSource>();
  for (const image of groups.flatMap(group => group ?? []).sort((a,b) => priority[a.source] - priority[b.source])) {
    const url = safeImageUrl(image.url);
    if (!url) continue;
    const existing=seen.get(url);
    if (existing) { if(image.displayUrl?.startsWith("/images/tokens/"))existing.displayUrl=image.displayUrl; continue; }
    seen.set(url,{...image,url});
  }
  return [...seen.values()].slice(0,12);
}

export function imagesForToken(token: MemeSpliceToken, legacySource: TokenImageSource["source"] = "dex") {
  return orderedImages(token.imageSources, token.imageUrl && !token.imageSources?.length ? [{ source: legacySource, url: token.imageUrl }] : []);
}

export function mergeVerifiedToken(verified: MemeSpliceToken, discovery?: MemeSpliceToken): MemeSpliceToken {
  const existing = discovery?.mintAddress === verified.mintAddress ? discovery : undefined;
  const imageSources = orderedImages(imagesForToken(verified, "helius"), existing ? imagesForToken(existing) : []);
  return { ...verified, imageSources, imageUrl: imageSources[0]?.url ?? null };
}

export function imageGatewayVariants(value: unknown): string[] {
  const primary = safeImageUrl(value);
  if (!primary) return [];
  const url = new URL(primary);
  const subdomain = url.hostname.match(/^([a-z0-9]+)\.ipfs\./i);
  const match = subdomain ? ["",subdomain[1],url.pathname === "/" ? "" : url.pathname] : url.pathname.match(/^\/ipfs\/([^/]+)(\/.*)?$/);
  if (!match) return [primary];
  const suffix = `/ipfs/${match[1]}${match[2] ?? ""}${url.search}`;
  return [...new Set([primary, `https://ipfs.io${suffix}`, `https://dweb.link${suffix}`])];
}

export function metadataImages(json: unknown, base: string): TokenImageSource[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  const data = json as Record<string, unknown>;
  const properties = data.properties as { files?: { uri?: string; type?: string }[] } | undefined;
  const values = [data.image, data.image_url, ...(Array.isArray(properties?.files) ? properties.files.filter(f => f && typeof f === "object" && typeof f.type === "string" && f.type.startsWith("image/")).map(f => f.uri) : [])];
  return orderedImages(values.flatMap(value => {
    if (typeof value !== "string") return [];
    let resolved = value;
    try { if (!/^[a-z][a-z\d+.-]*:/i.test(value)) resolved = new URL(value, base).href; } catch { return []; }
    return imageGatewayVariants(resolved).map(url => ({source: "metadata" as const, url}));
  }));
}
