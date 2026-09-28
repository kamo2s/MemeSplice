export type MemeSpliceToken = {
  mintAddress: string;
  name: string;
  ticker: string;
  imageUrl: string | null;
  imageSources?: import("./image-sources").TokenImageSource[];
  metadataUri?: string | null;
  priceUsd: number | null;
  marketCapUsd: number | null;
  decimals: number | null;
};

export type TokenSearchResponse = { tokens: MemeSpliceToken[]; warning?: string };
export interface TokenMetadataProvider {
  getToken(mintAddress: string): Promise<MemeSpliceToken | null>;
}
export type TokenCandidate = Omit<MemeSpliceToken, "decimals">;
export interface TokenDiscoveryProvider {
  search(query: string): Promise<TokenCandidate[]>;
  getMarketData(mintAddress: string): Promise<TokenCandidate | null>;
}
