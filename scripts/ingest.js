// scripts/ingest.js
import fs from "fs/promises";
import path from "path";
import OpenAI from "openai";
import dotenv from "dotenv";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
dotenv.config();

const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function ensureDir(dir) { try { await fs.mkdir(dir, { recursive: true }); } catch {} }
async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }

function sanitizeText(t) {
  if (t == null) return "";
  let s = String(t);
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " "); // strip control chars
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 12000) s = s.slice(0, 12000);
  return s;
}

async function extractWithPdfjs(file) {
  const buf = await fs.readFile(file);
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength); // pdfjs wants Uint8Array
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it) => it.str).join(" ");
    pages.push({ page: i, text });
  }
  return pages;
}

function chunkify(pages, maxLen = 1200) {
  const chunks = [];
  for (const p of pages) {
    const words = (p.text || "").split(/\s+/);
    let cur = [];
    for (const w of words) {
      cur.push(w);
      if (cur.join(" ").length > maxLen) {
        chunks.push({ page: p.page, text: cur.join(" ") });
        cur = cur.slice(Math.floor(cur.length * 0.2)); // 20% overlap
      }
    }
    if (cur.length) chunks.push({ page: p.page, text: cur.join(" ") });
  }
  return chunks;
}

async function embedBatch(texts) {
  // No filtering here — alignment must match the batch exactly.
  const res = await client.embeddings.create({ model: EMBED_MODEL, input: texts });
  if (!res || !Array.isArray(res.data) || res.data.length !== texts.length) {
    throw new Error(
      `Embedding API returned unexpected size: got ${res?.data?.length ?? "?"}, expected ${texts.length}`
    );
  }
  return res.data.map((d) => d.embedding);
}

(async function main() {
  const dataDir = path.join(process.cwd(), "data");
  await ensureDir(dataDir);

  const pdf13Path  = process.env.PDF_13_PATH  || path.join(dataDir, "NFPA_13-2022.pdf");
  const pdf13rPath = process.env.PDF_13R_PATH || path.join(dataDir, "NFPA_13R.pdf");

  if (!(await exists(pdf13Path)) || !(await exists(pdf13rPath))) {
    throw new Error(
      `Missing PDFs.\nExpected either:\n  data/NFPA_13-2022.pdf and data/NFPA_13R.pdf\n` +
      `or set absolute paths in .env.local:\n  PDF_13_PATH=/abs/path/NFPA 13-2022.pdf\n  PDF_13R_PATH=/abs/path/NFPA 13R.pdf`
    );
  }

  const [pages13, pages13r] = await Promise.all([
    extractWithPdfjs(pdf13Path),
    extractWithPdfjs(pdf13rPath),
  ]);

  const rawAll = [
    ...chunkify(pages13).map((c, i) => ({ id: `13-${i}`,  source: "NFPA 13-2022", ...c })),
    ...chunkify(pages13r).map((c, i) => ({ id: `13R-${i}`, source: "NFPA 13R",    ...c })),
  ];

  // Sanitize first; drop empty/near-empty chunks BEFORE embedding (keeps alignment)
  const MIN_LEN = 20;
  const all = rawAll
    .map((c) => ({ ...c, text: sanitizeText(c.text) }))
    .filter((c) => c.text.length >= MIN_LEN);

  const dropped = rawAll.length - all.length;
  if (dropped > 0) {
    console.log(`Dropped ${dropped} empty/short chunks prior to embedding.`);
  }

  // Embed in fixed-size batches
  const batchSize = 64;
  for (let i = 0; i < all.length; i += batchSize) {
    const batch = all.slice(i, i + batchSize);
    const embs = await embedBatch(batch.map((b) => b.text));
    batch.forEach((b, j) => (b.embedding = embs[j]));
    process.stdout.write(`Embedded ${Math.min(i + batchSize, all.length)} / ${all.length}\r`);
  }

  // Write only well-formed entries
  const index = all
    .filter((x) => Array.isArray(x.embedding) && x.embedding.length > 0)
    .map(({ id, source, page, text, embedding }) => ({ id, source, page, text, embedding }));

  await fs.writeFile(path.join(dataDir, "index.json"), JSON.stringify(index));
  console.log(`\nIndex saved to data/index.json (${index.length} chunks) using model ${EMBED_MODEL}`);
})().catch((err) => {
  console.error(err?.stack || err);
  process.exit(1);
});
