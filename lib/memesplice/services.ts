import {lineageNodes,exploreOffspring,recentBirths} from "./mock-data";
import type {Offspring} from "./types";
export const imageGenerationService = { getArtwork(offspring: Offspring) { return offspring.image; } };
// Public surfaces consume official records only. Draft editing and generation never write here.
export const lineageService = {
  getNodes: () => lineageNodes.filter(n => n.status === "external" || (n.status === "official" && n.launchedAt)),
  getExplore: () => exploreOffspring.filter(o => o.status === "official" && o.launchedAt),
  getRecentBirths: () => recentBirths.filter(b => lineageNodes.some(n => n.id === b.id && n.status === "official" && n.launchedAt)),
};
