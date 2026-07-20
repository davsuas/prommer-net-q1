// The one dependency-inversion seam that matters: agents talk to `LlmClient`,
// not to a vendor SDK. Swap Mock <-> Anthropic without touching agent code.

export interface LlmClient {
  complete(system: string, user: string): Promise<string>;
}

/**
 * Deterministic, network-free client so the whole pipeline runs in CI / offline.
 * `breakMode` forces a hallucinated pull-quote to demonstrate that the
 * grounding gate (step 3) catches it before anything is published.
 */
export class MockLlmClient implements LlmClient {
  constructor(private readonly breakMode = false) {}

  async complete(_system: string, user: string): Promise<string> {
    // The user prompt embeds the article text; we echo a card built from it.
    const outletMatch = user.match(/OUTLET:\s*(.+)/);
    const urlMatch = user.match(/URL:\s*(.+)/);
    const outlet = outletMatch?.[1].trim() ?? "Unknown";
    const sourceUrl = urlMatch?.[1].trim() ?? "";

    // A quote that IS verbatim in the fixture (see fixtures/article.txt).
    const groundedQuote =
      "the responsible person owns the credit and the blame";
    // A plausible-sounding quote that is NOT in the source — the failure case.
    const hallucinatedQuote =
      "AI will replace every senior engineer by the end of next year";

    const card = {
      title: "Crediting outcomes over tools keeps engineers reaching for AI",
      outlet,
      date: "2026-07-13",
      type: "Quote",
      summary:
        "Prommer argues that footnoting work as AI-assisted quietly kills initiative; crediting the accountable owner for the outcome fixes it.",
      pullQuote: this.breakMode ? hallucinatedQuote : groundedQuote,
      sourceUrl,
    };
    return JSON.stringify(card);
  }
}

/**
 * Production client. Correct shape for the Anthropic Messages API; unused in the
 * offline demo but proves the seam is real. Reads the key from the environment.
 */
export class AnthropicLlmClient implements LlmClient {
  constructor(
    private readonly apiKey = process.env.ANTHROPIC_API_KEY ?? "",
    private readonly model = "claude-sonnet-4-6",
    private readonly fetchFn: typeof fetch = fetch
  ) {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  }

  async complete(system: string, user: string): Promise<string> {
    const res = await this.fetchFn("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as { content: Array<{ text?: string }> };
    return data.content.map((b) => b.text ?? "").join("");
  }
}
