/**
 * The tech news, straight from the publishers.
 *
 * RSS rather than a search API on purpose: these are the real, current headlines
 * in the publisher's own order, they cost nothing, and there is no key to leak.
 * The feed list is a constant here and is never taken from the model - Mey has no
 * parameter anywhere that lets him be pointed at an arbitrary URL.
 */

export type Headline = { title: string; url: string; source: string; published?: string };

const FEEDS: Array<{ source: string; url: string }> = [
  { source: "Hacker News", url: "https://hnrss.org/frontpage" },
  { source: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { source: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
];

const TIMEOUT_MS = 8_000;
const TTL_MS = 5 * 60 * 1000;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&nbsp;": " ",
};

function decode(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (block: string, name: string): string => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : "";
};

/** RSS puts the URL in <link>text</link>; Atom puts it in <link href="…"/>. */
function linkOf(block: string): string {
  const href = block.match(/<link[^>]*href=["']([^"']+)["']/i);
  if (href) return href[1];
  const text = tag(block, "link");
  return /^https?:/i.test(text) ? text : "";
}

/** Every headline in one feed document. Anything unparseable yields nothing. */
export function parseFeed(xml: string, source: string): Headline[] {
  if (!xml) return [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  const items: Headline[] = [];
  for (const block of blocks) {
    const title = tag(block, "title");
    const url = linkOf(block);
    if (!title || !url) continue;
    const published = tag(block, "pubDate") || tag(block, "updated") || tag(block, "published") || undefined;
    items.push({ title, url, source, published });
  }
  return items;
}

const at = (h: Headline): number => {
  const t = h.published ? Date.parse(h.published) : NaN;
  return Number.isNaN(t) ? 0 : t;                     // undated sinks to the bottom
};

/** Several feeds into one run, newest first. */
export function mergeHeadlines(lists: Headline[][], limit = 8): Headline[] {
  return lists.flat().sort((a, b) => at(b) - at(a)).slice(0, limit);
}

let cache: { at: number; items: Headline[]; failed: string[] } | null = null;

/**
 * The headlines, cached for five minutes. A feed that is down costs its own
 * headlines and is named in `failed` - it never costs the others.
 */
export async function headlines(limit = 8, now = Date.now()): Promise<{ items: Headline[]; failed: string[] }> {
  if (cache && now - cache.at < TTL_MS) return { items: cache.items.slice(0, limit), failed: cache.failed };

  const failed: string[] = [];
  const lists = await Promise.all(FEEDS.map(async ({ source, url }) => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return parseFeed(await r.text(), source);
    } catch (e) {
      console.warn(`[web] ${source} feed failed: ${(e as Error).message}`);
      failed.push(source);
      return [];
    }
  }));

  const items = mergeHeadlines(lists, 30);
  // Only worth remembering if something actually came back.
  if (items.length) cache = { at: now, items, failed };
  return { items: items.slice(0, limit), failed };
}
