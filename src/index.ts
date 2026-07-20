import { FetchAgent } from "./fetchAgent.js";
import { ExtractAgent } from "./extractAgent.js";
import { ValidateAgent } from "./validateAgent.js";
import { PublishAgent } from "./publishAgent.js";
import { Orchestrator } from "./orchestrator.js";
import { MockLlmClient, AnthropicLlmClient, LlmClient } from "./llm.js";

/**
 * Composition root. The ONLY place that knows about concrete classes.
 * Flags:
 *   --break   force a hallucinated quote to prove the gate blocks it
 *   --live    use the real Anthropic client (needs ANTHROPIC_API_KEY)
 */
async function main() {
  const args = new Set(process.argv.slice(2));
  const breakMode = args.has("--break");
  const live = args.has("--live");

  const llm: LlmClient = live ? new AnthropicLlmClient() : new MockLlmClient(breakMode);

  const orchestrator = new Orchestrator(
    new FetchAgent(/* offline */ !live),
    new ExtractAgent(llm),
    new ValidateAgent(),
    new PublishAgent(),
    (m) => console.log(`  · ${m}`)
  );

  const url = "https://www.businessinsider.com/bosses-credit-human-employees-ai-2026-7";
  console.log(`\nRunning press pipeline for: ${url}${breakMode ? "  [BREAK MODE]" : ""}\n`);

  const report = await orchestrator.run(url);

  console.log(`\nResult: ${report.published ? "PUBLISHED ✅" : "BLOCKED 🚧"}`);
  console.log(`Outcome: ${report.outcome}\n`);
  process.exit(report.published ? 0 : 1);
}

main().catch((err) => {
  console.error("pipeline crashed:", err);
  process.exit(2);
});
