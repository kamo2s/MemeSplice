import "server-only";
import { TokenServiceError } from "../errors";
import { HeliusTokenProvider } from "../providers/helius-token-provider";
import { DexScreenerTokenProvider } from "../providers/dexscreener-token-provider";
import { TokenSearchService } from "./token-search-service";
import { SharedTokenCache,discoveryPermit,withProviderCooldown } from "./shared-cache";
import { resolveTokenMetadata, withImageDelivery,hasUsableNativeArtwork } from "./token-images";
const metadata={getToken:async(mint:string)=>{
  const key=process.env.HELIUS_API_KEY?.trim();
  if(!key)throw new TokenServiceError("NOT_CONFIGURED","Token verification is not configured yet. Try an Instant Splice.",503);
  const token = await withProviderCooldown("helius",()=>new HeliusTokenProvider(key).getToken(mint));
  return token ? resolveTokenMetadata(token) : null;
}};
const dex=new DexScreenerTokenProvider();
const discovery={search:(query:string)=>withProviderCooldown("dexscreener",()=>dex.search(query)),getMarketData:(mint:string)=>withProviderCooldown("dexscreener",()=>dex.getMarketData(mint))};
const service=new TokenSearchService(metadata,discovery,new SharedTokenCache(),discoveryPermit,hasUsableNativeArtwork);
export const searchTokens=async(query:string,identity?:string)=>{const result=await service.searchWithArtwork(query,identity);return {...result,tokens:result.tokens.map(withImageDelivery)};};
export const verifyToken=async(mint:string,identity?:string)=>withImageDelivery(await service.verify(mint,identity));

