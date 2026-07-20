import { FetchPort, ExtractPort, ValidatePort, PublishPort, StepResult } from "./types.js";

export interface PipelineReport {
  url: string;
  published: boolean;
  trace: StepResult<unknown>[];
  outcome: string;
}

/**
 * Wires the four agents. Depends only on ports, so any agent can be replaced
 * without editing this file (Open/Closed + Dependency Inversion). The gate
 * between validate and publish is the "human owns the decision" seam.
 */
export class Orchestrator {
  constructor(
    private readonly fetcher: FetchPort,
    private readonly extractor: ExtractPort,
    private readonly validator: ValidatePort,
    private readonly publisher: PublishPort,
    private readonly log: (m: string) => void = () => {}
  ) {}

  async run(url: string): Promise<PipelineReport> {
    const trace: StepResult<unknown>[] = [];

    const article = await this.step(trace, "fetch", () => this.fetcher.fetch(url));

    // One retry on extract: JSON parsing is the flaky part, and it is idempotent.
    let card = await this.step(trace, "extract", () => this.extractor.extract(article), 1);

    const result = this.validator.validate(card, article);
    trace.push({
      ok: result.ok,
      step: "validate",
      durationMs: 0,
      value: result.issues,
    });

    // THE GATE. Nothing ships unless grounding + schema pass.
    if (!result.ok) {
      const path = await this.publisher.parkForReview(card, result.issues);
      this.log(`GATE: parked for human review -> ${path}`);
      return {
        url,
        published: false,
        trace,
        outcome: `blocked: ${result.issues.map((i) => `${i.field}:${i.message}`).join("; ")}`,
      };
    }

    const out = await this.step(trace, "publish", () => this.publisher.publish(card));
    return {
      url,
      published: true,
      trace,
      outcome: `published -> ${out.feedPath}, ${out.htmlPath}`,
    };
  }

  /** DRY step runner: timing, tracing, and bounded retry in one place. */
  private async step<T>(
    trace: StepResult<unknown>[],
    name: string,
    fn: () => Promise<T>,
    retries = 0
  ): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const t0 = Date.now();
      try {
        const value = await fn();
        trace.push({ ok: true, step: name, durationMs: Date.now() - t0, value });
        this.log(`${name}: ok (${Date.now() - t0}ms)`);
        return value;
      } catch (err) {
        lastErr = err;
        trace.push({
          ok: false,
          step: name,
          durationMs: Date.now() - t0,
          error: String(err),
        });
        this.log(`${name}: fail attempt ${attempt + 1} -> ${String(err)}`);
      }
    }
    throw lastErr;
  }
}
