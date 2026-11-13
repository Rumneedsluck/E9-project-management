// Serves the finished website (build/client) for E9 "fast mode". No extra packages needed.
// Every address that is not a real file gets index.html (the site is a single-page app).
//   node e9-serve.mjs            (port 3000)
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(new URL("./build/client", import.meta.url).pathname);
const PORT = Number(process.env.PORT ?? 3000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

const fileFor = (urlPath) => {
  const clean = normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const candidate = join(ROOT, clean);
  if (!candidate.startsWith(ROOT)) return null; // never leave the build folder
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return null;
};

createServer((request, response) => {
  try {
    const found = fileFor(request.url ?? "/");
    const file = found ?? join(ROOT, "index.html");
    const type = TYPES[extname(file).toLowerCase()] ?? "application/octet-stream";
    const hashed = found && /[\\/]assets[\\/]/.test(file); // file names with a hash never change
    response.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(400);
    response.end("Bad request");
  }
}).listen(PORT, "0.0.0.0", () => console.log(`E9 website on http://localhost:${PORT}`));
