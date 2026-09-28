const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Solana public keys are exactly 32 decoded bytes. Length/regex alone is insufficient.
// Do not require an on-curve key: valid token mints can be program-derived addresses.
export function isSolanaAddress(value: string): boolean {
  if (value.length < 32 || value.length > 44) return false;
  const bytes = [0];
  for (const character of value) {
    let carry = alphabet.indexOf(character);
    if (carry < 0) return false;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) { bytes.push(carry & 255); carry >>= 8; }
  }
  const leadingZeros = value.match(/^1*/)?.[0].length ?? 0;
  return leadingZeros + (bytes.length === 1 && bytes[0] === 0 ? 0 : bytes.length) === 32;
}

export function classifyQuery(input: string): { kind: "empty" | "text" | "mint" | "invalid"; query: string; message?: string } {
  const query = input.trim().replace(/^\$/, "");
  if (!query) return { kind: "empty", query };
  if (query.length > 100 || /[\x00-\x1f]/.test(query)) return { kind: "invalid", query, message: "Enter a token name, ticker, or valid Solana mint address." };
  if (isSolanaAddress(query)) return { kind: "mint", query };
  if ((query.length >= 28 && !/\s/.test(query)) || /^0x[\da-f]+$/i.test(query)) {
    return { kind: "invalid", query, message: "Invalid Solana mint address. Check the full address and try again." };
  }
  return { kind: "text", query };
}

export function safeImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  let normalized = value.trim();
  if (/^ipfs:\/\//i.test(normalized)) normalized = "https://ipfs.io/ipfs/" + normalized.replace(/^ipfs:\/\/(ipfs\/)?/i, "");
  if (/^(ar|arweave):\/\//i.test(normalized)) normalized = "https://arweave.net/" + normalized.replace(/^(ar|arweave):\/\//i, "");
  try {
    const url = new URL(normalized), host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.port || !host.includes(".") || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || /^[\d.]+$/.test(host) || host.includes(":")) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
export function finiteNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
