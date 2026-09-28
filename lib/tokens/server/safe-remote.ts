import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { safeImageUrl } from "../validation";

const blocked = new BlockList();
for (const [ip, bits] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) blocked.addSubnet(ip,bits,"ipv4");
const globalV6 = new BlockList(); globalV6.addSubnet("2000::",3,"ipv6");
blocked.addSubnet("2001::",23,"ipv6"); blocked.addSubnet("2001:db8::",32,"ipv6"); blocked.addSubnet("2002::",16,"ipv6"); blocked.addSubnet("3fff::",20,"ipv6");
export function isPublicAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address,"ipv4") : family === 6 && globalV6.check(address,"ipv6") && !blocked.check(address,"ipv6");
}

export type RemoteFile = { bytes: Buffer; mime: string; url: string };
// DNS is validated AND pinned to the connection, including every redirect. No ambient
// cookies, proxy variables, credentials, compressed responses or client headers pass through.
export async function safeRemoteFile(input: string, kind: "image" | "json", options: { timeoutMs?: number; maxBytes?: number } = {}): Promise<RemoteFile> {
  const signal = AbortSignal.timeout(options.timeoutMs ?? 7000);
  const maxBytes = options.maxBytes ?? (kind === "json" ? 256 * 1024 : 3 * 1024 * 1024);
  let current = input;
  for (let hop = 0; hop <= 2; hop++) {
    const normalized = safeImageUrl(current);
    if (!normalized || signal.aborted) throw new Error("Unavailable remote resource");
    const url = new URL(normalized);
    const addresses = await new Promise<LookupAddress[]>((resolve,reject) => {
      const abort = () => reject(new Error("Remote timeout"));
      signal.addEventListener("abort",abort,{once:true});
      lookup(url.hostname,{all:true,verbatim:true}).then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));
    });
    // All DNS answers must be public; prefer IPv4 for hosts without working IPv6 routes.
    if (!Array.isArray(addresses) || !addresses.length || addresses.some(a => !isPublicAddress(a.address))) throw new Error("Blocked remote destination");
    const pinned = addresses.find(a => a.family === 4) ?? addresses[0];
    const response = await new Promise<RemoteFile | { redirect: string }>((resolve,reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        agent: false, signal, family: pinned.family,
        lookup: (_host,_options,callback) => callback(null,pinned.address,pinned.family),
        headers: {Accept: kind === "json" ? "application/json" : "image/avif,image/webp,image/png,image/jpeg,image/gif", "Accept-Encoding":"identity", "User-Agent":"Splice-TokenArtwork/1.0"},
      }, response => {
        const status = response.statusCode ?? 0;
        if ([301,302,303,307,308].includes(status) && response.headers.location) {
          response.destroy(); resolve({redirect: new URL(response.headers.location,url).href}); return;
        }
        const mime = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
        const validMime = kind === "json" ? ["application/json","text/json","text/plain","application/octet-stream"].includes(mime) || mime.endsWith("+json") : ["image/png","image/jpeg","image/webp","image/gif","image/avif"].includes(mime);
        if (status !== 200 || !validMime || (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") || Number(response.headers["content-length"] ?? 0) > maxBytes) {
          response.destroy(); reject(new Error("Unsupported remote resource")); return;
        }
        const chunks: Buffer[] = []; let size = 0;
        response.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) { response.destroy(); reject(new Error("Remote resource too large")); } else chunks.push(chunk); });
        response.on("error", () => reject(new Error("Remote read failed")));
        response.on("end", () => {
          const bytes = Buffer.concat(chunks);
          const detected = kind === "image" ? ["image/png","image/jpeg","image/webp","image/gif","image/avif"].find(type=>matchesImageMime(bytes,type)) : mime;
          if (!bytes.length || !detected) { reject(new Error("Invalid image bytes")); return; }
          // Some native hosts label JPEG bytes as PNG. Only serve a supported image
          // after checking its signature, using the actual MIME, never upstream HTML/SVG.
          resolve({bytes,mime:detected,url:url.href});
        });
      });
      request.on("error", () => reject(new Error("Remote request failed")));
      request.end();
    });
    if ("redirect" in response) { current = response.redirect; continue; }
    return response;
  }
  throw new Error("Too many remote redirects");
}

export function matchesImageMime(bytes: Buffer, mime: string) {
  if (mime === "image/png") return bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/jpeg") return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/gif") return ["GIF87a","GIF89a"].includes(bytes.toString("ascii",0,6));
  if (mime === "image/webp") return bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
  if (mime === "image/avif") return bytes.toString("ascii",4,8) === "ftyp" && /avif|avis/.test(bytes.toString("ascii",8,32));
  return false;
}
