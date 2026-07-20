// Domain types + agent "ports". The orchestrator depends on these interfaces,
// never on concrete agents or the LLM SDK (Dependency Inversion).

export type PressType = "Quote" | "Press Release" | "Byline" | "Citation";

/** Raw source fetched by step 1, handed to the extract agent. */
export interface Article {
  url: string;
  outlet: string;
  /** Full article text used later for the grounding (anti-hallucination) check. */
  sourceText: string;
  publishedAt?: string; // ISO date if the source exposes one
}

/** Structured card the site's press feed renders. Produced by step 2. */
export interface PressCard {
  title: string;
  outlet: string;
  date: string; // ISO 8601 (YYYY-MM-DD)
  type: PressType;
  summary: string; // <= 240 chars, our own words
  pullQuote: string; // MUST be verbatim from Article.sourceText
  sourceUrl: string;
}

export interface ValidationIssue {
  field: keyof PressCard | "grounding";
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

/** Uniform envelope so every step reports success/failure the same way (DRY). */
export interface StepResult<T> {
  ok: boolean;
  step: string;
  durationMs: number;
  value?: T;
  error?: string;
}

// --- Ports (interfaces) — one responsibility each (SRP + ISP) ---

export interface FetchPort {
  fetch(url: string): Promise<Article>;
}

export interface ExtractPort {
  extract(article: Article): Promise<PressCard>;
}

export interface ValidatePort {
  validate(card: PressCard, article: Article): ValidationResult;
}

export interface PublishPort {
  publish(card: PressCard): Promise<{ feedPath: string; htmlPath: string }>;
  /** Failing cards are parked here for a human instead of going live. */
  parkForReview(card: PressCard, issues: ValidationIssue[]): Promise<string>;
}
