import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out");
const port = Number(process.env.PORT || 5173);
if (!existsSync(path.join(root, "index.html"))) throw new Error("Build the website first with npm run build.");
const types = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json", ".png":"image/png", ".svg":"image/svg+xml", ".woff2":"font/woff2", ".ttf":"font/ttf", ".txt":"text/plain; charset=utf-8", ".ico":"image/x-icon" };
http.createServer((req,res)=>{
  try {
    const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    let file=path.resolve(root,"."+pathname);
    if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403);return res.end("Forbidden");}
    if(existsSync(file)&&statSync(file).isDirectory())file=path.join(file,"index.html");
    if(!existsSync(file)){res.writeHead(404);return res.end("Not found");}
    res.writeHead(200,{"Content-Type":types[path.extname(file)]||"application/octet-stream","Cache-Control":"no-cache"});
    createReadStream(file).pipe(res);
  }catch{res.writeHead(400);res.end("Bad request");}
}).listen(port,"127.0.0.1",()=>console.log(`Splice is ready at http://localhost:${port}/`));
