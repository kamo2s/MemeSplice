import { authorizedImage, cachedTokenImage } from "@/lib/tokens/server/token-images";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const src = params.get("src") ?? "", sig = params.get("sig") ?? "";
  if (!authorizedImage(src,sig)) return new Response(null,{status:403,headers:{"Cache-Control":"no-store"}});
  try {
    const file = await cachedTokenImage(src);
    return new Response(new Uint8Array(file.bytes),{headers:{"Content-Type":file.mime,"Content-Length":String(file.bytes.length),"Cache-Control":"public, max-age=86400, s-maxage=86400","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox"}});
  } catch { return new Response(null,{status:502,headers:{"Cache-Control":"no-store"}}); }
}
