import type { MemeSpliceToken } from "../tokens/types";
export type Artwork = { atlas: "parents" | "offspring"; index: number; hue?: number; url?: string | null; urls?: string[] };
export type Coin = { id: string; name: string; ticker: string; image: Artwork; contractAddress: string; marketCap: string; trait: string; generation?: number; token?: MemeSpliceToken };
export type Pair = { parentA: string; parentB: string; category: string };
export type Offspring = {
  generationJobId?: string; createdAt?: string;
  id: string; name: string; ticker: string; image: Artwork; tagline: string; lore: string;
  personalityTraits: string[]; parentAInfluence: number; parentBInfluence: number;
  mutationInfluence: number; generation: number; recommended: boolean;
  parents: [Coin, Coin]; descendants: number; inheritedTraits: [string, string];
  status: "draft" | "official" | "launching" | "launched";
  launch?: {mint:string;signature:string;provider:string;network:string};
  interpretation: "balanced" | "parent-a" | "parent-b";
  launchedAt: string | null;
  source?: "instant" | "custom";
};
export type LineageNode = {
  id: string; name: string; ticker: string; image: Artwork; generation: number;
  description: string; parents: string[]; children: string[]; descendants: number;
  traits: string[]; launchedAt: string | null; status: "external" | "official";
};
export type RecentBirth = { id: string; name: string; parents: [string, string]; timeLabel: string; launchedAt: string };
