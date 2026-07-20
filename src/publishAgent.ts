import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PublishPort, PressCard, ValidationIssue } from "./types.js";

/**
 * Step 4. Renders an approved card into the press feed. Idempotent: re-running
 * with the same sourceUrl updates in place rather than duplicating. Cards that
 * fail the gate never reach here — they go to parkForReview().
 */
export class PublishAgent implements PublishPort {
  constructor(private readonly outDir = "output") {}

  async publish(card: PressCard): Promise<{ feedPath: string; htmlPath: string }> {
    await mkdir(this.outDir, { recursive: true });
    const feedPath = `${this.outDir}/feed.json`;
    const feed = await loadFeed(feedPath);

    const idx = feed.findIndex((c) => c.sourceUrl === card.sourceUrl);
    if (idx === -1) feed.push(card);
    else feed[idx] = card; // idempotent upsert

    feed.sort((a, b) => b.date.localeCompare(a.date));
    await writeFile(feedPath, JSON.stringify(feed, null, 2));

    const htmlPath = `${this.outDir}/${slug(card.title)}.html`;
    await writeFile(htmlPath, renderCard(card));
    return { feedPath, htmlPath };
  }

  async parkForReview(card: PressCard, issues: ValidationIssue[]): Promise<string> {
    await mkdir(this.outDir, { recursive: true });
    const path = `${this.outDir}/needs-review.json`;
    const queue = await loadJson<Array<{ card: PressCard; issues: ValidationIssue[] }>>(path, []);
    queue.push({ card, issues });
    await writeFile(path, JSON.stringify(queue, null, 2));
    return path;
  }
}

async function loadFeed(path: string): Promise<PressCard[]> {
  return loadJson<PressCard[]>(path, []);
}

async function loadJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);
}

function renderCard(card: PressCard): string {
  const esc = (t: string) =>
    t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<article class="press-card" data-type="${esc(card.type)}">
  <span class="press-card__type">${esc(card.type)}</span>
  <time datetime="${esc(card.date)}">${esc(card.date)}</time>
  <h3 class="press-card__title">${esc(card.title)}</h3>
  <p class="press-card__summary">${esc(card.summary)}</p>
  <blockquote class="press-card__quote">${esc(card.pullQuote)}</blockquote>
  <a class="press-card__source" href="${esc(card.sourceUrl)}">${esc(card.outlet)} &rarr;</a>
</article>`;
}
