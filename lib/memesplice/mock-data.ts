import type { Coin, Pair, Offspring, LineageNode, RecentBirth } from "./types";
import { popularCoins } from "../tokens/catalog";
const coinRows = [
  ["doge", "Doge", "DOGE", "$16.2B", "unstoppable optimism"],
  ["bonk", "Bonk", "BONK", "$1.1B", "underdog energy"],
  ["wif", "dogwifhat", "WIF", "$820M", "effortless style"],
  ["pepe", "Pepe", "PEPE", "$3.8B", "beautifully chaotic humor"],
  ["shib", "Shiba Inu", "SHIB", "$6.4B", "pack loyalty"],
  ["popcat", "Popcat", "POPCAT", "$340M", "boundless curiosity"],
  ["fartcoin", "Fartcoin", "FARTCOIN", "$710M", "unfiltered mischief"],
  ["goat", "Goatseus Maximus", "GOAT", "$92M", "cosmic wisdom"],
  ["moodeng", "Moo Deng", "MOODENG", "$120M", "tiny but mighty confidence"],
  ["pengu", "Pudgy Penguins", "PENGU", "$760M", "contagious friendliness"],
  ["chillguy", "Chill Guy", "CHILLGUY", "$48M", "unshakable calm"],
  ["mog", "Mog Coin", "MOG", "$280M", "main-character confidence"],
] as const;
export const coins: Coin[] = coinRows.map(([id, name, ticker, marketCap, trait], index) => ({ id, name, ticker, marketCap, trait, image: popularCoins.find(coin=>coin.ticker===ticker)?.image ?? { atlas: "parents", index }, contractAddress: `Demo${ticker}7mKp9xV3aB8nQ2sR6tW4yH1cE5fZ` }));
export const coinById = (id: string) => coins.find(c => c.id === id)!;
export const pairs: Pair[] = [
  { parentA: "bonk", parentB: "wif", category: "Popular" }, { parentA: "pepe", parentB: "shib", category: "Classic" },
  { parentA: "popcat", parentB: "fartcoin", category: "Trending" }, { parentA: "goat", parentB: "moodeng", category: "Chaotic" },
  { parentA: "pengu", parentB: "bonk", category: "Community favorite" }, { parentA: "chillguy", parentB: "mog", category: "Unbothered" },
];
function createPreparedExample(a: Coin, b: Coin, index=0): Offspring {
  const demo = a.id === "doge" && b.id === "pepe";
  const stemA = a.ticker.slice(0, 5), stemB = b.ticker.slice(0, 4);
  const names = demo ? ["DogePepe", "AstroDoge", "PepeInu"] : [`${stemA}${stemB}`.toLowerCase().replace(/^./, c => c.toUpperCase()), `Astro${a.name.split(" ")[0]}`, `${stemB}Nova`];
  const tickers = demo ? ["DOPE", "ASTRO", "PINU"] : [`${stemA.slice(0,3)}${stemB.slice(0,3)}`, `A${stemA}`, `${stemB}N`];
  const personalities = [["Mischievous", "Clever", "Magnetic"], ["Adventurous", "Loyal", "Fearless"], ["Chill", "Curious", "Unpredictable"]];
  const taglines = ["Two originals. One unexpectedly perfect mix.", "A familiar spirit with a whole new frontier.", "Calm face. Wildly different DNA."];
  const lores = [
    `${a.name}'s ${a.trait} meets ${b.name}'s ${b.trait}. The lab's most unlikely friendship became its most unforgettable personality.`,
    `Born with ${a.name}'s ${a.trait} and a spark of ${b.name}'s ${b.trait}, this explorer is always one orbit ahead of the pack.`,
    `${b.name}'s ${b.trait} takes the lead, with a little ${a.name} in the genes. Quietly weird, fiercely independent, and impossible to predict.`,
  ];
  const name=names[index];
  return {
    id: `${a.id}-${b.id}-${index}`, name, ticker: tickers[index].toUpperCase(),
    image: { atlas: "offspring", index: [1, 0, 2][index], hue: demo ? 0 : (Math.max(0, coins.indexOf(a)) + Math.max(0, coins.indexOf(b))) * 5 },
    tagline: taglines[index], lore: lores[index], personalityTraits: personalities[index],
    parentAInfluence: [48, 68, 28][index], parentBInfluence: [47, 27, 64][index], mutationInfluence: [5, 5, 8][index],
    generation: Math.max(a.generation ?? 0, b.generation ?? 0) + 1,
    recommended: index === 0, parents: [a, b], descendants: 0,
    inheritedTraits: [
      `${a.trait}, expressed as ${["social confidence", "fearless exploration", "quiet resilience"][index]}`,
      `${b.trait}, expressed as ${["quick-witted humor", "a rebellious streak", "independent thinking"][index]}`,
    ],
    status: "draft", launchedAt: null, interpretation: (["balanced", "parent-a", "parent-b"] as const)[index],
  };
}
export const exploreOffspring: Offspring[] = [
  ["Mogpengu", "MOGU", "pengu", "mog", 0, 1, 124], ["Goatbonk", "GOONK", "goat", "bonk", 1, 1, 88],
  ["Wifpepe", "WPEPE", "wif", "pepe", 2, 2, 56], ["Popcatinu", "PCINU", "popcat", "shib", 0, 1, 73],
  ["MooBonk", "MOBONK", "moodeng", "bonk", 1, 1, 21], ["Chillmog", "CMOG", "chillguy", "mog", 2, 2, 38],
].map(([name,ticker,a,b,image,generation,descendants], i) => {
  const parents: [Coin, Coin] = Number(generation) === 2 ? [
    { ...coinById(a as string), id: `gen1-${i}`, name: i===2 ? "Bonkwif" : "ChillInu", ticker: i===2 ? "BWIF" : "CINU", generation: 1 },
    coinById(b as string),
  ] : [coinById(a as string), coinById(b as string)];
  return {
  ...createPreparedExample(...parents,Number(image)), id: `explore-${i}`, name: String(name), ticker: String(ticker),
  generation: Number(generation), descendants: Number(descendants), image: { atlas: "parents", index: [9,7,3,5,8,11][i] },
  status: "official", launchedAt: `2026-09-${String(26-i).padStart(2,"0")}T12:00:00Z`,
  parents,
};});
export const lineageNodes: LineageNode[] = [
  { ...coinById("doge"), generation: 0, description: "The original optimist. An external parent token, not a Splice-created child.", parents: [], children: ["DogePepe"], descendants: 2, traits: ["Optimistic", "Loyal", "Playful"], launchedAt: null, status: "external" },
  { ...coinById("pepe"), generation: 0, description: "The internet's favorite agent of chaos. Its traits carry into a new Splice bloodline.", parents: [], children: ["DogePepe"], descendants: 2, traits: ["Mischievous", "Clever", "Expressive"], launchedAt: null, status: "external" },
  { id: "dope", name: "DogePepe", ticker: "DOPE", image: { atlas: "offspring", index: 1 }, generation: 1, description: "Doge's optimism meets Pepe's wit. This example shows how an official child can become a parent.", parents: ["Doge", "Pepe"], children: ["DogePepeCat"], descendants: 1, traits: ["Mischievous", "Clever", "Magnetic"], launchedAt: "2026-09-24T14:20:00Z", status: "official" },
  { ...coinById("popcat"), generation: 0, description: "An external parent joins DogePepe to bring a new dose of curiosity to the family.", parents: [], children: ["DogePepeCat"], descendants: 1, traits: ["Curious", "Expressive", "Spontaneous"], launchedAt: null, status: "external" },
  { id: "dpc", name: "DogePepeCat", ticker: "DPC", image: { atlas: "offspring", index: 2 }, generation: 2, description: "Two generations and three original memes. The inherited traits combine into an entirely new identity.", parents: ["DogePepe", "Popcat"], children: [], descendants: 0, traits: ["Curious", "Independent", "Quick-witted"], launchedAt: "2026-09-26T14:20:00Z", status: "official" },
];
export const recentBirths: RecentBirth[] = [{ id: "dpc", name: "DogePepeCat", parents: ["DogePepe", "Popcat"], timeLabel: "42 sec ago", launchedAt: "2026-09-26T14:20:00Z" }];
