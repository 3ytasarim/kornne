import { createReadStream, statSync } from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import { Readable } from "node:stream";

/**
 * Fallback for legacy /upload/<name> URLs that the static file server cannot resolve (e.g. a raw "&" in
 * "robotıc systems & (600 x 160 piksel).png"). Serves ONLY existing files from the media directory:
 * no directory traversal, no listing, real 404 for files that never existed / were broken at the source.
 * MEDIA_DIR defaults to public/upload (dev); production points it at the persistent media directory.
 */
const ROOT = resolve(process.env.MEDIA_DIR ?? join(process.cwd(), "public", "upload"));
const TYPES: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".pdf": "application/pdf" };

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/upload/[...path]">) {
  const { path } = await ctx.params;
  let name: string;
  try {
    name = path.map((p) => decodeURIComponent(p)).join("/");
  } catch {
    return new Response("Not found", { status: 404 });
  }
  // flat directory: a single file name, no separators, no dot segments
  if (!name || name.includes("/") || name.includes("\\") || name !== basename(name) || name.startsWith(".")) return new Response("Not found", { status: 404 });
  const file = resolve(ROOT, name);
  if (!file.startsWith(ROOT + sep)) return new Response("Not found", { status: 404 });
  const type = TYPES[extname(file).toLowerCase()];
  if (!type) return new Response("Not found", { status: 404 });
  let size: number;
  try {
    const st = statSync(file);
    if (!st.isFile()) return new Response("Not found", { status: 404 });
    size = st.size;
  } catch {
    return new Response("Not found", { status: 404 });
  }
  const headers: Record<string, string> = { "Content-Type": type, "Content-Length": String(size), "Cache-Control": "public, max-age=2592000", "X-Content-Type-Options": "nosniff" };
  if (process.env.SITE_INDEXABLE !== "true") headers["X-Robots-Tag"] = "noindex, noimageindex";
  if (type === "image/svg+xml") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'";
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers });
}
