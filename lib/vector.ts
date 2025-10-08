import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

export type Chunk = {
  id: string;
  source: "NFPA 13-2022" | "NFPA 13R";
  page: number;
  text: string;
  embedding: number[];
};
export type Index = Chunk[];

// Page-level hit used for citations / pagination
export type PageHit = { source: string; page: number; score: number };

const ROOT = process.cwd();
const DEFAULT_INDEX = path.join(ROOT, "data", "index.json");
const INDEX_PATH = process.env.INDEX_PATH ? path.resolve(process.env.INDEX_PATH) : DEFAULT_INDEX;

// IMPORTANT: must match the model used during ingest
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";

let indexCache: Index | null = null;
let indexDimCache: number | null = null;

/** Load and validate the on-disk index; filter out any malformed rows. */
export async function getIndex(): Promise<Index> {
  if (indexCache) return indexCache;
  const raw = await fs.readFile(INDEX_PATH, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("index.json is empty or malformed.");
  }

  const firstWithEmb = parsed.find(
    (c: any) => Array.isArray(c?.embedding) && c.embedding.length > 0
  );
  if (!firstWithEmb) throw new Error("index.json has no valid embeddings.");

  const dim = firstWithEmb.embedding.length;
  const cleaned: Index = parsed.filter(
    (c: any) =>
      typeof c?.text === "string" &&
      Array.isArray(c?.embedding) &&
      c.embedding.length === dim
  );
  if (cleaned.length === 0) {
    throw new Error("index.json had embeddings, but none passed validation.");
  }
  if (cleaned.length !== parsed.length) {
    console.warn(
      `Filtered out ${parsed.length - cleaned.length} chunks with invalid embeddings/dimensions.`
    );
  }
  indexCache = cleaned;
  indexDimCache = dim;
  return indexCache!;
}

export function getIndexDim(index?: Index): number {
  if (indexDimCache) return indexDimCache;
  const arr = index || indexCache;
  const d = arr?.[0]?.embedding?.length;
  if (!d) throw new Error("index.json has no embeddings or is malformed.");
  indexDimCache = d;
  return d;
}

function sanitize(text: string) {
  return String(text ?? "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
}

export async function embedQuery(text: string): Promise<number[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const clean = sanitize(text);
  if (!clean) throw new Error("Empty question after sanitization.");

  const res = await client.embeddings.create({ model: EMBED_MODEL, input: clean });

  const dataArr = Array.isArray((res as any)?.data) ? (res as any).data : [];
  if (dataArr.length === 0) {
    throw new Error(`Embedding API returned no items (model=${EMBED_MODEL}).`);
  }
  const first = dataArr[0];
  const emb = Array.isArray(first?.embedding) ? first.embedding : null;
  if (!emb) {
    throw new Error(
      `Embedding API returned an item with no 'embedding' array (model=${EMBED_MODEL}).`
    );
  }
  return emb as number[];
}

// ---------- Similarity + retrieval helpers ----------

function dot(a: number[], b: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
function norm(a: number[]) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}
function cosine(a: number[], b: number[]) {
  const d = norm(a) * norm(b);
  return d === 0 ? 0 : dot(a, b) / d;
}

/** Classic topK over chunks (kept around if you want it). */
export function topK(index: Index, queryEmb: number[], k: number) {
  return index
    .map((ch) => ({ ...ch, score: cosine(queryEmb, ch.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Loose tokenization for keyword scoring. */
function tokenize(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\-". ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Light keyword score to help with table-ish queries. */
export function keywordScore(text: string, query: string) {
  const q = tokenize(
    query
      .replace(/\b(\d+)\s*("|inches|inch|in)\b/gi, (_m, n) => `${n}"`)
      .replace(/\btrapeze\b/gi, "trapeze hanger support")
      .replace(/\bmain\b/gi, "pipe piping main")
      .replace(/\bspan\b/gi, "span spacing distance")
      .replace(/\btable\b/gi, "table")
  );
  if (!q.length) return 0;
  const tset = new Set(tokenize(text));
  let hits = 0;
  for (const tok of q) if (tset.has(tok)) hits++;
  return hits / q.length; // 0..1
}

/** Hybrid page selection: combine cosine (normalized) + keywordScore. */
export function hybridPages(
  index: Index,
  queryEmb: number[],
  query: string,
  pagesWanted = 4
): PageHit[] {
  const scored = index.map((ch) => {
    const cos = (cosine(queryEmb, ch.embedding) + 1) / 2; // [-1..1] -> [0..1]
    const kw = keywordScore(ch.text, query);
    const score = 0.7 * cos + 0.3 * kw;
    return { source: ch.source, page: ch.page, score };
  });

  // roll-up by (source,page) with max score
  const byPage = new Map<string, PageHit>();
  for (const s of scored) {
    const key = `${s.source}::${s.page}`;
    const cur = byPage.get(key);
    if (!cur || s.score > cur.score) byPage.set(key, s);
  }

  return Array.from(byPage.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, pagesWanted);
}

/** Include neighbor pages (±radius) and keep a reasonable score for them. */
export function withNeighbors(pages: PageHit[], radius = 1): PageHit[] {
  const out = new Map<string, PageHit>();
  for (const p of pages) {
    // base page
    out.set(`${p.source}::${p.page}`, { ...p });
    // neighbors
    for (let d = -radius; d <= radius; d++) {
      if (d === 0) continue;
      const page = p.page + d;
      if (page <= 0) continue;
      const key = `${p.source}::${page}`;
      // discount neighbor score slightly by distance
      const neighborScore = Math.max(0, p.score * (1 - Math.abs(d) * 0.05));
      const cur = out.get(key);
      if (!cur || neighborScore > cur.score) {
        out.set(key, { source: p.source, page, score: neighborScore });
      }
    }
  }
  return Array.from(out.values()).sort((a, b) => b.score - a.score);
}

/** Concatenate all chunks from selected pages into a single context string. */
export function buildContextFromPages(
  index: Index,
  pages: { source: string; page: number }[],
  maxChars = 18000
) {
  const wanted = new Set(pages.map((p) => `${p.source}::${p.page}`));
  const parts: string[] = [];
  for (const ch of index) {
    const key = `${ch.source}::${ch.page}`;
    if (wanted.has(key)) {
      parts.push(`SOURCE: ${ch.source} p.${ch.page}\n${ch.text}`);
      if (parts.join("\n\n---\n\n").length > maxChars) break;
    }
  }
  return parts.join("\n\n---\n\n");
}
