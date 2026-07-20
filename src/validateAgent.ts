import { ValidatePort, PressCard, Article, ValidationResult, ValidationIssue } from "./types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = new Set(["Quote", "Press Release", "Byline", "Citation"]);

/**
 * Step 3. The guardrail. Two jobs:
 *  1) schema sanity (required fields, enum, date, summary length)
 *  2) GROUNDING: the pull-quote must appear VERBATIM in the source, after
 *     Unicode/whitespace/quote normalization. This is the anti-hallucination
 *     check that stops a fabricated quote from being attributed to a real outlet.
 */
export class ValidateAgent implements ValidatePort {
  validate(card: PressCard, article: Article): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (!card.title) issues.push({ field: "title", message: "missing title" });
    if (!card.summary) issues.push({ field: "summary", message: "missing summary" });
    if (card.summary.length > 240)
      issues.push({ field: "summary", message: "summary exceeds 240 chars" });
    if (!ISO_DATE.test(card.date))
      issues.push({ field: "date", message: `date not ISO 8601: "${card.date}"` });
    if (!TYPES.has(card.type))
      issues.push({ field: "type", message: `invalid type: "${card.type}"` });

    if (!card.pullQuote) {
      issues.push({ field: "pullQuote", message: "missing pull quote" });
    } else if (!isGrounded(card.pullQuote, article.sourceText)) {
      issues.push({
        field: "grounding",
        message: "pull quote not found verbatim in source (possible hallucination)",
      });
    }

    return { ok: issues.length === 0, issues };
  }
}

/** Verbatim substring check that tolerates only cosmetic differences. */
export function isGrounded(quote: string, source: string): boolean {
  return normalize(source).includes(normalize(quote));
}

/**
 * The fix that mattered: normalize smart quotes, collapse whitespace, drop a
 * single trailing period, and lowercase — so real quotes stop getting
 * false-rejected while fabricated ones still fail.
 */
function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim() // trim FIRST, so trailing-punctuation strip below actually anchors
    .replace(/[.,;:!?]+$/, "")
    .toLowerCase();
}
