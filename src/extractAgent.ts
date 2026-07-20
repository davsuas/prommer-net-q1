import { ExtractPort, Article, PressCard, PressType } from "./types.js";
import { LlmClient } from "./llm.js";

const SYSTEM = [
  "You extract a press card from an article for prommer.net's press feed.",
  "Return ONLY minified JSON with keys:",
  "title, outlet, date (YYYY-MM-DD), type (Quote|Press Release|Byline|Citation),",
  "summary (<=240 chars, your own words), pullQuote (VERBATIM from the article),",
  "sourceUrl. No prose, no markdown fences.",
].join(" ");

/**
 * Step 2. Wraps the LLM behind the ExtractPort. Its only job is
 * article -> PressCard. It does NOT decide whether the card is safe to ship;
 * that is step 3's responsibility (separation of concerns).
 */
export class ExtractAgent implements ExtractPort {
  constructor(private readonly llm: LlmClient) {}

  async extract(article: Article): Promise<PressCard> {
    const user = [
      `OUTLET: ${article.outlet}`,
      `URL: ${article.url}`,
      "ARTICLE:",
      article.sourceText,
    ].join("\n");

    const raw = await this.llm.complete(SYSTEM, user);
    const parsed = safeParse(raw);

    return {
      title: str(parsed.title),
      outlet: str(parsed.outlet, article.outlet),
      date: str(parsed.date),
      type: asType(parsed.type),
      summary: str(parsed.summary),
      pullQuote: str(parsed.pullQuote),
      sourceUrl: str(parsed.sourceUrl, article.url),
    };
  }
}

function safeParse(raw: string): Record<string, unknown> {
  // Models sometimes wrap JSON in prose or fences; recover the object span.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("extract: no JSON in output");
  return JSON.parse(raw.slice(start, end + 1));
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

function asType(v: unknown): PressType {
  const allowed: PressType[] = ["Quote", "Press Release", "Byline", "Citation"];
  return allowed.includes(v as PressType) ? (v as PressType) : "Citation";
}
