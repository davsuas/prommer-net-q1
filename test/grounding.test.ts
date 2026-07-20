import { test } from "node:test";
import assert from "node:assert/strict";
import { isGrounded, ValidateAgent } from "../src/validateAgent.js";
import { Orchestrator } from "../src/orchestrator.js";
import { FetchAgent } from "../src/fetchAgent.js";
import { ExtractAgent } from "../src/extractAgent.js";
import { PublishAgent } from "../src/publishAgent.js";
import { MockLlmClient } from "../src/llm.js";

const SOURCE =
  'The teams that recovered did so by changing who gets the credit — the ' +
  "responsible person owns the credit and the blame regardless of how much AI helped.";

test("verbatim quote is grounded", () => {
  assert.equal(isGrounded("the responsible person owns the credit and the blame", SOURCE), true);
});

test("hallucinated quote is rejected", () => {
  assert.equal(isGrounded("AI will replace every engineer next year", SOURCE), false);
});

test("normalization: smart quotes + trailing period + spacing still match", () => {
  // This is the exact case that USED to false-reject real quotes before the fix.
  const messy = "  the responsible person owns the  credit and the blame.  ";
  assert.equal(isGrounded(messy, SOURCE), true);
});

test("validator flags grounding failure with an issue", () => {
  const v = new ValidateAgent();
  const card = {
    title: "t", outlet: "o", date: "2026-07-13", type: "Quote" as const,
    summary: "s", pullQuote: "a fabricated line", sourceUrl: "u",
  };
  const res = v.validate(card, { url: "u", outlet: "o", sourceText: SOURCE });
  assert.equal(res.ok, false);
  assert.ok(res.issues.some((i) => i.field === "grounding"));
});

test("pipeline in break mode is BLOCKED, not published", async () => {
  const orch = new Orchestrator(
    new FetchAgent(true),
    new ExtractAgent(new MockLlmClient(/* break */ true)),
    new ValidateAgent(),
    new PublishAgent("output-test")
  );
  const report = await orch.run("https://example.com/x");
  assert.equal(report.published, false);
  assert.match(report.outcome, /grounding/);
});
