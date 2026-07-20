import { readFile } from "node:fs/promises";
import { FetchPort, Article } from "./types.js";

/**
 * Step 1. Retrieves the source article. Offline mode reads a fixture so the
 * pipeline is reproducible in CI; online mode fetches the live URL. One
 * responsibility: turn a URL into a normalized Article.
 */
export class FetchAgent implements FetchPort {
  constructor(
    private readonly offline = true,
    private readonly fixturePath = "fixtures/article.txt",
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async fetch(url: string): Promise<Article> {
    if (this.offline) {
      const sourceText = await readFile(this.fixturePath, "utf8");
      return {
        url,
        outlet: "Business Insider",
        sourceText,
        publishedAt: "2026-07-13",
      };
    }
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error(`fetch ${url} -> ${res.status}`);
    const html = await res.text();
    return { url, outlet: hostname(url), sourceText: stripHtml(html) };
  }
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
