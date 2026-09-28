import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { MemeSpliceToken } from "../types";
import { imageGatewayVariants, imagesForToken, metadataImages, orderedImages } from "../image-sources";
import { safeImageUrl } from "../validation";
import { AsyncCache } from "./cache";
import { safeRemoteFile, type RemoteFile } from "./safe-remote";

const runtime = globalThis as typeof globalThis & { __spliceImageKey?: string };
const fallbackKey = runtime.__spliceImageKey ??= randomBytes(32).toString("hex");
function signature(url: string) {
  const key = process.env.TOKEN_IMAGE_SIGNING_SECRET || process.env.SESSION_SECRET || process.env.HELIUS_API_KEY || fallbackKey;
  return createHmac("sha256",key).update("splice-token-image-v1\n" + url).digest("hex");
}
export function imageProxyUrl(url: string) { return `/api/tokens/image?src=${encodeURIComponent(url)}&sig=${signature(url)}`; }
export function authorizedImage(src: string, sig: string) {
  if (safeImageUrl(src) !== src || !/^[a-f0-9]{64}$/.test(sig)) return false;
  return timingSafeEqual(Buffer.from(signature(src),"hex"),Buffer.from(sig,"hex"));
}
// Only provider/catalog URLs get signed. There is no public endpoint to sign a URL.
export function withImageDelivery(token: MemeSpliceToken): MemeSpliceToken {
  const imageSources = imagesForToken(token).map(image => ({...image,displayUrl: image.displayUrl?.startsWith("/images/tokens/") ? image.displayUrl : imageProxyUrl(image.url)}));
  return {...token,imageSources,imageUrl:imageSources[0]?.url ?? null};
}

const metadataCache = new AsyncCache<ReturnType<typeof metadataImages>>(86400000,500);
export async function resolveTokenMetadata(token: MemeSpliceToken): Promise<MemeSpliceToken> {
  let resolved: ReturnType<typeof metadataImages> = [];
  if (token.metadataUri) {
    try {
      resolved = await metadataCache.get(token.metadataUri!,async () => {
        for (const uri of imageGatewayVariants(token.metadataUri)) {
          try { const file = await safeRemoteFile(uri,"json",{timeoutMs:4000}); return metadataImages(JSON.parse(file.bytes.toString("utf8")),file.url); } catch { /* try another gateway */ }
        }
        throw new Error("Metadata unavailable");
      });
    } catch { /* Missing artwork must never make a verified token unselectable. */ }
  }
  const imageSources = orderedImages(imagesForToken(token,"helius"),resolved);
  return {...token,imageSources,imageUrl:imageSources[0]?.url ?? null};
}

// Bounded process cache plus public browser/CDN caching; failures only suppress storms
// briefly and never overwrite an alternative source. One download per URL at a time.
const images = new Map<string,{file:RemoteFile;expires:number}>();
const pending = new Map<string,Promise<RemoteFile>>();
const failures = new Map<string,number>();
export const hasUsableNativeArtwork=(token:MemeSpliceToken)=>imagesForToken(token).some(image=>(failures.get(image.url)??0)<=Date.now());
let bytesCached = 0;
export async function cachedTokenImage(url: string): Promise<RemoteFile> {
  const hit = images.get(url);
  if (hit && hit.expires > Date.now()) return hit.file;
  if (hit) { bytesCached -= hit.file.bytes.length; images.delete(url); }
  if ((failures.get(url) ?? 0) > Date.now()) throw new Error("Image temporarily unavailable");
  if (pending.has(url)) return pending.get(url)!;
  if (pending.size >= 12) throw new Error("Image service busy");
  const request = safeRemoteFile(url,"image").then(file => {
    while (images.size >= 200 || bytesCached + file.bytes.length > 32 * 1024 * 1024) {
      const first = images.keys().next().value!;
      bytesCached -= images.get(first)!.file.bytes.length; images.delete(first);
    }
    images.set(url,{file,expires:Date.now()+86400000}); bytesCached += file.bytes.length; failures.delete(url); return file;
  }).catch(error => {
    if (failures.size >= 500) failures.delete(failures.keys().next().value!);
    failures.set(url,Date.now()+30000); throw error;
  }).finally(()=>pending.delete(url));
  pending.set(url,request); return request;
}
