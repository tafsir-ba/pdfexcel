import { readFile } from "node:fs/promises";
import path from "node:path";

/** Serve llms.txt as plain text for LLM / search crawlers. */
export async function GET() {
  const filePath = path.join(process.cwd(), "public", "llms.txt");
  const body = await readFile(filePath, "utf8");
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
